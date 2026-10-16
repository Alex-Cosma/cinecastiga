import {gzipSync} from 'node:zlib';

/** Test-only builders: synthetic eForms award notices and OJ S daily packages (.tar.gz). */
export interface FixtureNotice {publication:string;ojs:string;day:string;buyer?:string;winner?:string;type?:string;gazette?:string}
export function tedNoticeXml({publication,ojs,day,buyer='ROU',winner='ROU',type='can-standard',gazette}:FixtureNotice){
 const [n,y]=publication.split('-'),org=(id:string,country:string,name:string)=>`<efac:Organization><efac:Company><cac:PartyIdentification><cbc:ID>${id}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>${name}</cbc:Name></cac:PartyName><cac:PostalAddress><cac:Country><cbc:IdentificationCode listName="eforms-country">${country}</cbc:IdentificationCode></cac:Country></cac:PostalAddress></efac:Company></efac:Organization>`;
 return `<?xml version="1.0" encoding="UTF-8"?><ContractAwardNotice xmlns="urn:oasis:names:specification:ubl:schema:xsd:ContractAwardNotice-2"><cbc:ID schemeName="notice-id">fixture-${publication}</cbc:ID><cbc:NoticeTypeCode listName="result">${type}</cbc:NoticeTypeCode>`
  +`<cac:ContractingParty><cac:Party><cac:PartyIdentification><cbc:ID>ORG-0001</cbc:ID></cac:PartyIdentification></cac:Party></cac:ContractingParty>`
  +`<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><efext:EformsExtension><efac:NoticeResult><cbc:TotalAmount currencyID="RON">1000</cbc:TotalAmount></efac:NoticeResult>`
  +`<efac:Organizations>${org('ORG-0001',buyer,'Autoritate fixture')}${org('ORG-0002',winner,'Câștigător fixture')}</efac:Organizations>`
  +`<efac:Publication><efbc:NoticePublicationID schemeName="ojs-notice-id">${n!.padStart(8,'0')}-${y}</efbc:NoticePublicationID><efbc:GazetteID schemeName="ojs-id">${gazette??`${Number(ojs.slice(4))}/${ojs.slice(0,4)}`}</efbc:GazetteID><efbc:PublicationDate>${day}+02:00</efbc:PublicationDate></efac:Publication>`
  +`</efext:EformsExtension></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions></ContractAwardNotice>`;
}
export const tedNoticeFile=(publication:string)=>{const [n,y]=publication.split('-');return `${n!.padStart(8,'0')}_${y}.xml`;};

export interface TarEntry {name:string;data?:Buffer|string;type?:string;size?:number;magic?:'posix'|'gnu';prefix?:string}
export function tarHeader({name,data,type='0',size,magic='posix',prefix=''}:TarEntry){
 const h=Buffer.alloc(512),put=(s:string,at:number,len:number)=>h.write(s.slice(0,len),at,len,'utf8');
 const length=size??(data===undefined?0:Buffer.byteLength(data));
 put(name,0,100);put('0000644\0',100,8);put('0000000\0',108,8);put('0000000\0',116,8);
 put(length.toString(8).padStart(11,'0')+'\0',124,12);put('15000000000\0',136,12);
 h.fill(0x20,148,156);put(type,156,1);
 if(magic==='posix'){put('ustar\0',257,6);put('00',263,2);put(prefix,345,155);}else put('ustar  \0',257,8);
 let sum=0;for(const b of h)sum+=b;put(sum.toString(8).padStart(6,'0')+'\0 ',148,8);
 return h;
}
const pad=(b:Buffer)=>Buffer.concat([b,Buffer.alloc((512-b.length%512)%512)]);
/** Uncompressed tar: each entry, then the two zero blocks and record padding (like GNU tar). */
export function tar(entries:TarEntry[],{end=true}:{end?:boolean}={}){
 const parts=entries.flatMap(e=>{const data=e.data===undefined?Buffer.alloc(0):Buffer.from(e.data);return [tarHeader(e),pad(data)];});
 if(end)parts.push(Buffer.alloc(1024));
 const body=Buffer.concat(parts);
 return end?Buffer.concat([body,Buffer.alloc((10240-body.length%10240)%10240)]):body;
}
export const tarGz=(entries:TarEntry[],options?:{end?:boolean})=>gzipSync(tar(entries,options));

/** One OJ S issue: its Romanian notices plus foreign notices that the filters must ignore. */
export function tedDailyPackage(ojs:string,day:string,romanian:string[],{dir=`${day.replaceAll('-','')}_${ojs.slice(0,4)}${Number(ojs.slice(4))}`}={}){
 const foreignBuyer=`${900000+Number(ojs.slice(4))}-${ojs.slice(0,4)}`,foreign=`${800000+Number(ojs.slice(4))}-${ojs.slice(0,4)}`;
 const entries:TarEntry[]=[{name:`${dir}/`,type:'5'},
  ...romanian.map(p=>({name:`${dir}/${tedNoticeFile(p)}`,data:tedNoticeXml({publication:p,ojs,day})})),
  // Romanian winner abroad: passes the bulk text pre-filter, but the buyer is not Romanian.
  {name:`${dir}/${tedNoticeFile(foreignBuyer)}`,data:tedNoticeXml({publication:foreignBuyer,ojs,day,buyer:'BGR'})},
  {name:`${dir}/${tedNoticeFile(foreign)}`,data:tedNoticeXml({publication:foreign,ojs,day,buyer:'DEU',winner:'DEU'})},
  {name:`${dir}/README.txt`,data:'not a notice'}];
 return {bytes:tarGz(entries),filename:`${day.replaceAll('-','')}_${ojs.slice(0,4)}${Number(ojs.slice(4))}.tar.gz`};
}
