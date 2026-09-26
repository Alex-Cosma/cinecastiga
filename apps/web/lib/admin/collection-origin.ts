/** Use the server's configured public origin behind Caddy. Forwarded/request
 * hosts are not an authorization source; never trust an arbitrary Origin. */
export function validCollectionOrigin(req:Request,publicUrl?:string){
 const origin=req.headers.get('origin');
 if(!origin||req.headers.get('sec-fetch-site')==='cross-site')return false;
 try{return origin===new URL(publicUrl??req.url).origin;}catch{return false;}
}
