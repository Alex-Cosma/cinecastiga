import {describe,expect,it,vi} from 'vitest';
import type {DbSql} from '@seap/db';
import {assertDocumentRequestBudget,validateDocumentRequestLimit} from './request-budget';

describe('bounded document pilot',()=>{
 it('rejects invalid limits before contacting SEAP',()=>{
  for(const n of [0,-1,1.5,NaN,Infinity,101])expect(()=>validateDocumentRequestLimit(n)).toThrow();
 });
 it('stops attempt seven using the durable count, including failures and resumed work',async()=>{
  const query=vi.fn().mockResolvedValue([{n:5}]);
  const q=query as unknown as DbSql;
  await expect(assertDocumentRequestBudget(q,'job',6)).resolves.toBeUndefined();
  query.mockResolvedValue([{n:6}]);
  await expect(assertDocumentRequestBudget(q,'job',6)).rejects.toThrow('Nu s-a trimis o cerere suplimentară');
  await expect(assertDocumentRequestBudget(q,'job',6)).rejects.toThrow();
 });
 it('leaves ordinary worker limits unchanged',async()=>{
  const query=vi.fn();await assertDocumentRequestBudget(query as unknown as DbSql,'job',undefined);
  expect(query).not.toHaveBeenCalled();
 });
});
