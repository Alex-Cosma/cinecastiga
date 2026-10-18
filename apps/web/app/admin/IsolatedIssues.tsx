import type {CollectionStatus} from '@/lib/admin/collection';
const timestamp=(value:unknown)=>new Date(String(value)).toLocaleString('ro-RO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'});

/** Problems the nightly publication left out instead of staying in maintenance. */
export default function IsolatedIssues({data}:{data:CollectionStatus['isolated']}){
 const {revokedIdentities:revoked,quarantinedRecords:records}=data;
 if(!revoked.length&&!records.length)return null;
 return <details className="processing-decisions" open><summary>De verificat · {revoked.length+records.length} probleme izolate</summary>
  <p>Publicarea a continuat fără ele. Dispar din listă după rezolvare.</p>
  {revoked.length>0&&<><h3>Grupuri de publicări excluse din totaluri</h3><ol>{revoked.map(r=><li key={r.id}><strong>{timestamp(r.created_at)} · {r.publications} publicări</strong><p>{r.reason}</p><p>Grupul {String(r.candidate).slice(0,12)} rămâne exclus până la o regulă nouă sau o verificare.</p></li>)}</ol></>}
  {records.length>0&&<><h3>Înregistrări în carantină</h3><ol>{records.map(r=><li key={r.raw_id}><strong>{timestamp(r.first_seen)} · înregistrarea {r.raw_id} ({r.endpoint})</strong><p>{r.error}</p><p>{r.attempts} încercări. Se reîncearcă la fiecare rulare; pe site rămâne ultima versiune bună.</p></li>)}</ol></>}
 </details>;
}
