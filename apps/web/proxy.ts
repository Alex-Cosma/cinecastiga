import {NextResponse,type NextRequest} from 'next/server';
import {createDb,publicSiteGate,type DbSql} from '@seap/db';
const g=globalThis as unknown as {maintenanceSql?:DbSql;maintenanceGate?:{at:number;open:Promise<boolean>}};
/**
 * One reading of the gate serves every request for this long (launch audit, 12 November 2026): it was read from
 * Postgres on each page, prefetch, API call and map file, hundreds of queries a second in a spike. A closed answer, an
 * error included, is kept as long: the site stays prudent (owner). Concurrent requests share the reading in flight.
 */
export const GATE_TTL_MS=1500;
function siteOpen():Promise<boolean>{
 const now=Date.now(),last=g.maintenanceGate;
 if(last&&now-last.at<GATE_TTL_MS)return last.open;
 // Its own two connections, never the shared pool: the gate answers even while pages wait for one.
 const open=(async()=>{try{const q=g.maintenanceSql??=createDb(undefined,{max:2}).sql;return await publicSiteGate(q);}catch{/* Fail closed rather than expose a partially published snapshot. */return false;}})();
 g.maintenanceGate={at:now,open};
 return open;
}
// Admin pages/API retain their own authentication and role checks. Keeping the
// login path open does not grant permission to control or bypass maintenance.
export function maintenanceExempt(path:string){return path==='/admin'||path.startsWith('/admin/')||path==='/api/admin/collection'||path==='/api/admin/feedback'||path==='/login'||path==='/api/health'||path.startsWith('/api/auth/');}
// Server layouts receive neither the path below them nor the query: an entity page's layout above its route ghost reads
// them here to redirect a merged identity to its canonical id before anything streams (lib/entity-navigation.ts).
function pass(request:NextRequest){
 if(!request.nextUrl.pathname.startsWith('/entitati/'))return NextResponse.next();
 const headers=new Headers(request.headers);
 headers.set('x-seap-path',request.nextUrl.pathname);headers.set('x-seap-search',request.nextUrl.search);
 return NextResponse.next({request:{headers}});
}
export async function proxy(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(maintenanceExempt(path))return NextResponse.next();
 // Open without maintenance, and during a publication's drain and backup (see
 // publicSiteGate); closed from the verified backup until the verified reopen.
 if(await siteOpen())return pass(request);
 const headers={'Cache-Control':'no-store, max-age=0','Retry-After':'300','X-Robots-Tag':'noindex'};
 if(path.startsWith('/api/'))return NextResponse.json({error:'Datele sunt în curs de actualizare. Revino după încheierea verificărilor.'},{status:503,headers});
 return new NextResponse(`<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Actualizăm datele · cinecâștigă?</title><style>body{margin:0;background:#f7f8f2;color:#243a30;font:17px/1.7 system-ui,sans-serif}main{max-width:620px;margin:16vh auto;padding:28px}h1{font-size:36px;line-height:1.2;letter-spacing:-.025em}a{color:#204c3c;text-underline-offset:4px}small{color:#3f5043}</style><main><b>cinecâștigă?</b><h1>Actualizăm datele.</h1><p>Revino puțin mai târziu.</p><small><a href="/admin">Acces administrator</a></small></main></html>`,{status:503,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
// The map's outlines under /geo are static files with no data of the archive: they skip the gate.
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|pdfjs/|fonts/|geo/).*)']};
