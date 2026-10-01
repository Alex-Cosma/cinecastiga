import {describe,it,expect} from 'vitest';
import {mapAskIdentities} from './canonical-identities';
import type {AskSpec} from './spec';
describe('verified identity redirects',()=>{
 it('resolves saved inclusions/exclusions without changing their frozen input',()=>{
  const spec:AskSpec={block:'stat',measure:'value',filters:{authorityId:2147251},population:{operator:'and',groups:[{operator:'and',conditions:[{field:'authority',op:'not_in',values:['2147251','2146445']},{field:'cpv',op:'in',values:['45']}]}]}};
  const before=JSON.stringify(spec),scope={entityIds:['2147251'],excludeEntityIds:['2147251']};
  const result=mapAskIdentities(spec,{authority:{query:'Cluj',entityId:'2147251',nameDisplay:'Cluj',county:null,alternatives:[]}},scope,new Map([['2147251','2146445']]));
  expect(result.spec.filters.authorityId).toBe(2146445);
  expect(result.grounding.authority?.entityId).toBe('2146445');
  expect(result.scope?.excludeEntityIds).toEqual(['2146445']);
  expect(result.spec.population?.groups[0]?.conditions[0]).toMatchObject({op:'not_in',values:['2146445']});
  expect(result.spec.population?.groups[0]?.conditions[1]).toMatchObject({values:['45']});
  expect(JSON.stringify(spec)).toBe(before);expect(scope.entityIds).toEqual(['2147251']);
 });
 it('keeps a different fiscal identity separate',()=>{
  const spec:AskSpec={block:'stat',measure:'value',filters:{authorityId:2165580}};
  expect(mapAskIdentities(spec,{},undefined,new Map([['2147251','2146445']])).spec.filters.authorityId).toBe(2165580);
 });
});
