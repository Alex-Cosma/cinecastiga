import {describe,it,expect} from 'vitest';
import {volumeGroup} from './volumes';
const d=(name:string,id=name,notice='17:1')=>({id,filename:name,notice_key:notice,original_hash:null});
describe('verified archive volume grouping',()=>{
 it('orders RAR volumes numerically within the same notice',()=>{
  const rows=Array.from({length:10},(_,i)=>d(`Proiect.part${10-i}.rar.p7s`));
  const g=volumeGroup(rows[0]!,[...rows,d('Proiect.part1.rar.p7s','foreign','17:2')]);
  expect(g?.members.map(x=>x.filename)).toEqual([...rows].reverse().map(x=>x.filename));expect(g?.root.id).toBe(rows[9]!.id);
 });
 it('requires consecutive ZIP segments and a final ZIP directory',()=>{
  const rows=[d('D.z02.p7s'),d('D.zip.p7s'),d('D.z01.p7s')];
  expect(volumeGroup(rows[0]!,rows)?.members.map(x=>x.filename)).toEqual(['D.z01.p7s','D.z02.p7s','D.zip.p7s']);
  expect(volumeGroup(rows[0]!,rows)?.root.id).toBe(rows[1]!.id);
  expect(()=>volumeGroup(rows[0]!,rows.slice(0,2))).toThrow('incomplet');
  expect(()=>volumeGroup(rows[0]!,[rows[0]!,rows[2]!])).toThrow('incomplet');
 });
 it('does not guess a common group for similar filenames or duplicate volumes',()=>{
  expect(volumeGroup(d('D.zip'),[d('D.zip'),d('D revised.z01')])).toBeNull();
  expect(()=>volumeGroup(d('D.part1.rar'),[d('D.part1.rar'),d('D.part01.rar')])).toThrow('ambiguu');
 });
});
