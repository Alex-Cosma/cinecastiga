import {NextResponse,type NextRequest} from 'next/server';
import {createDb,type DbSql} from '@seap/db';
const g=globalThis as unknown as {maintenanceSql?:DbSql};
// Admin pages/API retain their own authentication and role checks. Keeping the
// login path open does not grant permission to control or bypass maintenance.
export function maintenanceExempt(path:string){return path==='/admin'||path.startsWith('/admin/')||path==='/api/admin/collection'||path==='/api/admin/feedback'||path==='/login'||path==='/api/health'||path.startsWith('/api/auth/');}
export async function proxy(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(maintenanceExempt(path))return NextResponse.next();
 let maintenance=true;
 try{const q=g.maintenanceSql??=createDb().sql;const [row]=await q`select maintenance from app.collection_control where id=1`;maintenance=!row||row.maintenance;}catch{/* Fail closed rather than expose a partially published snapshot. */}
 if(!maintenance)return NextResponse.next();
 const headers={'Cache-Control':'no-store, max-age=0','Retry-After':'300','X-Robots-Tag':'noindex'};
 if(path.startsWith('/api/'))return NextResponse.json({error:'Datele sunt în curs de actualizare. Revino după încheierea verificărilor.'},{status:503,headers});
 return new NextResponse(`<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Actualizăm datele · cinecâștigă?</title><style>body{margin:0;background:#f7f8f2;color:#243a30;font:17px/1.7 system-ui,sans-serif}main{max-width:620px;margin:16vh auto;padding:28px}h1{font-size:36px;line-height:1.2;letter-spacing:-.025em}a{color:#204c3c;text-underline-offset:4px}small{color:#3f5043}</style><main><b>cinecâștigă?</b><h1>Actualizăm datele.<br>Revenim după verificare.</h1><p>Procesăm noile înregistrări și verificăm rezultatele înainte să le publicăm. Anchetele și dovezile tale sunt păstrate.</p><p>Te rugăm să revii puțin mai târziu.</p><small><a href="/admin">Acces administrator</a></small></main></html>`,{status:503,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|icon.svg|pdfjs/).*)']};
