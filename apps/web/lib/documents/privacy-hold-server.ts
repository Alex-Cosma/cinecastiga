import {auth} from '../auth';

/** Only an administrator reads a withheld document: to decide whether it stays hidden. */
export async function mayReadWithheld(req:Request):Promise<boolean>{
 const session=await auth.api.getSession({headers:req.headers}).catch(()=>null);
 return !!session&&(session.user as {role?:string}).role==='admin';
}
