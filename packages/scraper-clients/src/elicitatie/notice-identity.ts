/** Public participation IDs belong to endpoint namespaces, not one global counter.
 * RFQ, simplified notices and SAD share the RFQInvitation endpoint/counter. */
export function participationNamespace(type: unknown): 'cn'|'dc'|'pc'|'rfq' {
 switch(type){
  case 2:return 'cn';
  case 6:return 'dc';
  case 7:return 'pc';
  case 12:case 17:case 19:return 'rfq';
  default:throw Error('Identitatea anunțului: tip de participare necunoscut.');
 }
}
export function participationKey(id:number,type:unknown):string {
 if(!Number.isSafeInteger(id)||id<=0)throw Error('Identitatea anunțului: identificator public nevalid.');
 return `${participationNamespace(type)}:${id}`;
}
export function noticeArchiveKey(family:'tenders'|'awards',id:number,type:unknown):string {
 return family==='tenders'?`tender:${participationKey(id,type)}`:`award:${id}`;
}
