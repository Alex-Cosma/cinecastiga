import {describe,it,expect} from 'vitest';
import {classifyDocumentName as name,classifyDocument,classifyDocumentContents as contents,hasSpecifications} from './classification';
describe('document role, not legal validity',()=>{
 it.each(['Caiet de sarcini iluminat.pdf.p7s','CAIETUL DE SARCINI.pdf','02_CS_echipamente.docx.p7s','CS proiect tehnic.pdf'])('prioritizes specifications: %s',s=>expect(hasSpecifications(name(s))).toBe(true));
 it.each(['Raspuns la clarificari caiet de sarcini.pdf','CS_Clarificare din oficiu.pdf','01_CS_Raspuns_PH.pdf'])('keeps a response distinct from its subject: %s',s=>expect(name(s).categories).toEqual(['clarifications']));
 it.each(['Model contract semnat.docx','Proiect de contract.pdf','Condiții contractuale.pdf'])('does not imply a template is an executed contract: %s',s=>expect(name(s).categories).toEqual(['templates']));
 it('does not classify engineering evaluations as procurement evaluations',()=>{expect(name('Anexa evaluare energetica.xlsx').categories).toEqual(['technical']);expect(name('Documentatie de atribuire.pdf').categories).toEqual(['unknown']);expect(name('Raportul procedurii.pdf').categories).toEqual(['award']);});
 it('uses an explicit heading, not a CS mention in body prose',()=>{
  expect(classifyDocument('scan.pdf',{page:1,text:'MUNICIPIUL EXEMPLU\nCAIET DE SARCINI\nCerințe'})).toMatchObject({categories:['specifications'],method:'text',evidence:[{page:1,value:'CAIET DE SARCINI'}]});
  expect(classifyDocument('scan.pdf',{page:1,text:'Declarăm că am citit caietul de sarcini și ne asumăm condițiile.'}).categories).toEqual(['unknown']);
  expect(classifyDocument('Formulare.docx',{page:1,text:'CAIET DE SARCINI'}).categories).toEqual(['participation']);
 });
 it('finds a specification inside a generic archive and retains exact page evidence',()=>{
  const result=contents('Anexa Raspuns.rar',[{name:'Anexa Raspuns.rar / scan.pdf',firstPage:1,pages:2},{name:'Anexa Raspuns.rar / Planse.pdf',firstPage:3,pages:2},{name:'Anexa Raspuns.rar / unknown.dwg',error:'unsupported'}],[{page:1,text:'CAIET DE SARCINI'}]);
  expect(result.categories).toEqual(['specifications','technical','unknown']);expect(result.parts?.[0]).toMatchObject({categories:['specifications'],evidence:[{page:1}]});expect(hasSpecifications(result)).toBe(true);
 });
});
