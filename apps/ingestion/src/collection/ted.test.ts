import {describe,expect,it} from 'vitest';
import {planResponse,task,type PageResult} from './plan.js';
import {gazetteOjs,nextOjs,ojsLabel,TED_PAGE_SIZE,tedPackageCandidates,tedPackageDay,tedPackageTask,tedReverifications,tedVerifyTask,type TedAttempt,type TedPackageFetch} from './ted.js';
import {readTedDailyPackage} from '../scrape/ted/package.js';
import {tedDailyPackage,tedNoticeXml} from '../test/ted-package-fixture.js';

const day='2026-10-15',ojs='202600200',scan='2026-10-15T09';
const notices=(from:number,count:number)=>Array.from({length:count},(_,i)=>({'publication-number':`${from+i}-2026`,'publication-date':`${day}+02:00`,'notice-type':'can-standard'}));
const fetched=async(romanian:string[],o:{ojs?:string;day?:string;filename?:string}={}):Promise<TedPackageFetch>=>{const p=tedDailyPackage(o.ojs??ojs,o.day??day,romanian);return {status:200,filename:o.filename??p.filename,...await readTedDailyPackage(p.bytes)};};
const pkgTask={...tedPackageTask('b',ojs,scan),id:1};

describe('TED collection tasks',()=>{
 it('keys one package per OJ S issue and attempt, and one verification per issue and scan',()=>{
  expect(pkgTask).toMatchObject({stream:'ted',kind:'ted-package',key:`ted:ted-package:${ojs}:::scan:${scan}:0`,priority:10});
  expect(tedPackageTask('b',ojs,'2026-10-15T10').key).not.toBe(pkgTask.key);
  expect(tedVerifyTask('b',ojs,day,day).key).toBe(`ted:ted-list:${ojs}:${day}:${day}:scan:${day}:0`);
  expect(()=>task('b','ted','ted-package',{ojs:'2026200',tedScan:scan,page:0})).toThrow(/OJ S nevalid/);
  expect(()=>task('b','ted','ted-package',{ojs:'202600000',tedScan:scan,page:0})).toThrow(/OJ S nevalid/);
  expect(()=>task('b','ted','ted-list',{from:day,to:'2026-10-16',ojs,tedScan:day,page:0})).toThrow(/singură zi/);
  expect(()=>task('b','ted','ted-list',{from:day,to:day,tedScan:day,page:0})).toThrow(/OJ S/);
  expect(()=>task('b','tenders','list',{from:day,to:day,page:0,tedScan:scan})).toThrow(/TED/);
  // The per-notice XML design is refused cleanly.
  expect(()=>task('b','ted','ted-xml',{publicationNumber:'506645-2026',publicationDate:day,tedScan:day,page:0},2)).toThrow(/înlocuită de pachetul zilnic/);
  expect([ojsLabel(ojs),gazetteOjs('200/2026'),gazetteOjs(' 84/2026 '),gazetteOjs('2026/200'),gazetteOjs(null),nextOjs('202600200'),nextOjs('202699999')]).toEqual(['200/2026',ojs,'202600084',null,null,'202600201',null]);
 });

 it('validates the package name against the requested issue',()=>{
  expect(tedPackageDay('20261015_2026200.tar.gz',ojs)).toBe(day);
  expect(tedPackageDay('20270104_20271.tar.gz','202700001')).toBe('2027-01-04');
  for(const name of [null,'20261015_2026201.tar.gz','20261015_2025200.tar.gz','20251015_2026200.tar.gz','20261315_2026200.tar.gz','x.tar.gz','20261015_2026200.zip'])expect(()=>tedPackageDay(name,ojs)).toThrow(/TED/);
 });

 it('archives the Romanian award notices of the issue and queues its verification (the next issue waits for the spacing tick)',async()=>{
  const plan=planResponse(pkgTask,await fetched(['634512-2026','634513-2026']),[],day);
  expect(plan.docs).toEqual(['634512-2026','634513-2026'].map(p=>({source:'ted',externalId:`can-standard:${p}`,endpointVersion:'ted-eforms:v1',
   payload:{'publication-number':p,'notice-type':'can-standard','publication-date':day,'buyer-name':null,xml:tedNoticeXml({publication:p,ojs,day})}})));
  expect(plan.result).toMatchObject({total:2,identities:['634512-2026','634513-2026'],ojs,published:true,publicationDate:day,files:5,xmlFiles:4,candidates:3,otherCountry:1,otherType:0});
  expect(plan.children.map(c=>c.key)).toEqual([`ted:ted-list:${ojs}:${day}:${day}:scan:${day}:0`]);
 });

 it('a 404 is an issue not published yet: complete, no documents, no children',()=>{
  const plan=planResponse(pkgTask,{status:404,filename:null},[],day);
  expect(plan).toEqual({status:'complete',result:{total:0,ids:[],ojs,published:false},docs:[],children:[]});
 });

 it('fails closed on another issue, day, number or an empty package',async()=>{
  const other=await fetched(['1-2026'],{filename:'20261016_2026201.tar.gz'});
  expect(()=>planResponse(pkgTask,other,[],day)).toThrow(/am cerut OJ S 200\/2026, dar pachetul primit este 201\/2026/);
  const gazette=await fetched(['1-2026'],{ojs:'202600199',filename:'20261015_2026200.tar.gz'});
  expect(()=>planResponse(pkgTask,gazette,[],day)).toThrow(/altui număr OJ S \(199\/2026\)/);
  const date=await fetched(['1-2026'],{day:'2026-10-14',filename:'20261015_2026200.tar.gz'});
  expect(()=>planResponse(pkgTask,date,[],day)).toThrow(/altă dată/);
  const v=await fetched(['1-2026']);v.candidates![0]!.name='x/00000002_2026.xml';
  expect(()=>planResponse(pkgTask,v,[],day)).toThrow(/alt număr de publicare/);
  expect(()=>planResponse(pkgTask,{status:200,filename:'20261015_2026200.tar.gz',files:1,xmlFiles:0,candidates:[]},[],day)).toThrow(/nu conține fișiere XML/);
  expect(()=>planResponse(pkgTask,{status:500,filename:null},[],day)).toThrow(/HTTP 500/);
  const broken=await fetched(['1-2026']);broken.candidates![0]!.xml='<ContractAwardNotice><efac:Publication>';
  expect(()=>planResponse(pkgTask,broken,[],day)).toThrow(/nu poate fi citit/);
  // A structurally different notice type that matched the text pre-filter is counted, not archived.
  const modif=await fetched([]);modif.candidates=[{name:'x/00000003_2026.xml',xml:tedNoticeXml({publication:'3-2026',ojs,day,type:'can-modif'}).replace('</ContractAwardNotice>','<!-- >can-standard< --></ContractAwardNotice>')}];
  expect(planResponse(pkgTask,modif,[],day)).toMatchObject({docs:[],result:{total:0,otherType:1}});
 });

 it('pages a day verification without per-notice children',()=>{
  const t={...tedVerifyTask('b',ojs,day,day),id:1};
  const first=planResponse(t,{totalNoticeCount:150,notices:notices(1,TED_PAGE_SIZE)},[],day);
  expect(first.docs).toEqual([]);
  expect(first.children).toHaveLength(1);
  expect(first.children[0]).toMatchObject({kind:'ted-list',priority:0,params:{page:1,from:day,ojs,tedScan:day}});
  const last=planResponse({...first.children[0]!,id:2},{totalNoticeCount:150,notices:notices(101,50)},[first.result as PageResult],day);
  expect(last.children).toEqual([]);
  expect((last.result as PageResult).identities).toHaveLength(50);
 });

 it('fails closed on unstable or foreign search pages',()=>{
  const t={...tedVerifyTask('b',ojs,day,day),id:1};
  const first=planResponse(t,{totalNoticeCount:150,notices:notices(1,100)},[],day).result as PageResult;
  const page1={...t,params:{...t.params,page:1}};
  expect(()=>planResponse(page1,{totalNoticeCount:150,notices:notices(100,50)},[first],day)).toThrow(/paginare instabilă/);
  expect(()=>planResponse(page1,{totalNoticeCount:151,notices:notices(101,50)},[first],day)).toThrow(/totalul/);
  expect(()=>planResponse(page1,{totalNoticeCount:150,notices:notices(101,50)},[],day)).toThrow(/pagină anterioară/);
  expect(()=>planResponse(t,{totalNoticeCount:3,notices:notices(1,2)},[],day)).toThrow(/nu corespunde/);
  expect(()=>planResponse(t,{totalNoticeCount:1,notices:[{'publication-number':'1-2026','publication-date':'2026-10-14+02:00'}]},[],day)).toThrow(/afara zilei/);
  expect(()=>planResponse(t,{notices:[]},[],day)).toThrow(/structura/);
  expect(planResponse(t,{totalNoticeCount:0,notices:[]},[],day).children).toEqual([]);
 });
});

describe('OJ S sequencing',()=>{
 const now=Date.parse('2026-10-16T12:00:00Z'),hour=3600_000;
 const a=(ojs:string,status:string,published:boolean|null,ago=2*hour):TedAttempt=>({ojs,status,published,finishedMs:status==='pending'||status==='running'?null:now-ago});
 const next=(attempts:TedAttempt[],at=now,year=2026)=>tedPackageCandidates({attempts,nowMs:at,year});
 it('follows the issue numbers from the latest archived one, one attempt in flight',()=>{
  expect(next([])).toEqual([]);
  expect(next([a('202600200','complete',true),a('202600201','pending',null)])).toEqual([]);
  expect(next([a('202600200','complete',true),a('202600201','running',null)])).toEqual([]);
  expect(next([a('202600199','complete',true),a('202600200','complete',true)])).toEqual(['202600201']);
 });
 it('retries a not-yet-published issue (404) at most once per hour',()=>{
  expect(next([a('202600200','complete',true),a('202600201','complete',false,30*60_000)])).toEqual([]);
  expect(next([a('202600200','complete',true),a('202600201','complete',false,59*60_000),a('202600201','complete',false,3*hour)])).toEqual([]);
  expect(next([a('202600200','complete',true),a('202600201','complete',false,61*60_000)])).toEqual(['202600201']);
  // A failed attempt (stream paused, audited) is queued again only after an hour; it waits for the operator's resume.
  expect(next([a('202600200','complete',true),a('202600201','failed',null,10*60_000)])).toEqual([]);
  expect(next([a('202600200','complete',true),a('202600201','failed',null,2*hour)])).toEqual(['202600201']);
 });
 it('waits ten minutes after any package download before the next one',()=>{
  expect(next([a('202600200','complete',true,9*60_000)])).toEqual([]);
  expect(next([a('202600199','complete',true),a('202600200','complete',true,10*60_000)])).toEqual(['202600201']);
  expect(next([a('202600200','complete',true),a('202600201','failed',null,2*hour),a('202600150','complete',true,5*60_000)])).toEqual([]);
 });
 it('downloads again, oldest first and one per window, issues read with an older pre-filter',()=>{
  const done=[a('202600123','complete',true,3*hour),a('202600124','complete',true,3*hour),a('202600127','complete',true)];
  expect(tedPackageCandidates({attempts:done,nowMs:now,year:2026,redownload:['202600124','202600123']})).toEqual(['202600123']);
  expect(tedPackageCandidates({attempts:[...done,a('202600123','complete',true,20*60_000)],nowMs:now,year:2026,redownload:['202600124']})).toEqual(['202600124']);
  expect(tedPackageCandidates({attempts:[...done,a('202600128','complete',true,5*60_000)],nowMs:now,year:2026,redownload:['202600123']})).toEqual([]);
  expect(tedPackageCandidates({attempts:done,nowMs:now,year:2026,redownload:[]})).toEqual(['202600128']);
 });
 it('retries the seed issue when nothing was archived yet',()=>{
  expect(next([a('202600198','failed',null)])).toEqual(['202600198']);
  expect(next([a('202600198','complete',false,10*60_000)])).toEqual([]);
 });
 it('rolls over to the first issue of the next year only after a 404 in a later Romanian year',()=>{
  const dec=[a('202600250','complete',true)];
  expect(next(dec,now,2027)).toEqual(['202600251']);
  expect(next([...dec,a('202600251','complete',false)],now,2026)).toEqual(['202600251']);
  expect(next([...dec,a('202600251','complete',false)],now,2027)).toEqual(['202700001']);
  expect(next([...dec,a('202600251','complete',false),a('202700001','complete',false,10*60_000)],now,2027)).toEqual(['202600251']);
  expect(next([...dec,a('202600251','complete',false),a('202700001','complete',true)],now,2027)).toEqual(['202700002']);
  // A late-December issue published after all keeps the old year's sequence going.
  expect(next([...dec,a('202600251','complete',true)],now,2027)).toEqual(['202600252']);
  expect(next([a('202699999','complete',true)],now,2027)).toEqual(['202700001']);
 });
 it('searches a failed day verification again on each of the next three days only',()=>{
  const v=(scan:string,status:string,error:string|null=null)=>({ojs,day,scan,status,error});
  const failed=v(day,'failed','TED: verificare eșuată pentru OJ S 200/2026');
  expect(tedReverifications([failed],'2026-10-15')).toEqual([]);
  expect(tedReverifications([failed],'2026-10-16')).toEqual([{ojs,day}]);
  expect(tedReverifications([failed],'2026-10-18')).toEqual([{ojs,day}]);
  expect(tedReverifications([failed],'2026-10-19')).toEqual([]);
  expect(tedReverifications([failed,v('2026-10-16','complete')],'2026-10-17')).toEqual([]);
  expect(tedReverifications([failed,v('2026-10-16','pending')],'2026-10-17')).toEqual([]);
  expect(tedReverifications([v(day,'failed','TED: structura căutării nu este validă.')],'2026-10-16')).toEqual([]);
  expect(tedReverifications([v(day,'complete')],'2026-10-16')).toEqual([]);
 });
});
