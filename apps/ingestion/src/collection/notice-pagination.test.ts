import {describe,it,expect,vi} from 'vitest';
import type {ElicitatieClient} from '@seap/scraper-clients';
import {fetchTask,scheduleNoticeOverlapRecovery} from './runner.js';
import {task} from './plan.js';
describe('bounded notice recovery requests',()=>{
 it('requests the whole small day once through the same endpoint and date filters',async()=>{
  const postJson=vi.fn(async()=>({data:{total:0,items:[]}}));
  const client={http:{postJson}} as unknown as ElicitatieClient;
  await fetchTask(client,task('fixture','awards','list',{from:'2024-11-28',to:'2024-11-28',page:0,inventoryOnly:true,singlePageTotal:180}));
  expect(postJson).toHaveBeenCalledExactlyOnceWith('/api-pub/NoticeCommon/GetCANoticeList/',expect.objectContaining({pageIndex:0,pageSize:2000,startPublicationDate:'2024-11-28',endPublicationDate:'2024-11-28'}));
 });
 it('refuses an oversized or repeated fallback before touching the database',async()=>{
  const q={begin:vi.fn()} as any;
  const t=task('fixture','awards','list',{from:'2024-11-28',to:'2024-11-28',page:1});
  expect(await scheduleNoticeOverlapRecovery(q,t,2001)).toBe(false);
  expect(await scheduleNoticeOverlapRecovery(q,{...t,params:{...t.params,page:0,singlePageTotal:180}},180)).toBe(false);
  expect(q.begin).not.toHaveBeenCalled();
 });
});
