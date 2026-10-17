import {describe,it,expect} from 'vitest';
import {reviewedWinnerIdentity} from './reviewed-winner.js';
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
 it('leaves other winners unchanged',()=>{
  const input={sicapId:13035,cuiRaw:'RO 6174812',nameDisplay:'CORNEL & CORNEL TOPOEXIM S.R.L'};
  expect(reviewedWinnerIdentity(108214524,input)).toBe(input);
 });
});
