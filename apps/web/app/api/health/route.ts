import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
// Process health is separate from publication availability (which may be 503).
export function GET(){return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});}
