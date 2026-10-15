/** Match only explicit volume names within one verified notice, never similar titles. */
export type VolumeDocument={id:string;filename:string;notice_key:string;original_hash:string|null};
export function volumeName(filename:string){
 const name=filename.replace(/(?:\.p7[sm])+$/i,'').normalize('NFC');
 let m=/^(.*)\.part(\d+)\.rar$/i.exec(name);
 if(m)return {family:'rar',base:m[1]!,index:Number(m[2]),name};
 m=/^(.*)\.z(\d+)$/i.exec(name);
 if(m)return {family:'zip',base:m[1]!,index:Number(m[2]),name};
 m=/^(.*)\.zip$/i.exec(name);
 return m?{family:'zip',base:m[1]!,index:0,name}:null;
}
export function volumeGroup<T extends VolumeDocument>(current:T,documents:T[]){
 const key=volumeName(current.filename);if(!key)return null;
 const members=documents.flatMap(d=>{const v=volumeName(d.filename);return v&&d.notice_key===current.notice_key&&v.family===key.family&&v.base===key.base?[{document:d,...v}]:[];});
 if(key.family==='zip'&&!members.some(m=>m.index>0))return null;
 const ordered=members.sort((a,b)=>(a.index||Infinity)-(b.index||Infinity));
 const indices=ordered.filter(m=>m.index>0).map(m=>m.index);
 if(!indices.length||indices.some((n,i)=>n!==i+1)||key.family==='zip'&&members.filter(m=>m.index===0).length!==1)
  throw Error('Formatul arhivei pe volume este incomplet sau ambiguu. Verifică lista originalelor.');
 const root=key.family==='rar'?ordered[0]!:ordered.at(-1)!;
 return {family:key.family,root:root.document,members:ordered.map(m=>m.document),name:key.base+(key.family==='rar'?'.rar':'.zip')};
}
