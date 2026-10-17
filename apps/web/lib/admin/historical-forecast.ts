/** Client-safe shapes and arithmetic for the historical downloads panel (no database imports). */
export interface BackfillPart {part:'root'|'lots'|'eform';pending:number;running:number;complete:number;failed:number;lastHour:number}
export interface HistoricalStatus {
 awards:{parts:BackfillPart[];errors:{error:string;n:number}[];lastEnqueue:{at:string;auto:boolean;queued:number;remaining:number|null;pilot:boolean}|null;lanes:number};
 ted:{latest:{ojs:string;day:string}|null;packages:number;notices:number;matched:number;gaps:number;behind:number|null;lastFinishedAt:string|null;inFlight:boolean;spacingMinutes:number;failedAttempt:string|null};
}
/** Remaining SEAP backfill work in requests: queued tasks, the parts still to come from queued roots,
 * and the unscheduled notices, each at the observed tasks per archived notice (root plus its lots or
 * eForms part; 2 before any root finished). `hours` is null without completions in the last hour. */
export function backfillForecast(h:HistoricalStatus['awards']){
 const sum=(k:keyof Omit<BackfillPart,'part'>)=>h.parts.reduce((s,p)=>s+p[k],0);
 const root=h.parts.find(p=>p.part==='root'),children=h.parts.filter(p=>p.part!=='root').reduce((s,p)=>s+p.pending+p.running+p.complete+p.failed,0);
 const perNotice=root&&root.complete>0?1+children/root.complete:2;
 const queued=sum('pending')+sum('running'),unscheduled=h.lastEnqueue?.remaining??null;
 const queuedRoots=root?root.pending+root.running:0;
 const left=queued+Math.round(queuedRoots*(perNotice-1)+(unscheduled??0)*perNotice),done=sum('complete'),rate=sum('lastHour');
 const total=done+sum('failed')+left;
 return {queued,unscheduled,left,done,total,percent:total?Math.floor(done/total*100):null,rate,hours:rate>0?left/rate:null,perNotice};
}
