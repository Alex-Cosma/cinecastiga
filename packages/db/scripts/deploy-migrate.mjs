import {migrationHistoryMatch} from './migration-history.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
import {readMigrationFiles} from 'drizzle-orm/migrator';

// No fallback to the development database. Credentials are separate fields so
// special characters in the password never need URL encoding or shell parsing.
for(const name of ['PGHOST','PGDATABASE','PGUSER','PGPASSWORD'])if(!process.env[name])throw Error(`${name} is required`);
const folder=fileURLToPath(new URL('../migrations/',import.meta.url));
const sql=postgres({host:process.env.PGHOST,port:Number(process.env.PGPORT??5432),database:process.env.PGDATABASE,username:process.env.PGUSER,password:process.env.PGPASSWORD,max:1,connect_timeout:15,onnotice:()=>{},connection:{application_name:'seap-deploy-migrations',lock_timeout:'10s',statement_timeout:'15min'}});
let locked=false;
try{
 const [lock]=await sql`select pg_try_advisory_lock(729114,2) acquired`;
 if(!lock.acquired)throw Error('Another deployment is applying database migrations. Retry after it finishes.');locked=true;
 const [role]=await sql`select 1 from pg_roles where rolname='seap_web'`;
 if(!role)throw Error('The seap_web role is missing. Complete the documented initial database/role setup first.');
 const migrations=readMigrationFiles({migrationsFolder:folder});
 const [history]=await sql`select to_regclass('drizzle.__drizzle_migrations') present`;
 const applied=history.present?await sql`select hash,created_at from drizzle.__drizzle_migrations order by created_at,id`:[];
 // Refuse silent skips after edited history, an older checkout, or a partial restore.
 for(let i=0;i<applied.length;i++){
  const match=migrationHistoryMatch(applied[i],migrations[i],i);
  if(!match)throw Error('Migration history differs from this release. Restore/inspect the matching history before deploying.');
  if(match==='legacy-national-stats-nullability'){
   const [state]=await sql`select exists(select 1 from pg_attribute where attrelid=to_regclass('marts.national_stats') and attname='year' and not attnotnull and not attisdropped) nullable,exists(select 1 from pg_indexes where schemaname='marts' and tablename='national_stats' and indexname='national_stats_kind_year_idx' and indexdef like '%USING btree (kind, year)%') indexed,exists(select 1 from pg_constraint where conrelid=to_regclass('marts.national_stats') and contype='p') has_pk`;
   if(!state.nullable||!state.indexed||state.has_pk)throw Error('Known legacy migration checksum found, but its corrected national_stats schema is missing. Inspect before deployment.');
   console.log('Verified historical migration0005 checksum and already-corrected nullable-year schema; history preserved.');
  }
 }
 if(!applied.length){
  const [existing]=await sql`select exists(select 1 from pg_tables where schemaname in ('core','raw','marts','reference','auth','app')) present`;
  if(existing.present)throw Error('Application tables exist without migration history. Restore the original drizzle history; automatic baselining is not allowed.');
 }
 console.log(`Database migrations: ${applied.length} applied, ${migrations.length-applied.length} pending.`);
 await migrate(drizzle(sql),{migrationsFolder:folder});
 // Refresh existing objects as well as defaults for future tables/sequences.
 // No role creation, password changes, or ingestion occurs during a deploy.
 const grants=await readFile(new URL('../../../infra/prod/app-grants.sql',import.meta.url),'utf8');
 await sql.begin(async tx=>{await tx.unsafe(grants);});
 console.log('Database migrations and application grants complete.');
}catch(error){console.error('Database migration failed:',error instanceof Error?error.message:'unknown error');process.exitCode=1;}
finally{if(locked)await sql`select pg_advisory_unlock(729114,2)`.catch(()=>{});await sql.end({timeout:5});}
