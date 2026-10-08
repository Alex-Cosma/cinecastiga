import type {CollectionStatus} from '@/lib/admin/collection';
const fmt=(v:number)=>new Intl.NumberFormat('ro-RO').format(v);
const duration=(minutes:number)=>{
 const rounded=Math.ceil(minutes/5)*5;
 if(rounded<60)return `${rounded} min`;
 if(rounded<1440)return `${Math.floor(rounded/60)} h${rounded%60?` ${rounded%60} min`:''}`;
 const days=Math.ceil(rounded/1440);return `${days} ${days===1?'zi':'zile'}`;
};
const day=(value:string)=>new Intl.DateTimeFormat('ro-RO',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Bucharest'}).format(new Date(`${value}T12:00:00Z`));
const finish=(at:string,minutes:number)=>new Intl.DateTimeFormat('ro-RO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'}).format(new Date(new Date(at).getTime()+minutes*60000));
export default function RecoveryOverview({data,stale}:{data:CollectionStatus;stale:boolean}){
 const f=data.forecast,c=data.control!;
 if(!f||!data.recovery)return <section className="recovery-overview"><h2>Recuperarea, în ansamblu</h2><p>Niciun lot de recuperare înregistrat. Progresul și timpul rămas vor apărea după inventariere.</p></section>;
 const end=day(String(data.recovery.batch.end_day)),following=data.recovery.batch.follow_latest;
 const paused=c.paused||c.blocked_reason||(c.paused_streams as string[]).some(s=>['da','tenders','awards','catalogue'].includes(s));
 const alive=data.workers.some(w=>w.alive&&w.kind==='ingestion');
 const waiting=(c.maintenance&&!c.collection_during_maintenance)||data.quietWindow.active||!!data.timeoutRetry||c.daily_limit!==null&&Number(data.today.attempts)>=c.daily_limit;
 const suspended=stale||paused||!alive||waiting;
 const percent=f.percent??f.knownPercent,hasEta=Number.isFinite(f.minutesLow)&&Number.isFinite(f.minutesHigh);
 const low=hasEta?duration(f.minutesLow!):'',high=hasEta?duration(f.minutesHigh!):'';
 const title=!f.pending?f.failed||f.deferred?'Coada s-a încheiat cu goluri.':f.state==='complete'?'Coada este colectată.':'Nicio cerere programată.':suspended?'Estimare suspendată':hasEta?`≈ ${low===high?low:`${low}–${high}`} rămase`:'Măsurăm ritmul actual…';
 const explanation=!f.pending?'Datele devin vizibile după procesare și validare.':stale?'Așteptăm reconectarea pentru un termen actualizat.':paused?'Termenul se recalculează după reluarea colectării.':!alive?'Colectorul nu mai raportează. Termenul se recalculează la revenire.':waiting?'Colectarea este într-o pauză programată sau așteaptă reluarea.':hasEta?`${f.etaBasis==='known'?'Pentru coada cunoscută':'Pentru volumul estimat'} · ≈ ${fmt(Math.round(f.rate!/1440))} pași/min în ritmul recent.`:'Estimarea apare după cel puțin un minut și 20 de pași încheiați.';
 return <section className="recovery-overview" aria-labelledby="recovery-title">
  <div className="recovery-heading"><h2 id="recovery-title">Recuperarea, în ansamblu</h2><span>Până la {end}{following?' · extindere zilnică automată':''}</span></div>
  <div className="recovery-estimate"><div className="recovery-percent"><strong>{percent===null?'În evaluare':`${f.percent===null||f.state==='complete'?'':'≈ '}${percent}%`}</strong>{percent!==null&&<span>{f.percent===null?'din pașii cunoscuți':'din munca estimată'}</span>}</div><div><h3>{title}</h3><p>{explanation}</p>{!suspended&&hasEta&&<p className="recovery-finish">Încheiere estimată: {finish(f.calculatedAt,f.minutesLow!)} – {finish(f.calculatedAt,f.minutesHigh!)} <span>· ora României</span></p>}</div></div>
  {percent!==null&&<progress max={100} value={percent} aria-label={f.percent===null?'Progresul cozii cunoscute':'Progres total estimat'}/>}
  <div className="recovery-caption"><span>{fmt(f.completed)} pași încheiați · {fmt(f.pending)} în așteptare</span><span>Termenul se poate prelungi când descoperim pagini noi.</span></div>
  {(f.failed>0||f.deferred>0)&&<p className="recovery-gaps">Separat: {[f.failed>0?`${fmt(f.failed)} ${f.failed===1?'sarcină eșuată':'sarcini eșuate'}`:null,f.deferred>0?`${fmt(f.deferred)} ${f.deferred===1?'detaliu nepreluat':'detalii nepreluate'}`:null].filter(Boolean).join(' · ')}. Nu intră în timpul rămas.</p>}
  <details className="forecast-method"><summary>Pe ce se bazează estimarea?</summary>
   <p>Folosim pașii încheiați în ultimele maximum 10 minute, după cea mai recentă reluare sau schimbare a setărilor. Cererile eșuate nu sunt progres. Ritmul include timpul consumat de documente și pauzele din acest interval; nu este plafonul configurat.</p>
   <dl><div><dt>Pași încheiați din coada cunoscută</dt><dd>{fmt(f.completed)} / {fmt(f.known)}</dd></div><div><dt>Cereri rămase, inclusiv cele încă nedescoperite</dt><dd>{f.remainingLow===null?'Eșantion insuficient; termenul acoperă doar coada cunoscută.':`${fmt(f.remainingLow)}–${fmt(f.remainingHigh!)}`}</dd></div><div><dt>Ritm util recent</dt><dd>{f.rate===null?'Mai avem nevoie de observații':`≈ ${fmt(Math.round(f.rate/1440))} pași/min`}</dd></div></dl>
   <p>Estimăm separat volumul pentru instituții, zile de anunțuri, detalii și contracte. Pentru cererile încă nedescoperite cerem un eșantion din fiecare flux și catalogul încheiat. Până atunci afișăm timpul pentru coada cunoscută. Intervalul permite variații ale volumului și ritmului; nu garantează o dată de finalizare și nu anticipează durata viitoarelor mentenanțe.</p>
   <p>{following?'În fiecare zi, după 03:30, ora României, adăugăm zilele încheiate care lipsesc. Ziua în curs nu este colectată.':'Colectarea este limitată la data afișată.'} Data de sus este ținta cozii, nu dovada unei acoperiri complete. Golurile afișate separat necesită rezolvare; publicarea datelor are propriile verificări.</p>
  </details>
 </section>;
}
