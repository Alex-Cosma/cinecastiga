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
