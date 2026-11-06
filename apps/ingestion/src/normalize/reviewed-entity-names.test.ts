import {describe,it,expect} from 'vitest';
import {canonicalCui} from './cui.js';
import {normalizeName} from './name.js';
import {REVIEWED_AUTHORITY_NAMES,REVIEWED_TOWN_HALL_NAMES} from './reviewed-entity-names.js';
describe('reviewed authority names',()=>{
 it.each(REVIEWED_AUTHORITY_NAMES.map(r=>[r.cui,r]))('rule for CUI %s is exact and changes the name',(_cui,r)=>{
  expect(canonicalCui(r.cui)).toMatchObject({valid:true,cui:r.cui});
  expect(normalizeName(r.name).normalized).not.toBe(normalizeName(r.wrongName).normalized);
  expect(r.authoritySicapId).not.toBe(r.supplierSicapId);
 });
 it('has one rule per fiscal identity and registration',()=>{
  const keys=REVIEWED_AUTHORITY_NAMES.flatMap(r=>[`cui:${r.cui}`,`a:${r.authoritySicapId}`,`s:${r.supplierSicapId}`]);
  expect(new Set(keys).size).toBe(keys.length);
 });
 it.each(REVIEWED_TOWN_HALL_NAMES.map(r=>[r.cui,r]))('town hall rule for CUI %s is exact and changes the name',(_cui,r)=>{
  expect(canonicalCui(r.cui)).toMatchObject({valid:true,cui:r.cui});
  expect(normalizeName(r.name).normalized).not.toBe(normalizeName(r.wrongName).normalized);
 });
 it('has one town hall rule per fiscal identity',()=>{
  expect(new Set(REVIEWED_TOWN_HALL_NAMES.map(r=>r.cui)).size).toBe(REVIEWED_TOWN_HALL_NAMES.length);
 });
});
