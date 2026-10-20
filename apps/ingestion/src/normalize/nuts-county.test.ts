import {describe,it,expect} from 'vitest';
import {RO_NUTS3_COUNTY,countyFromNuts} from './nuts-county.js';
// Data audit F13: CNIR 2161607 (RO321), Electrocentrale Craiova 2161549 (RO411).
describe('county from a Romanian NUTS-3 code',()=>{
 it.each([
  ['RO321','Bucuresti'],['RO321 Bucureşti','Bucuresti'],[' ro411 ','Dolj'],['RO411 Dolj','Dolj'],
  ['RO223 Constanţa','Constanta'],['RO315','Ialomita'],['RO322 Ilfov','Ilfov'],['RO422 Caraş-Severin','Caras-Severin'],
 ])('%s names %s',(nuts,county)=>{expect(countyFromNuts(nuts)).toBe(county);});
 it.each([null,undefined,'','RO','RO ROMÂNIA','RO32 Bucureşti-Ilfov','RO3211','RO321A','RO999','BG411','HU321','XRO321'])
 ('%s names no county',nuts=>{expect(countyFromNuts(nuts)).toBeNull();});
 it('covers the 41 counties and București once each',()=>{
  const codes=Object.keys(RO_NUTS3_COUNTY);
  expect(codes).toHaveLength(42);
  expect(new Set(Object.values(RO_NUTS3_COUNTY)).size).toBe(42);
  for(const code of codes)expect(code).toMatch(/^RO[1-4][1-3][0-9]$/);
 });
});
