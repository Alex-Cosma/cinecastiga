import {createHmac} from 'node:crypto';
import {limitAddress} from '../client-address';

/** Requests need an account since 12 November 2026; kept for a future visitor path. A visitor is counted by a key of
 * the address Caddy established (never a caller's X-Forwarded-For), hashed with the server secret and the
 * hour, so the queue keeps no address. */
export function documentVisitorKey(request:Request,secret:string,production:boolean,now=new Date()):string{
 const address=limitAddress(request,production);
 return 'visitor:'+createHmac('sha256',secret).update(`documents:${now.toISOString().slice(0,13)}:${address}`).digest('hex').slice(0,32);
}
