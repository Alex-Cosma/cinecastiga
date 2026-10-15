import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
/** Unpublished reporting: admins only (any viewer in local development). */
export async function canSeeStoryPreviews() {
  if(process.env.NODE_ENV==='development')return true;
  const session=await auth.api.getSession({headers:await headers()});
  return (session?.user as {role?:string}|undefined)?.role==='admin';
}
