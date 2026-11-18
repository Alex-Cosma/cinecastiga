import {describe,expect,it} from 'vitest';
import {parseTopicScope} from '../../lib/topic-search/shared';
import {completUnless,filterSet,setFromAddress} from './esential';

const set=(query:string)=>setFromAddress(parseTopicScope(new URLSearchParams(query)));

describe('the /cauta controls Esențial shows because the address sets them',()=>{
 it('shows nothing for a plain search',()=>{
  const s=set('q=asfaltare');
  expect(Object.values(s).some(Boolean)).toBe(false);
  expect(filterSet(s)).toBe(false);
 });
 it('names each filter the address moves from its default',()=>{
  expect(set('q=iluminat&place=county:cluj')).toMatchObject({place:true,period:false});
  expect(set('q=iluminat&from=2023&to=2024')).toMatchObject({period:true,place:false});
  expect(set('q=iluminat&type=da').type).toBe(true);
  expect(set('q=iluminat&match=phrase').match).toBe(true);
  expect(filterSet(set('q=iluminat&type=contracts'))).toBe(true);
 });
 it('reads the locality switch, the order, the role and the documents tab',()=>{
  expect(set('q=Cisnadie&place=uat:143584&doar=primaria').hall).toBe(true);
  expect(set('q=Cisnadie&doar=primaria').hall).toBe(false); // „doar primăria” without a locality is not read
  expect(set('q=asfaltare&ordine=valoare').order).toBe(true);
  expect(set('q=asfaltare&ordine=data').order).toBe(false); // the default order, written out
  expect(set('q=asfaltare&rol=furnizor').role).toBe(true);
  expect(set('q=asfaltare&tab=documents').documents).toBe(true);
  expect(set('q=asfaltare&tab=acquisitions').documents).toBe(false);
 });
 it('marks for Complet only what is not shown',()=>{
  expect(completUnless(false)).toBe('complet');
  expect(completUnless(true)).toBeUndefined();
 });
});
