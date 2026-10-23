import {sql} from 'drizzle-orm';
import {bigint,bigserial,boolean,check,customType,index,jsonb,smallint,text,timestamp,uuid} from 'drizzle-orm/pg-core';
import {martsSchema} from './marts.js';
/** Evidence inventory only: no candidate implicitly removes a source contract. */
export const contractIdentityCandidates=martsSchema.table('contract_identity_candidates',{
 id:text('id').primaryKey(),fingerprint:text('fingerprint').notNull(),
 status:text('status').notNull(),active:boolean('active').notNull().default(true),
 evidence:jsonb('evidence').notNull(),observedAt:timestamp('observed_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[check('contract_identity_status',sql`${t.status} in ('source_verified','needs_evidence','conflict')`)]);
/** Append-only snapshots: changes in source evidence never erase the previous finding. */
export const contractIdentityObservations=martsSchema.table('contract_identity_observations',{
 fingerprint:text('fingerprint').primaryKey(),candidateId:text('candidate_id').notNull().references(()=>contractIdentityCandidates.id),
 evidence:jsonb('evidence').notNull(),observedAt:timestamp('observed_at',{withTimezone:true}).notNull().defaultNow(),
});

/** Explicit approvals, bound to an immutable source verification. Additive only. */
export const contractIdentityDecisions=martsSchema.table('contract_identity_decisions',{
 candidateId:text('candidate_id').primaryKey().references(()=>contractIdentityCandidates.id),
 fingerprint:text('fingerprint').notNull().references(()=>contractIdentityObservations.fingerprint),
 canonicalContractId:bigint('canonical_contract_id',{mode:'bigint'}).notNull(),
 reason:text('reason').notNull(),approvedAt:timestamp('approved_at',{withTimezone:true}).notNull().defaultNow(),
});
export const contractIdentityMembers=martsSchema.table('contract_identity_members',{
 contractId:bigint('contract_id',{mode:'bigint'}).primaryKey(),
 candidateId:text('candidate_id').notNull().references(()=>contractIdentityDecisions.candidateId),
 snapshotHash:text('snapshot_hash').notNull(),
},t=>[index('contract_identity_members_candidate_idx').on(t.candidateId)]);

/** Append-only record of source-verified extensions and fingerprint renewals.
 * The original approval and every observation remain available. */
export const contractIdentityRevisions=martsSchema.table('contract_identity_revisions',{
 id:bigserial('id',{mode:'bigint'}).primaryKey(),
 candidateId:text('candidate_id').notNull().references(()=>contractIdentityCandidates.id),
 processingRunId:uuid('processing_run_id').notNull(),
 previousSnapshot:jsonb('previous_snapshot').notNull(),nextSnapshot:jsonb('next_snapshot').notNull(),
 verifiedAt:timestamp('verified_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('contract_identity_revisions_candidate_idx').on(t.candidateId)]);

/** Temporary financial exclusions, not duplicate approvals. Source records stay
 * intact; immutable observations and revisions preserve the decision trail. */
export const contractIdentityExclusions=martsSchema.table('contract_identity_exclusions',{
 contractId:bigint('contract_id',{mode:'bigint'}).primaryKey(),
 candidateId:text('candidate_id').notNull().references(()=>contractIdentityCandidates.id),
 fingerprint:text('fingerprint').notNull().references(()=>contractIdentityObservations.fingerprint),
 snapshotHash:text('snapshot_hash').notNull(),
 processingRunId:uuid('processing_run_id').notNull(),
 reviewedAt:timestamp('reviewed_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('contract_identity_exclusions_candidate_idx').on(t.candidateId)]);

/** Historical evidence restored from SHA-pinned public backups. Never replayed
 * as fresh source data: raw IDs belong to their original archive, not this DB. */
export const contractIdentityArchives=martsSchema.table('contract_identity_archives',{
 archiveKey:text('archive_key').primaryKey(),bundleSha256:text('bundle_sha256').notNull(),
 externalId:text('external_id').notNull(),source:text('source').notNull(),
 originalRawId:text('original_raw_id').notNull(),endpoint:text('endpoint').notNull(),
 contentHash:text('content_hash').notNull(),payload:jsonb('payload').notNull(),
 importedAt:timestamp('imported_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('contract_identity_archives_external_idx').on(t.externalId)]);

const xid8=customType<{data:string}>({dataType:()=>'xid8'});
/** Version of the four relations the current snapshot hashes read (migration
 * 0083): each transaction that writes core.contracts, core.awards,
 * core.contract_winners or core.entities stamps the single row with the next
 * sequence value and its transaction id, through statement triggers. Lets one
 * processing run reuse the hashes while nothing they read has changed
 * (SnapshotHashCache). Never written by application code. */
export const contractIdentitySourceVersion=martsSchema.sequence('contract_identity_source_version_seq');
export const contractIdentitySourceState=martsSchema.table('contract_identity_source_state',{
 id:smallint('id').primaryKey(),instance:uuid('instance').notNull().defaultRandom(),
 version:bigint('version',{mode:'bigint'}).notNull(),changedBy:xid8('changed_by'),
},t=>[check('contract_identity_source_state_single',sql`${t.id} = 1`)]);
