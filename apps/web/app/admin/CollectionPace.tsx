import type {CollectionStatus} from '@/lib/admin/collection';

const number=(value:number)=>new Intl.NumberFormat('ro-RO',{maximumFractionDigits:1}).format(value);

/** Read-only ledger measurements; never derived from an unapplied settings draft. */
export default function CollectionPace({data,stale,compact=false}:{data:CollectionStatus;stale:boolean;compact?:boolean}){
 const {settings,endpoints,observedPerMinute,directPerMinute,retiredPerMinute}=data.proxies;
 const enabled=endpoints.filter(p=>p.enabled).length;
 const capacity=Math.min(Number(settings.requests_per_minute),enabled*120/(Number(settings.min_seconds)+Number(settings.max_seconds)));
 return <div className={`collection-pace${compact?' compact':''}`}>
  <dl>
   <div><dt>Ritm total observat</dt><dd>{stale?'—':number(observedPerMinute)} <small>cereri/min</small></dd></div>
   {settings.enabled&&<>
    <div><dt>Proxy-uri activate</dt><dd>{stale?'—':enabled} <small>din {endpoints.filter(p=>p.configured).length}</small></dd></div>
    <div><dt>Interval pe fiecare IP</dt><dd>{settings.min_seconds}–{settings.max_seconds} <small>sec</small></dd></div>
    <div><dt>Plafon total</dt><dd>{settings.requests_per_minute} <small>cereri/min</small></dd></div>
   </>}
   <div><dt>Cereri în curs</dt><dd>{stale?'—':data.requests.filter(r=>r.outcome==='running').length} <small>/ {settings.enabled?settings.max_in_flight??1:1} simultan</small></dd></div>
  </dl>
  <p>Media ultimelor 10 minute, inclusiv pauzele și încercările eșuate.{settings.enabled&&directPerMinute>0&&<> Include {number(directPerMinute)} cereri/min din conexiunea directă folosită anterior.</>}{retiredPerMinute>0&&<> Include {number(retiredPerMinute)} cereri/min din proxy-uri retrase recent.</>}</p>
  {settings.enabled&&<details><summary>Ce ritm permit setările?</summary><p>{stale?'Estimarea așteaptă actualizarea statusului.':<>Aproximativ <strong>{number(capacity)} cereri/min</strong> cu toate cele {enabled} proxy-uri activate disponibile, la intervalul mediu de {(Number(settings.min_seconds)+Number(settings.max_seconds))/2} sec/IP, în limita plafonului total. Timpul de răspuns, documentele și pauzele pot reduce ritmul real.</>}</p></details>}
 </div>;
}
