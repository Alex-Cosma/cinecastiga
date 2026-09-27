import {createHash} from 'node:crypto';
/** Failure-only diagnostics. Secrets and transient download URLs are never retained. */
const secretKey = /authorization|cookie|token|password|passwd|secret|session|noticeDocumentUrl/i;
export function diagnosticText(text: string): string {
 return text.replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,'$1[redacted]@')
  .replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [redacted]')
  .replace(/(\/noticedoc\/)[a-z0-9]+/gi,'$1[redacted]')
  .replace(/((?:["']?(?:[\w-]*(?:token|password|passwd|secret|cookie|session)[\w-]*|authorization)["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;<>]+)/gi,'$1[redacted]');
}
export function sanitizeDiagnostics(value: unknown, depth=0): unknown {
 if(value===undefined)return undefined;
 if(depth>20)return '[depth limit]';
 if(value===null||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='string')return diagnosticText(value).replace(/\u0000/g,'');
 if(Array.isArray(value))return value.map(v=>sanitizeDiagnostics(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,secretKey.test(k)?'[redacted]':sanitizeDiagnostics(v,depth+1)]));
 return String(value);
}
export function diagnosticError(error: unknown, depth=0): unknown {
 if(depth>6)return {truncated:true};
 if(!(error instanceof Error))return sanitizeDiagnostics(error);
 const extra=error as Error&{code?:unknown;errno?:unknown;syscall?:unknown;address?:unknown;port?:unknown;errors?:unknown[]};
 return sanitizeDiagnostics({name:error.name,message:error.message,stack:error.stack,code:extra.code,errno:extra.errno,syscall:extra.syscall,address:extra.address,port:extra.port,
  ...(error.cause?{cause:diagnosticError(error.cause,depth+1)}:{}),...(extra.errors?{errors:extra.errors.map(e=>diagnosticError(e,depth+1))}:{})});
}
export interface CollectionDiagnostics {request?:unknown;response?:unknown;phase?:string;context?:unknown;[key:string]:unknown}
export class CollectionTransportError extends Error {
 constructor(error:unknown,public diagnostics:CollectionDiagnostics){super(error instanceof Error?error.message:String(error),{cause:error});this.name='CollectionTransportError';}
}
export function responseDiagnosticBody(bytes: Uint8Array, complete: boolean) {
 const text=Buffer.from(bytes).toString('utf8');
 let body:unknown=text;try{body=JSON.parse(text);}catch{}
 return {body:sanitizeDiagnostics(body),receivedBytes:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex'),complete,encoding:'utf8',redacted:true};
}
