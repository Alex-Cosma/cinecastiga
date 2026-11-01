import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {DbSql} from '@seap/db';
const mocks=vi.hoisted(()=>({
 getIndex:vi.fn(),createIndex:vi.fn(),waitForTask:vi.fn(),
 deleteAllDocuments:vi.fn(),updateSettings:vi.fn(),addDocuments:vi.fn(),getStats:vi.fn(),
}));
vi.mock('meilisearch',()=>({Meilisearch:class {
 index(){return mocks;}
 getIndex=mocks.getIndex;
 createIndex=mocks.createIndex;
 tasks={waitForTask:mocks.waitForTask};
}}));
import {indexEntities} from './index-entities.js';
const sql=vi.fn() as unknown as DbSql;
beforeEach(()=>{
 vi.resetAllMocks();
 mocks.getIndex.mockResolvedValue({});
 mocks.createIndex.mockResolvedValue({taskUid:1});
 mocks.deleteAllDocuments.mockResolvedValue({taskUid:2});
 mocks.updateSettings.mockResolvedValue({taskUid:3});
 mocks.addDocuments.mockResolvedValue({taskUid:4});
 mocks.waitForTask.mockResolvedValue({status:'succeeded'});
 mocks.getStats.mockResolvedValue({numberOfDocuments:1});
 vi.mocked(sql).mockResolvedValue([{id:42n,name_display:'Primăria',cui_canonical:'123',county:'CJ',roles:['authority'],supplier_total:'0',authority_total:'100'}] as never);
});
describe('entity search publication',()=>{
 it('reuses an existing index without enqueueing a failing creation',async()=>{
  expect(await indexEntities(sql)).toEqual({documents:1});
  expect(mocks.createIndex).not.toHaveBeenCalled();
  expect(mocks.addDocuments).toHaveBeenCalledOnce();
 });
 it('creates a missing index and verifies completion before writing',async()=>{
  mocks.getIndex.mockRejectedValue({code:'index_not_found'});
  await indexEntities(sql);
  expect(mocks.createIndex).toHaveBeenCalledWith('entities',{primaryKey:'id'});
  expect(mocks.waitForTask).toHaveBeenNthCalledWith(1,1,{timeout:120000});
 });
 it('does not wipe on an unexpected lookup error',async()=>{
  mocks.getIndex.mockRejectedValue(new Error('network unavailable'));
  await expect(indexEntities(sql)).rejects.toThrow('network unavailable');
  expect(mocks.deleteAllDocuments).not.toHaveBeenCalled();
 });
 it.each(['failed','canceled'])('rejects a %s wipe instead of claiming success',async status=>{
  mocks.waitForTask.mockResolvedValueOnce({status,error:{code:'internal'}});
  await expect(indexEntities(sql)).rejects.toThrow(`2 ${status}`);
  expect(mocks.updateSettings).not.toHaveBeenCalled();
 });
 it('rejects a failed document batch',async()=>{
  mocks.waitForTask.mockResolvedValueOnce({status:'succeeded'}).mockResolvedValueOnce({status:'succeeded'}).mockResolvedValueOnce({status:'failed',error:{code:'invalid_document_id'}});
  await expect(indexEntities(sql)).rejects.toThrow('invalid_document_id');
  expect(mocks.getStats).not.toHaveBeenCalled();
 });
});
describe('ONRC names in the entity index (a renamed firm, 1 November 2026)',()=>{
 it('makes the other ONRC names of the corroborated CUI searchable, never the SICAP name again',async()=>{
  vi.mocked(sql).mockImplementation(((strings:TemplateStringsArray|string)=>{
   const text=Array.isArray(strings)?strings.join(' '):String(strings);
   if(text.includes('to_regclass')) return Promise.resolve([{present:true}]);
   if(text.includes('reference.onrc_firm o')) return Promise.resolve([{id:42n,names:['PSIHO POLIGRAF S.R.L.','STRATEGIC CONNECT S.R.L.']}]);
   if(text.includes('marts.entity_profile ep on')) return Promise.resolve([{id:42n,name_display:'PSIHO POLIGRAF',cui_canonical:'40363501',county:'DB',roles:['supplier'],supplier_total:'100',authority_total:'0'}]);
   return Promise.resolve([]);
  }) as never);
  await indexEntities(sql);
  expect(mocks.updateSettings.mock.calls[0]![0].searchableAttributes).toEqual(['name','registryNames','cui']);
  expect(mocks.addDocuments.mock.calls[0]![0][0].registryNames).toEqual(['STRATEGIC CONNECT S.R.L.']);
 });
});
