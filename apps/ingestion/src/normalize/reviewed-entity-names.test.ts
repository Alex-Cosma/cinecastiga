import {describe,it,expect} from 'vitest';
import {canonicalCui} from './cui.js';
import {normalizeName} from './name.js';
import {REVIEWED_AUTHORITY_NAMES} from './reviewed-entity-names.js';
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
});
