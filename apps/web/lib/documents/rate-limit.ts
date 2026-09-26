/** Global spacing is based on persisted attempt starts, including failures. */
export const SEAP_REQUEST_INTERVAL_MS=15_000;
export const SEAP_FILE_INTERVAL_MS=60_000;
export function sourceRequestDelay(now:number,lastRequest:number|null,lastFile:number|null,isFileDownload:boolean){
 return Math.max(0,lastRequest===null?0:lastRequest+SEAP_REQUEST_INTERVAL_MS-now,isFileDownload&&lastFile!==null?lastFile+SEAP_FILE_INTERVAL_MS-now:0);
}
