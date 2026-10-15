/** Local, explainable document classification. It describes a document's role,
 * never the legal validity of a contract or the truth of its contents. */
export const CLASSIFICATION_VERSION = 1;
export const DOCUMENT_CATEGORIES = [
 {id:'specifications',label:'Caiete de sarcini',icon:'document'},
 {id:'clarifications',label:'Clarificări și modificări',icon:'question'},
 {id:'technical',label:'Documentație tehnică',icon:'chart'},
 {id:'participation',label:'Participare și formulare',icon:'list'},
 {id:'templates',label:'Modele de contract',icon:'document'},
 {id:'award',label:'Evaluare și atribuire',icon:'checkCircle'},
 {id:'contracts',label:'Contracte și acte adiționale',icon:'document'},
 {id:'unknown',label:'Neclasificate',icon:'question'},
] as const;
export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number]['id'];
export type ClassificationEvidence = {source:'filename'|'text';value:string;page?:number};
export type Classification = {version:number;categories:DocumentCategory[];method:'filename'|'text'|'contents'|'unknown'|'manual';evidence:ClassificationEvidence[];parts?:ClassifiedPart[]};
export type ClassifiedPart = {name:string;firstPage?:number|undefined;pages?:number|undefined;categories:DocumentCategory[];method:Classification['method'];evidence:ClassificationEvidence[]};
export type ClassifiablePart = {name:string;firstPage?:number;pages?:number;error?:string};
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const rules: [DocumentCategory,RegExp][] = [
 ['clarifications',/\b(?:clarificar\w*|raspuns\w*|rectificar\w*|erat[ae]|corrigend\w*)\b/],
 ['templates',/\b(?:(?:model\w*|proiect\w*|draft)\s+(?:de\s+)?contract\w*|clauze\s+contractuale|conditii\s+(?:generale\s+|speciale\s+)?contractuale)\b/],
 ['participation',/\b(?:formular\w*|duae|fisa\s+(?:de\s+)?date|instructiuni\s+(?:pentru\s+)?ofertanti|declarati[ae]\s+(?:pe\s+proprie|privind))\b/],
 ['specifications',/\bcaiet(?:ul|e|ele)?\s+(?:de\s+)?sarcin\w*\b/],
 ['award',/\b(?:raport(?:ul)?\s+(?:procedurii|de\s+atribuire)|comunicare\w*\s+(?:a\s+)?rezultat\w*|decizi\w*\s+(?:(?:de|privind)\s+)?(?:atribuire|anulare)|proces\s+verbal\s+(?:de\s+)?(?:deschidere|evaluare))\b/],
 ['technical',/\b(?:proiect\w*\s+tehnic\w*|documentati\w*\s+(?:tehnic\w*|economic\w*)|deviz\w*|planse\w*|fise?\s+tehnice?|memorii?|memoriu|dali|bim|isam|list\w*\s+(?:de\s+)?cantitati|studi[ui]\w*|expertiz\w*|evaluare\s+(?:energetica|tehnica))\b/],
 ['contracts',/\b(?:act(?:e|ul)?\s+aditional\w*|contract(?:ul)?\s+(?:de\s+)?(?:furnizare|lucrari|servicii|achizitie|semnat)|contract\s*\d+)\b/],
];
function match(s:string,abbreviations:boolean):DocumentCategory|null{
 const normalized=fold(s).replace(/[_\-–—.]+/g,' ').replace(/\s+/g,' ').trim();
 for(const [category,re] of rules.slice(0,3))if(re.test(normalized))return category;
 // A standalone CS near the start is a candidate; not a company/institution name
 // in the middle of a filename, and never stronger than clarification/template.
 if(abbreviations&&/^(?:\d+\s+){0,3}(?:anex[aă]\s+\d*\s*)?cs(?:\s|$)/.test(normalized))return 'specifications';
 for(const [category,re] of rules.slice(3))if(re.test(normalized))return category;
 return null;
}
export function classifyDocumentName(filename:string):Classification{
 const name=filename.split(/[\\/]/).at(-1)??filename;
 const category=match(name,true);
 return {version:CLASSIFICATION_VERSION,categories:[category??'unknown'],method:category?'filename':'unknown',evidence:category?[{source:'filename',value:name.slice(0,500)}]:[]};
}
export function classifyDocument(filename:string,text?:{page:number;text:string}):Classification{
 const initial=classifyDocumentName(filename);if(!text)return initial;
 // Only headings at the beginning can override a filename. Body references such
 // as a tenderer's declaration mentioning a CS are not a document's role.
 const heading=text.text.slice(0,2500).split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,14);
 for(const line of heading){
  if(line.length>180)continue;
  const candidate=fold(line).replace(/[_\-–—.]+/g,' ').replace(/\s+/g,' ').trim();
  if(!/^(?:\d+\s+)?(?:caiet|raspuns|clarific|rectific|erat|model|proiect\s+(?:de\s+)?contract|contract|act\s+aditional|fisa\s+(?:de\s+)?date|formular|duae|instructiuni|raport(?:ul)?\s+(?:procedurii|de\s+atribuire)|comunicare|decizi|proces\s+verbal|memoriu|deviz|liste\s+(?:de\s+)?cantitati)/.test(candidate))continue;
  const category=match(line,false);if(!category)continue;
  // A filename explicitly describing a response/template remains that role even
  // if its first page quotes the title of a specification/contract.
  if(['clarifications','templates','participation'].includes(initial.categories[0]!)&&category!==initial.categories[0])return initial;
  return {version:CLASSIFICATION_VERSION,categories:[category],method:'text',evidence:[{source:'text',value:line.slice(0,180),page:text.page}]};
 }
 return initial;
}
export function classifyDocumentContents(filename:string,contents:ClassifiablePart[]|null|undefined,pages:{page:number;text:string}[]=[]):Classification{
 const root=classifyDocument(filename,pages.find(p=>p.page===1));
 if(!contents?.length)return root;
 const isContainer=contents.length>1||contents.some(p=>p.name.includes(' / '));
 if(!isContainer)return root;
 const parts:ClassifiedPart[]=contents.map(p=>{const c=classifyDocument(p.name,pages.find(x=>x.page===p.firstPage));return {name:p.name,firstPage:p.firstPage,pages:p.pages,categories:c.categories,method:c.method,evidence:c.evidence};});
 const found=new Set<DocumentCategory>(parts.flatMap(p=>p.categories).filter(c=>c!=='unknown'));
 const categories=DOCUMENT_CATEGORIES.map(c=>c.id).filter(c=>found.has(c));
 if(parts.some(p=>p.categories.includes('unknown')))categories.push('unknown');
 return {version:CLASSIFICATION_VERSION,categories:categories.length?categories:['unknown'],method:'contents',evidence:root.evidence,parts};
}
export const hasSpecifications=(c:Pick<Classification,'categories'>|null|undefined)=>c?.categories.includes('specifications')??false;
export const classificationPriority=(c:Classification)=>hasSpecifications(c)?0:100;
export const categoryLabel=(id:DocumentCategory)=>DOCUMENT_CATEGORIES.find(c=>c.id===id)!.label;
export function classificationDescription(c:Classification){
 return c.method==='filename'?'Încadrare preliminară din numele fișierului.':c.method==='text'?'Identificat dintr-un titlu din textul extras.':c.method==='contents'?'Categorii identificate în documentele din arhivă.':c.method==='manual'?'Categorie corectată de administrator.':'Categoria nu este încă identificată.';
}
