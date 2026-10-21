import {describe,it,expect} from 'vitest';
import {ACCEPTED_AUTHORITY_CUI,reviewedWinnerIdentity,reviewedWinnerRule} from './reviewed-winner.js';
describe('reviewed source contradictions',()=>{
 it.each([107982497,108090948])('fixes HABAU fiscal identifier in contract %s',id=>{
  const input={sicapId:54428,cuiRaw:'RO13068733',nameDisplay:'HABAU PPS PIPELINE SYSTEMS S.R.L.'};
  expect(reviewedWinnerIdentity(id,input)).toEqual({...input,cuiRaw:'13092995'});
  expect(reviewedWinnerIdentity(id,{...input,nameDisplay:'TRANSGAZ'}).cuiRaw).toBe('RO13068733');
  expect(reviewedWinnerIdentity(id,{...input,sicapId:54429})).toEqual({...input,sicapId:54429});
 });
 // 17 October 2026: notice 100661676 republished the same contracts under new IDs.
 it.each([108105778,108214525])('fixes THEOTOP without modifying another source identity (%s)',id=>{
  const input={sicapId:64188,cuiRaw:'RO 5394305',nameDisplay:'SC THEOTOP SRL'};
  expect(reviewedWinnerIdentity(id,input).cuiRaw).toBe('391391');
  expect(reviewedWinnerIdentity(id,{...input,sicapId:64189}).cuiRaw).toBe('RO 5394305');
  const correct={...input,cuiRaw:'RO 391391'};
  expect(reviewedWinnerIdentity(id,correct)).toBe(correct);
 });
 it.each([108105777,108105782,108105798,108214524,108214529,108214545])('uses UTI fiscal identity while preserving CAR TOP mapping (%s)',id=>{
  const input={sicapId:14779,cuiRaw:'RO 5394305',nameDisplay:'UTI GRUP SA'};
  expect(reviewedWinnerIdentity(id,input)).toEqual({...input,sicapId:null});
  expect(reviewedWinnerIdentity(id,{...input,nameDisplay:'CAR TOP SRL',cuiRaw:'RO 6895096'}).sicapId).toBe(14779);
 });
 // Audit F27, owner decision 21 October 2026: the authority typed its own CUI as the winner's.
 it.each([
  [189411,'1590236','35534516'],[189411,'RO 1590236','35534516'],[101507,'4541092','7586277'],
  [38659,'RO 3321234','7012045'],[28306,'RO 3321234','22677832'],[21783,'RO 3321234','15595373'],
  [13864,'RO 3321234','16997760'],[9739,'RO 3321234','10274437'],[7355,'RO 13328043','211717'],
  [109982,'37832160','6243289'],
 ])('keeps SICAP winner %s with authority CUI %s on the supplier CUI %s',(sicapId,cuiRaw,supplier)=>{
  const input={sicapId,cuiRaw,nameDisplay:'ANY NAME'};
  expect(reviewedWinnerIdentity(108300000,input)).toEqual({...input,cuiRaw:supplier});
  expect(reviewedWinnerRule(input)).toBe('accepted-authority-cui-20261021');
 });
 it('accepts only the exact reviewed pairs',()=>{
  expect(ACCEPTED_AUTHORITY_CUI).toHaveLength(9);
  // The same authority CUI under another SICAP winner, and another CUI under an accepted winner.
  for(const input of [{sicapId:7356,cuiRaw:'RO 13328043',nameDisplay:'Energobit'},{sicapId:1191,cuiRaw:'RO 13328043',nameDisplay:'TRANSELECTRICA'},
   {sicapId:109982,cuiRaw:'6552535',nameDisplay:'THEDA MAR'},{sicapId:101507,cuiRaw:'14600285',nameDisplay:'COMINF SRL'},{sicapId:null,cuiRaw:'RO 3321234',nameDisplay:'IFIN-HH'}])
   expect(reviewedWinnerIdentity(108300000,input)).toBe(input);
  expect(reviewedWinnerRule({sicapId:64188,cuiRaw:'RO 5394305'})).toBe('reviewed-winner-20261008');
 });
 it('leaves other winners unchanged',()=>{
  const input={sicapId:13035,cuiRaw:'RO 6174812',nameDisplay:'CORNEL & CORNEL TOPOEXIM S.R.L'};
  expect(reviewedWinnerIdentity(108214524,input)).toBe(input);
 });
});
