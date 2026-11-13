import MoneyQuality from "./MoneyQuality";
import IsolatedIssues from "./IsolatedIssues";
import type {CollectionStatus} from '@/lib/admin/collection';
import {WEEKDAYS} from './model';

const timestamp=(value:unknown)=>value?new Date(String(value)).toLocaleString('ro-RO',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'}):'—';
const count=(value:unknown)=>new Intl.NumberFormat('ro-RO').format(Number(value??0));
const duration=(start:unknown,end:unknown)=>{const seconds=Math.max(0,Math.round(((end?new Date(String(end)).getTime():Date.now())-new Date(String(start)).getTime())/1000));return seconds>=3600?`${Math.floor(seconds/3600)} h ${Math.floor(seconds%3600/60)} min`:`${Math.floor(seconds/60)} min ${seconds%60} s`;};
const stages:Record<string,string>={'shadow-prepare':'Pregătim copia pe care o recalculăm',swap:'Publicăm copia nouă',drain:'Încheiem cererile și fișierele în curs',backup:'Salvăm copia de siguranță','backup-verified':'Copia de siguranță este verificată','reference-repair':'Corectăm datele ONRC și bilanțurile MF','currency-repair':'Corectăm o singură dată monedele istorice','authority-uat-repair':'Corectăm o singură dată legăturile autorităților cu localitățile','authority-fragment-repair':'Unim o singură dată fragmentele de autorități din arhivă','onrc-import':'Actualizăm registrul firmelor (ONRC)',normalize:'Procesăm datele noi','money-quality':'Verificăm valorile și monedele','identity-repair':'Grupăm o singură dată publicațiile repetate','identity-quality':'Verificăm publicațiile grupate',reconcile:'Asociem TED cu SEAP','ted-mart':'Actualizăm datele TED',marts:'Refacem tabelele statistice',flags:'Recalculăm semnalele de risc','flag-marts':'Actualizăm profilurile de risc',transactions:'Actualizăm listele de achiziții și totalurile',radiografie:'Refacem Radiografia',coverage:'Verificăm acoperirea datelor',validation:'Verificăm consistența rezultatelor',search:'Actualizăm căutarea',restart:'Pregătim redeschiderea site-ului',reopen:'Redeschidem site-ul',complete:'Publicare încheiată'};
const actionLabels:Record<string,string>={'replay-ted':'Reprocesăm istoricul TED','seed-legal-eras':'Pregătim pragurile pentru calcul','monitoring-refresh':'Recalculăm și verificăm datele','index-search':'Actualizăm căutarea'};
const WEEK=7*86400000;

/** Procesare: did last night's run publish, when is the next one, how fresh is what the site shows, what was left out. */
export default function ProcessingOverview({data}:{data:CollectionStatus}){
 const c=data.control!,latest=data.publication,verified=data.lastVerified;
 const runs=data.processing?.runs??[],run=runs[0],schedule=data.processing?.schedule;
 const current=run?.status==='running'?run:null;
 const active=data.workers.find(w=>w.alive&&w.kind==='processor'&&w.state!=='complete');
 const ted=Array.isArray(verified?.checks)?verified.checks.find((check:{check:string})=>check.check==='ted_normalization'):null;
 const lost=current&&Date.now()-new Date(String(current.heartbeat_at)).getTime()>120000;
 const riskAt=verified?(verified.risk?.calculatedAt??verified.completed_at):null;
 const riskOld=riskAt&&Date.now()-new Date(String(riskAt)).getTime()>WEEK+86400000;
 const scheduler=!!data.processing?.schedulerAlive;
 const verdict=!run?'Nicio rulare înregistrată.':current?`În curs: ${stages[current.stage]??current.stage}`:run.status==='failed'?`Oprită la etapa „${stages[run.stage]??run.stage}”`:'Publicată';
 return <section className="publication" id="publication" aria-labelledby="run-title">
  <div className="section-heading"><h2 id="run-title">Ultima rulare</h2><span className={`badge ${c.maintenance?'warning':'neutral'}`}>{c.maintenance?'Site în mentenanță':active||current?'Procesare în curs':'Site disponibil'}</span></div>
  <div className={`run-verdict${run?.status==='failed'||lost?' is-failed':''}`} role={run?.status==='failed'?'alert':undefined}>
   <strong>{verdict}</strong>
   {run&&<span>{timestamp(run.started_at)} · {run.scope==='full'?'cu recalcularea riscului':'date și statistici'} · {duration(run.started_at,current?null:run.completed_at)}{current?' de la pornire':''}</span>}
   {active&&!current&&<span>{actionLabels[active.state]??'Procesare în curs pe server'}</span>}
   {run?.status==='failed'&&(run.mode==='shadow'?<span>Site-ul a rămas pe datele precedente. Următoarea rulare o ia de la capăt.</span>:<span>Mentenanța se păstrează. Verifică jurnalul de pe server înainte de recuperare; nu reîncercăm automat.</span>)}
   {lost&&<span>Nu mai primim semnal de la procesare. Verifică serverul; {current?.mode==='shadow'?'site-ul rămâne pe datele precedente.':'mentenanța rămâne activă.'}</span>}
  </div>
  <dl className="processing-freshness">
   <div><dt>Următoarea rulare</dt><dd>{!c.processing_enabled?'Program oprit: datele existente rămân publicate.':!scheduler?<span className="warn-text">Programul e pornit, dar serviciul de programare nu trimite semnal.</span>:schedule?.next_at?timestamp(schedule.next_at):'Neprogramată'}{c.maintenance&&(c.collection_during_maintenance?' Colectarea în arhivă continuă; site-ul se redeschide după verificări.':' Nicio rulare nouă nu pornește în mentenanță.')}</dd></div>
   {c.processing_enabled&&scheduler&&schedule?.next_risk_at&&<div><dt>Cu recalcularea riscului</dt><dd>{timestamp(schedule.next_risk_at)} · {WEEKDAYS[c.risk_weekday??0]!.toLowerCase()}</dd></div>}
   <div><dt>Date și statistici verificate</dt><dd>{verified?timestamp(verified.completed_at):'Nicio publicare completă verificată'}</dd></div>
   <div><dt>Semnale de risc recalculate</dt><dd>{riskAt?<>{timestamp(riskAt)}{riskOld&&<span className="warn-text"> · mai vechi de o săptămână</span>}</>:'Așteaptă o recalculare completă verificată'}</dd></div>
   {ted&&<div><dt>Istoric TED verificat</dt><dd>{count(ted.details.total)} anunțuri · {count(ted.details.pending)} de normalizat</dd></div>}
  </dl>
  {latest&&latest.status==='failed'&&run?.status!=='failed'&&<p className="publication-note warn-text">{latest.kind==='manual'?'O etapă separată a modificat datele: publicarea așteaptă recalcularea și verificarea completă.':'Ultima actualizare n-a trecut toate verificările: publicarea așteaptă rezolvarea erorii.'}</p>}
  <IsolatedIssues data={data.isolated}/>
  <MoneyQuality report={data.moneyQuality??null}/>
  {runs.length>0&&<details className="processing-decisions"><summary>Ultimele {runs.length} rulări și durata etapelor</summary><ul>{runs.map(r=><li key={r.id}><strong>{timestamp(r.started_at)} · {r.scope==='full'?'cu riscul':'date și statistici'}</strong><p>{r.status==='ready'?'Publicată':r.status==='failed'?'Oprită la eroare':'În curs'} · {duration(r.started_at,r.completed_at)}</p><dl className="processing-stage-times">{Object.entries(r.stages??{}).map(([key,v])=><div key={key}><dt>{stages[key]??key}</dt><dd>{duration((v as any).startedAt,(v as any).completedAt)}</dd></div>)}</dl></li>)}</ul></details>}
  <details className="processing-decisions"><summary>Cum rulează publicarea</summary><ul><li>Zilnic: date noi, asocieri TED–SEAP, tabele statistice, Radiografie și căutare. În ziua aleasă, și recalcularea completă a semnalelor de risc.</li><li>Înaintea publicării: oprirea colectării, backup, recalculare, verificări și actualizarea căutării. La eroare, mentenanța rămâne activă.</li><li>Rularea zilnică păstrează data calculului de risc și reverifică dovezile existente; dacă nu mai corespund surselor, publicarea se oprește.</li></ul></details>
 </section>;
}
