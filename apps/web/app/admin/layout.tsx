import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {auth} from '@/lib/auth';
import CollectionDashboard from './CollectionDashboard';
import './collection.css';
import './navigation.css';
export const dynamic='force-dynamic';
export default async function AdminLayout({children}:{children:React.ReactNode}){
 const session=await auth.api.getSession({headers:await headers()});
 if(!session||(session.user as {role?:string}).role!=='admin')redirect('/login');
 return <CollectionDashboard>{children}</CollectionDashboard>;
}
