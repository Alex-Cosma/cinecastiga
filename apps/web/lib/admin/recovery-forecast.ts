/** Read-only planning estimate. Bounds are scenarios, not confidence intervals. */
export interface RecoverySample {
 stream: string; units: number; sampled: number; mean_work: number; sd_work: number;
 months: number; total_months: number;
}
export interface RecoveryCounts {stream:string;complete:number;split:number;pending:number;running:number;failed:number;deferred:number}
export interface RecoveryForecastInput {
 samples: RecoverySample[]; progress: RecoveryCounts[];
 catalogueReady: boolean; elapsedDays:number; recentCompleted:number;
 minSeconds:number;maxSeconds:number;dailyLimit:number|null;
}
export function recoveryForecast(input:RecoveryForecastInput){
 const n=(v:unknown)=>Math.max(0,Number(v)||0);
 const completed=input.progress.reduce((a,s)=>a+n(s.complete)+n(s.split),0);
 const pending=input.progress.reduce((a,s)=>a+n(s.pending)+n(s.running),0);
 const failed=input.progress.reduce((a,s)=>a+n(s.failed),0);
 const deferred=input.progress.reduce((a,s)=>a+n(s.deferred),0);
 const known=completed+pending+failed+deferred;
 const knownPercent=known?Math.min(deferred||failed||pending?99:100,Math.floor(completed/known*100)):null;
 const sampleReady=input.catalogueReady&&['da','tenders','awards'].every(stream=>{
  const s=input.samples.find(r=>r.stream===stream);if(!s||!n(s.units))return false;
  const required=Math.min(n(s.units),Math.max(stream==='da'?100:20,Math.ceil(n(s.units)*.1)));
  return n(s.sampled)>=required&&Number.isFinite(Number(s.mean_work))&&n(s.mean_work)>=1&&(stream==='da'||n(s.months)>=Math.min(3,n(s.total_months)));
 });
 let remainingLow:number|null=null,remainingHigh:number|null=null,percent:number|null=null;
 if(sampleReady){
  let low=0,high=0;
  for(const s of input.samples){
   // Allow at least 25% variation: discovery is ordered, not a random sample.
   const mean=n(s.mean_work),spread=Math.max(mean*.25,2*n(s.sd_work)/Math.sqrt(Math.max(1,n(s.sampled))));
   low+=n(s.units)*Math.max(1,mean-spread);high+=n(s.units)*(mean+spread);
  }
  const catalogue=input.progress.find(s=>s.stream==='catalogue');
  low+=n(catalogue?.complete);high+=n(catalogue?.complete);
  remainingLow=Math.ceil(Math.max(pending+failed+deferred,low-completed));
  remainingHigh=Math.ceil(Math.max(remainingLow,high-completed));
  percent=Math.min(knownPercent??99,Math.floor(100*completed/(completed+(remainingLow+remainingHigh)/2||1)));
 }
 const rateReady=input.elapsedDays>=1&&input.recentCompleted>=100;
 const capacity=Math.min(86400/Math.max(1,(input.minSeconds+input.maxSeconds)/2),input.dailyLimit??Infinity);
 const rate=rateReady?Math.min(capacity,input.recentCompleted/Math.max(1,input.elapsedDays)):null;
 const done=['da','tenders','awards'].every(stream=>input.progress.some(s=>s.stream===stream&&s.complete>0))&&known>0&&pending===0&&failed===0&&deferred===0&&input.catalogueReady;
 const state=done?'complete':deferred||failed?'gaps':!sampleReady?'learning':!rate?'measuring':'estimated';
 return {state,completed,pending,failed,deferred,known,knownPercent:done?100:knownPercent,percent:done?100:percent,
  remainingLow,remainingHigh,rate:rate?Math.round(rate):null,
  daysLow:state==='estimated'?Math.max(1,Math.ceil(remainingLow!/(rate!*1.25))):null,
  daysHigh:state==='estimated'?Math.max(1,Math.ceil(remainingHigh!/(rate!*.75))):null,
  sampled:input.samples.map(s=>({stream:s.stream,sampled:n(s.sampled),units:n(s.units)})),
 };
}
