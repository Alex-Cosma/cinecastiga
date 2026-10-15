import {describe,it,expect} from 'vitest';
import {reviewedWinnerIdentity} from './reviewed-winner.js';
describe('reviewed source contradictions',()=>{
 it.each([107982497,108090948])('fixes HABAU fiscal identifier only in contract %s',id=>{
  const input={sicapId:54428,cuiRaw:'RO13068733',nameDisplay:'HABAU PPS PIPELINE SYSTEMS S.R.L.'};
  expect(reviewedWinnerIdentity(id,input)).toEqual({...input,cuiRaw:'13092995'});
  expect(reviewedWinnerIdentity(123,input)).toBe(input);
  expect(reviewedWinnerIdentity(id,{...input,nameDisplay:'TRANSGAZ'}).cuiRaw).toBe('RO13068733');
 });
 it('fixes THEOTOP without modifying another source identity',()=>{
  const input={sicapId:64188,cuiRaw:'5394305',nameDisplay:'THEOTOP S.R.L.'};
  expect(reviewedWinnerIdentity(108105778,input).cuiRaw).toBe('391391');
  expect(reviewedWinnerIdentity(108105778,{...input,sicapId:64189}).cuiRaw).toBe('5394305');
 });
 it.each([108105777,108105782,108105798])('uses UTI fiscal identity while preserving CAR TOP mapping (%s)',id=>{
  const input={sicapId:14779,cuiRaw:'RO5394305',nameDisplay:'UTI GRUP S.A.'};
  expect(reviewedWinnerIdentity(id,input)).toEqual({...input,sicapId:null});
  expect(reviewedWinnerIdentity(id,{...input,nameDisplay:'CAR TOP',cuiRaw:'6895096'}).sicapId).toBe(14779);
 });
});
