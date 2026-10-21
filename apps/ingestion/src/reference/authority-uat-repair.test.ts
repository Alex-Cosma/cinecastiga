import {describe,expect,it} from 'vitest';
import {AUTHORITY_UAT_CORRECTIONS,countyKey,planAuthorityUatCorrection,type AuthorityUatObservation} from './authority-uat-repair.js';

// Audit F15, 1 October snapshot: Vânători (Galați) 2142023 held Mehedinți's code 113849.
const vanatoriGl=AUTHORITY_UAT_CORRECTIONS.find(c=>c.entityId==='2142023')!;
const observed=(over:Partial<AuthorityUatObservation>={}):AuthorityUatObservation=>({
 entity:{cui:'4393212',county:'Galati'},mapping:{siruta:113849,population:1964},target:{county:'galati',population:4864},...over,
});

describe('authority UAT county repair (audit F15)',()=>{
 it('pins exactly the eleven cross-county rows, each to another code',()=>{
  expect(AUTHORITY_UAT_CORRECTIONS).toHaveLength(11);
  expect(new Set(AUTHORITY_UAT_CORRECTIONS.map(c=>c.entityId)).size).toBe(11);
  expect(new Set(AUTHORITY_UAT_CORRECTIONS.map(c=>c.to)).size).toBe(11);
  for(const c of AUTHORITY_UAT_CORRECTIONS)expect(c.from).not.toBe(c.to);
  expect(AUTHORITY_UAT_CORRECTIONS.filter(c=>c.from===113849).map(c=>[c.county,c.to])).toEqual([['Galati',75150],['Iasi',100086],['Mures',120254],['Vrancea',178607]]);
  expect(AUTHORITY_UAT_CORRECTIONS.find(c=>c.entityId==='2146546')).toMatchObject({from:94456,to:63394,county:'Covasna'});
 });
 it('moves the row to the same-named UAT of its own county with that unit population',()=>{
  expect(planAuthorityUatCorrection(vanatoriGl,observed())).toEqual({entityId:'2142023',from:113849,to:75150,outcome:'corrected',
   before:{siruta:113849,population:1964},after:{siruta:75150,population:4864}});
 });
 it('is idempotent once the row holds the correct code',()=>{
  expect(planAuthorityUatCorrection(vanatoriGl,observed({mapping:{siruta:75150,population:4864}})).outcome).toBe('already-corrected');
 });
 it('never touches a row whose identity, target or mapping no longer matches the evidence',()=>{
  const reason=(o:AuthorityUatObservation)=>planAuthorityUatCorrection(vanatoriGl,o).reason;
  expect(reason(observed({entity:null}))).toBe('entity-changed');
  expect(reason(observed({entity:{cui:'1',county:'Galati'}}))).toBe('entity-changed');
  expect(reason(observed({entity:{cui:'4393212',county:'Mehedinti'}}))).toBe('entity-changed');
  expect(reason(observed({target:null}))).toBe('target-missing');
  expect(reason(observed({target:{county:'mehedinti',population:1964}}))).toBe('county-mismatch');
  expect(reason(observed({mapping:null}))).toBe('mapping-missing');
  expect(reason(observed({mapping:{siruta:1,population:1}}))).toBe('mapping-changed');
 });
 it('compares counties across diacritics, case and hyphens',()=>{
  expect(countyKey('Bistrița-Năsăud')).toBe(countyKey('bistrita nasaud'));
  expect(countyKey('Dâmbovița')).toBe('dambovita');
 });
});
