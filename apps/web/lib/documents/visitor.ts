import {createHmac} from 'node:crypto';

/** Anyone may ask for a file (owner, 3 November 2026). A visitor without an account is counted by a key of
 * the address Caddy established (never a caller's X-Forwarded-For), hashed with the server secret and the
 * hour, so the queue keeps no address. */
export function documentVisitorKey(request:Request,secret:string,production:boolean,now=new Date()):string{
 const address=production?request.headers.get('x-feedback-client-ip')||'unknown':'local';
 return 'visitor:'+createHmac('sha256',secret).update(`documents:${now.toISOString().slice(0,13)}:${address.slice(0,128)}`).digest('hex').slice(0,32);
}
