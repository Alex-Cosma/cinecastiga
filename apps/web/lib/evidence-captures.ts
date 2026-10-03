import { contractOriginalValue, contractOriginalCurrency, contractAmountStatus, contractRonValue } from "@seap/db";
import { randomUUID } from "node:crypto";
import { canonicalEntityId, createDb, MonitoringRefreshUnavailableError, withMonitoringSnapshot, type DbSql } from "@seap/db";
import { getInvestigationAccess, isWorkspaceId, withInvestigationAccess } from "./investigation-access";
import type { CaptureRequest, CaptureSummary, CaptureStatus, FrozenRecord } from "./evidence-captures-shared";
import { contractSnapshot, freezeRow, validateCaptureRequest } from "./evidence-capture-input";
import { ground } from "./ask/ground";
import { runRows, runSpec } from "./ask/compile";
import { canonicalAskIdentities } from "./ask/canonical-identities";
import { buildPills } from "./ask/pills";
import type { AskSpec } from "./ask/spec";
import { readCoverage } from "./coverage";
import { readSignalEvidence } from "./signal-evidence";
import { bindRadiografiePattern, readRadiografieEvidence, requireRadiografiePattern, RadiografieIdentityError, validateRadiografieSelection } from "./radiografie-evidence";
import { readContractEvidence, readDaEvidence, type SourceEvidence } from "./source-evidence";
import { bindConnectionEvidence, connectionEvidenceError, withConnectionEvidence } from "./connection-evidence";
import { bindPeerEvidence, peerCaptureFingerprint, peerEvidenceError, peerEvidenceOptions, withPeerEvidence, type BoundPeerEvidence } from "./peers-evidence";

const globalDb = globalThis as unknown as { __evidenceCaptureSql?: DbSql };
export const captureDatabase = () => globalDb.__evidenceCaptureSql ??= createDb().sql;
export const CAPTURE_METHODOLOGY = {
  version: "frozen-evidence-1", riskVersion: null, // Stored captures name the actual published risk methodology below.
  values: "Valori înregistrate în surse, nu plăți verificate. Sumele exacte sunt șiruri zecimale.",
  contracts: "Rândurile contractelor reprezintă cotele canonice ale furnizorilor; valoarea integrală a contractului rămâne separată și nu se adună pentru fiecare membru al consorțiului.",
  completeness: "O captură completă conține toate rândurile selecției efective. O eroare anulează toate rândurile versiunii; nu se publică un eșantion ca rezultat complet.",
  sources: "Datele normalizate și linkurile originale sunt incluse; paginile externe și documentele lor nu sunt arhivate în acest pachet.",
  risk: "Semnalele statistice sunt piste de verificare, nu dovezi de nereguli.",
} as const;
class CaptureError extends Error {}
export function captureRequestError(error:unknown):string|null{
  return error instanceof CaptureError||error instanceof RadiografieIdentityError||error instanceof MonitoringRefreshUnavailableError?error.message:peerEvidenceError(error)?.error??connectionEvidenceError(error)?.error??null;
}
const json = (value: unknown) => JSON.stringify(value ?? null);

/** Reuse query builders inside the already-authorized repeatable-read snapshot.
 * Nested read-only BEGINs are intentionally not opened: the same transaction
 * also persists the complete source SELECT into the investigation's app tables. */
export function captureTransaction(q: DbSql): DbSql {
  const bound = ((...args: unknown[]) => (q as unknown as (...args: unknown[]) => unknown)(...args)) as unknown as DbSql;
  Object.assign(bound, q, { begin: (options: unknown, run?: (sql: DbSql) => Promise<unknown>) =>
    (typeof options === "function" ? options as (sql: DbSql) => Promise<unknown> : run!)(q) });
  return bound;
}

export function captureSummary(row: Record<string, unknown>): CaptureSummary {
  const date = (value: unknown) => value instanceof Date ? value.toISOString() : value == null ? null : String(value);
  return { id: String(row.id), version: Number(row.version), status: row.status as CaptureStatus,
    createdAt: date(row.created_at)!, startedAt: date(row.started_at), completedAt: date(row.completed_at),
    rowCount: row.row_count == null ? null : Number(row.row_count), totalExact: row.total_exact == null ? null : String(row.total_exact),
    error: row.error == null ? null : String(row.error), scope: row.request as CaptureRequest,
    methodology: row.methodology as Record<string, unknown> | null, summary: row.summary as Record<string, unknown> | null };
}

/** Caller holds the authorized investigation lock; each invocation adds a version. */
export async function queueCapture(q: DbSql, userId: string, investigationId: string, clipId: string, request: CaptureRequest): Promise<CaptureSummary> {
  if (request.kind === "monitoring") throw new CaptureError("Adaugă o actualizare nouă din Urmăriri. Versiunile unei modificări rămân neschimbate.");
  if (request.kind === "note") throw new CaptureError("O notă este conținut editorial, nu o captură de date.");
  let boundRequest=request;
  if(request.peer){
    const bound=await bindPeerEvidence(q,request.peer);
    peerEvidenceOptions(bound,request.options,true);
    const fingerprint=peerCaptureFingerprint(bound);
    if(request.peerBinding&&request.peerBinding.fingerprint!==fingerprint)throw new CaptureError("Membrii sau datele comparației s-au schimbat. Reia comparația; nu am salvat un alt grup în locul lui.");
    boundRequest={...request,spec:bound.spec,peer:bound.selection,peerBinding:{fingerprint}};
  }
  if(request.connection){
    const bound=await bindConnectionEvidence(q,request.connection);
    boundRequest={...request,spec:bound.spec,connection:bound.selection};
  }
  const selection=request.kind==="radiografie"?validateRadiografieSelection(request.spec):null;
  if(selection?.type==="pattern"){
    if(!request.sourceBinding&&!selection.expectedFingerprint)
      throw new CaptureError("Reîncarcă pagina tiparului înainte de salvare, pentru a verifica identitatea selecției afișate.");
    const binding=await bindRadiografiePattern(q,request.refId!,selection.patternId);
    if(selection.expectedFingerprint&&selection.expectedFingerprint!==binding.fingerprint)
      throw new CaptureError("Tiparul afișat s-a schimbat între timp. Reîncarcă Radiografia; nu am salvat alt tipar în locul lui.");
    if(request.sourceBinding)requireRadiografiePattern(request.sourceBinding,binding);
    boundRequest={...request,sourceBinding:request.sourceBinding??binding};
  }
  const [row] = await q`insert into app.evidence_captures(id,investigation_id,clip_id,version,created_by,request)
    select ${randomUUID()},${investigationId},${clipId},coalesce(max(version),0)+1,${userId},${json(boundRequest)}::jsonb
    from app.evidence_captures where clip_id=${clipId} returning *`;
  return captureSummary(row!);
}

export async function recaptureClip(userId: string, investigationId: string, clipId: string, sql = captureDatabase()) {
  if (!isWorkspaceId(clipId)) return null;
  return withInvestigationAccess(userId, investigationId, "edit", async q => {
    const [clip] = await q`select kind,ref_id,spec,snapshot from app.clips where id=${clipId} and investigation_id=${investigationId}`;
    if (!clip) return null;
    const request = validateCaptureRequest(clip.kind, clip.ref_id, clip.spec, clip.snapshot);
    if ("error" in request) throw new CaptureError(request.error);
    if(request.peer){
      const [previous]=await q`select request from app.evidence_captures where clip_id=${clipId} and investigation_id=${investigationId} order by version desc limit 1`;
      const binding=(previous?.request as CaptureRequest|undefined)?.peerBinding;
      if(!binding)throw new CaptureError("Salvarea nu conține identitatea grupului. Reia comparația și salvează selecția dorită.");
      request.peerBinding=binding;
    }
    if(request.kind==="radiografie"&&validateRadiografieSelection(request.spec)?.type==="pattern"){
      const [previous]=await q`select request from app.evidence_captures where clip_id=${clipId} and investigation_id=${investigationId} order by version desc limit 1`;
      const binding=(previous?.request as CaptureRequest|undefined)?.sourceBinding;
      if(!binding)throw new CaptureError("Salvarea veche nu are identitatea stabilă a tiparului. Deschide Radiografia actuală și salvează separat tiparul dorit.");
      request.sourceBinding=binding;
    }
    return queueCapture(q, userId, investigationId, clipId, request);
  }, sql);
}

export async function getCapture(userId: string, investigationId: string, captureId: string, sql = captureDatabase()): Promise<CaptureSummary | null> {
  if (!isWorkspaceId(captureId)) return null;
  return withInvestigationAccess(userId,investigationId,"read",async q=>{
    const [row]=await q`select * from app.evidence_captures where id=${captureId} and investigation_id=${investigationId}`;
    return row?captureSummary(row):null;
  },sql);
}

export async function getCapturedRows(userId: string, investigationId: string, captureId: string, after = 0, sql = captureDatabase()) {
  if (!isWorkspaceId(captureId)) return null;
  return withInvestigationAccess(userId,investigationId,"read",async q=>{
    const [row]=await q`select * from app.evidence_captures where id=${captureId} and investigation_id=${investigationId} and status='complete'`;
    if(!row)return null;
    const capture=captureSummary(row);
    const cursor = Number.isSafeInteger(after) && after >= 0 ? after : 0;
    const rows = await q`select row_no::text cursor,record from app.evidence_capture_rows
      where capture_id=${captureId} and row_no>${cursor} order by row_no limit 100`;
    return { capture, rows: rows.map(row => ({ cursor: String(row.cursor), ...row.record as FrozenRecord })),
      nextCursor: rows.length ? String(rows.at(-1)!.cursor) : null };
  },sql);
}

async function persistRecords(q: DbSql, captureId: string, records: FrozenRecord[]) {
  for (let i = 0; i < records.length; i += 1000) {
    const chunk = records.slice(i, i + 1000).map((record, offset) => ({ n: i + offset + 1, record }));
    await q`insert into app.evidence_capture_rows(capture_id,row_no,record,value_exact)
      select ${captureId},item.n,item.record,(item.record->>'valueExact')::numeric
      from jsonb_to_recordset(${json(chunk)}::jsonb) item(n bigint,record jsonb)`;
  }
}

/** SQL-to-SQL copy: no page limit, JS row buffer or client-provided amounts. */
async function persistQueryRows(q: DbSql, captureId: string, source: ReturnType<DbSql>) {
  await q`insert into app.evidence_capture_rows(capture_id,row_no,record,value_exact)
    select ${captureId},row_number() over(),jsonb_build_object(
      'daCode',r.da_code,'date',left(r.finalization_date,10),
      'authorityId',r.authority_id::text,'authority',r.authority_name,
      'supplierId',r.supplier_id::text,'supplier',r.supplier_name,'county',r.county,
      'cpvCode',r.cpv_code,'cpvName',r.cpv_name,'valueExact',r.closing_value::text,
      'src',r.src,'refId',case when r.src='contracts' then c.ca_notice_contract_id::text else r.ref_id::text end,'contractInternalId',case when r.src='contracts' then r.ref_id::text else null end,'caNoticeId',r.ca_notice_id::text,'tedPubnum',r.ted_pubnum,
      'state',r.state,'nWinners',r.n_winners,'contractValueFull',r.contract_value_full::text,
      'valueSuspect',coalesce(r.value_suspect,false),
      'sourceUrl',case when r.src='da' and r.ref_id is not null then 'https://e-licitatie.ro/pub/direct-acquisition/view/'||r.ref_id::text
        when r.src='contracts' and r.ca_notice_id is not null then 'https://e-licitatie.ro/pub/notices/ca-notices/view-c/'||r.ca_notice_id::text else null end,
      'tedUrl',case when r.ted_pubnum ~ '^[0-9-]+$' then 'https://ted.europa.eu/en/notice/-/detail/'||r.ted_pubnum else null end
    ),r.closing_value::numeric from (${source}) r left join core.contracts c on r.src='contracts' and c.id=r.ref_id`;
}

async function queryCapture(q: DbSql, captureId: string, spec: AskSpec, request: CaptureRequest, peerEvidence?: BoundPeerEvidence) {
  if (request.peer) return peerCapture(q,captureId,request,peerEvidence);
  const connection = request.connection ? await bindConnectionEvidence(q, request.connection) : null;
  if (connection) spec = connection.spec;
  const database = captureTransaction(q);
  let grounding = connection?.grounding ?? await ground(database, spec.filters);
  const canonical=await canonicalAskIdentities(database,spec,grounding,request.options.scope);
  spec=canonical.spec;grounding=canonical.grounding;
  const options={...request.options,...(canonical.scope?{scope:canonical.scope}:{})};
  const answer = await runSpec(database, spec, grounding);
  if ("error" in answer) throw new CaptureError(answer.error);
  const sources = await runRows(database, spec, grounding, 0, { ...options,
    capture: { persist: (database, query) => persistQueryRows(database, captureId, query) } });
  if ("error" in sources) throw new CaptureError(sources.error);
  const connectionSourceCounts = connection ? await q`select record->>'authorityId' "authorityId",record->>'supplierId' "supplierId",
    count(*)::int "rowCount",trim_scale(sum(value_exact))::text "totalExact" from app.evidence_capture_rows
    where capture_id=${captureId} group by record->>'authorityId',record->>'supplierId'` : [];
  const connectionSources = connection?.context.pairs.map(pair => {
    const source = connectionSourceCounts.find(row => row.authorityId === pair.authority.id && row.supplierId === pair.supplier.id);
    return { authorityId: pair.authority.id, supplierId: pair.supplier.id, rowCount: Number(source?.rowCount ?? 0),
      totalExact: source ? source.totalExact == null ? null : String(source.totalExact) : "0" };
  });
  if (connectionSources?.some(pair => pair.rowCount === 0)) throw new CaptureError("Filtrele nu păstrează surse pentru fiecare legătură a traseului. Elimină filtrele listei sau salvează separat legătura care are surse. Nu am păstrat un traseu incomplet ca legătură documentată.");
  const { rows: _rows, ...sourceMetadata } = sources;
  const pills = buildPills(spec, grounding);
  return { summary: { title: connection?.context.title ?? pills.join(" · "), pills, ...(connection ? { connection: connection.selection, connectionContext: {...connection.context,sourcePairs:connectionSources} } : {}), evidenceScope: options.scope ?? {},
    evidenceOptions: { search: request.options.search, state: request.options.state, stream: request.options.stream },
    grounding, effectiveSpec: spec, sources: sourceMetadata, warnings: [...answer.caveats, ...sources.scopeNotes] },
    result: answer, expectedRows: sources.total, expectedTotal: sources.value, methodology: CAPTURE_METHODOLOGY };
}

async function peerCapture(q: DbSql, captureId: string, request: CaptureRequest, peerEvidence?: BoundPeerEvidence) {
  const bound = peerEvidence ?? await bindPeerEvidence(q,request.peer);
  if (!request.peerBinding || request.peerBinding.fingerprint!==peerCaptureFingerprint(bound))
    throw new CaptureError("Membrii sau datele comparației s-au schimbat. Reia comparația; nu am salvat un alt grup în locul lui.");
  const options = peerEvidenceOptions(bound,request.options,true);
  const sources = await runRows(captureTransaction(q),bound.spec,bound.grounding,0,{...options,
    capture:{persist:(database,query)=>persistQueryRows(database,captureId,query)}});
  if ("error" in sources) throw new CaptureError(sources.error);
  const roleKey = bound.selection.role === "authority" ? "authorityId" : "supplierId";
  const stored = await q`select record->>${roleKey} entity_id,count(*)::int row_count,trim_scale(sum(value_exact))::text total_exact
    from app.evidence_capture_rows where capture_id=${captureId} group by 1`;
  const filtered = !!(request.options.search || request.options.state || request.options.stream);
  if (!filtered) for (const member of bound.sourceMembers) {
    const found = stored.find(row=>row.entity_id===member.entity.id);
    const [comparison] = await q`select ${found?.total_exact??"0"}::numeric=${member.totalExact}::numeric equal_value`;
    if (Number(found?.row_count??0)!==member.recordCount || !comparison?.equal_value)
      throw new CaptureError("Sursele păstrate nu corespund fiecărui membru al comparației. Nu am publicat o comparație incompletă.");
  }
  const {rows:_rows,...sourceMetadata}=sources;
  const sourceMembers = bound.sourceMembers.map(member => {
    const row = stored.find(candidate => candidate.entity_id === member.entity.id);
    return { entityId: member.entity.id, rowCount: Number(row?.row_count ?? 0), totalExact: String(row?.total_exact ?? "0"),
      ...(bound.selection.version === "peer-evidence-2" ? { hasRecordedData: !!row } : {}) };
  });
  const context={...bound.context,filteredMemberSources:filtered,sourceMembers,
    ...(filtered?{description:bound.context.description+" Lista păstrată este restrânsă de filtrele de surse afișate; totalurile membrului și mediana rămân contextul nefiltrat."}:{})};
  return {summary:{title:context.title,peer:bound.selection,peerContext:context,grounding:bound.grounding,effectiveSpec:bound.spec,
    evidenceScope:{},evidenceOptions:{search:request.options.search,state:request.options.state,stream:request.options.stream},sources:sourceMetadata,
    warnings:[...bound.comparison.methodology.descriptions,...sources.scopeNotes]},
    result:{type:"peer-comparison",...context},expectedRows:sources.total,expectedTotal:sources.value,
    methodology:{...CAPTURE_METHODOLOGY,peerMethodology:bound.comparison.methodology}};
}

async function namedCapture(q: DbSql, captureId: string, request: CaptureRequest) {
  const id = request.refId!;
  let finding: SourceEvidence | null = null;
  let records: FrozenRecord[] | null = null;
  let summary: Record<string, unknown> = {};
  if (request.kind === "signal") finding = await readSignalEvidence(q, id);
  if(request.kind==="radiografie"){
    if(validateRadiografieSelection(request.spec)?.type==="pattern"&&!request.sourceBinding)
      throw new CaptureError("Captura veche nu conține identitatea stabilă a tiparului. Deschide Radiografia actuală și salvează separat tiparul dorit.");
    finding=await readRadiografieEvidence(q,id,request.spec,request.sourceBinding);
  }
  if (request.kind === "flag") {
    const [flag] = await q`select id::text from core.flags where subject_id=${id} and triggered
      and flag_code=${String((request.spec as Record<string, unknown>).flag)} order by severity desc nulls last,id limit 1`;
    if (flag) finding = await readSignalEvidence(q, flag.id);
  }
  if (request.kind === "da") {
    const [original] = await q`select closing_value::text value,estimated_value_ron::text estimate,state,da_code title from core.direct_acquisitions where sicap_da_id=${id}`;
    const rows = original ? await readDaEvidence(q, q`da.sicap_da_id=${id}`) : [];
    if (!original || !rows.length) throw new CaptureError("Achiziția nu mai este disponibilă.");
    records = rows.map(row => freezeRow(row, original.value));
    summary = { title: original.title ?? rows[0]!.daCode, valueRon: original.value, valueExact: original.value,
      estimatedValueExact: original.estimate, state: original.state, authority: rows[0]!.authority, supplier: rows[0]!.supplier,
      date: rows[0]!.date, warnings: original.value == null ? ["Sursa nu publică o valoare de închidere; lipsa nu este zero."] : [] };
  }
  if (request.kind === "contract") {
    const [contract] = await q`select c.id::text,${contractOriginalValue(q)}::text value,${contractOriginalCurrency(q)} currency,
      ${contractAmountStatus(q)} amount_status,${contractRonValue(q)}::text value_ron,title,ca_notice_id::text notice_id,
      to_char(contract_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD') date from core.contracts c where ca_notice_contract_id=${id}`;
    if (!contract) throw new CaptureError("Contractul nu mai este disponibil.");
    const rows = await readContractEvidence(q, q`ct.contract_id=${contract.id}`);
    records = rows.map(row => freezeRow(row));
    summary = { ...contractSnapshot(contract.value,contract.currency,rows,contract.title), date: contract.date, amountStatus:contract.amount_status,valueRon:contract.value_ron,
      sourceUrls: contract.notice_id ? [`https://e-licitatie.ro/pub/notices/ca-notices/view-c/${contract.notice_id}`] : [],
      warnings: ["Valoarea integrală a contractului este separată de cotele furnizorilor. Nu este dovada plății.",
        ...(!rows.length ? ["Contractul există în sursa importată, dar nu este inclus în populația analitică actuală. Valoarea și moneda originale rămân în context."] : [])] };
  }
  if (request.kind === "notice") {
    const rows = await readContractEvidence(q, q`ct.ca_notice_id=${id}`);
    const [notice] = await q`select notice_no,notice_no title,ron_contract_value::text value from core.awards where ca_notice_id=${id}`;
    if (!notice) throw new CaptureError("Anunțul nu mai este disponibil.");
    records = rows.map(row => freezeRow(row));
    summary = { title: notice.title, noticeNo: notice.notice_no, originalNoticeValueExact: notice.value,
      nContracts: new Set(rows.map(r => r.refId)).size, authority: rows[0]?.authority ?? null,
      sourceUrls: [`https://e-licitatie.ro/pub/notices/ca-notices/view-c/${id}`],
      warnings: ["Numărul de contracte distincte este separat de numărul cotelor furnizorilor. Valoarea anunțului nu este adunată la contracte."] };
  }
  if (finding) {
    records = finding.records.map(row => freezeRow(row));
    summary = { ...finding.context, title: finding.title, methodology: finding.methodology,
      context: finding.context, warnings: finding.warnings };
  }
  if (records === null) throw new CaptureError("Nu am găsit selecția de surse cerută.");
  await persistRecords(q, captureId, records);
  return { summary, result: finding?.context ?? summary, expectedRows: records.length,
    expectedTotal: records.some(row=>row.valueExact===null) ? null : finding?.totalExact ?? null,
    methodology: { ...CAPTURE_METHODOLOGY, ...(finding ? { sourceVersion: finding.methodology } : {}) } };
}

async function entityOrPerson(q: DbSql, captureId: string, request: CaptureRequest) {
  const id = request.kind==='entity' ? await canonicalEntityId(q,request.refId!) : request.refId!;
  if (request.kind === "person") {
    const [person] = await q`select max(person_name) name,count(distinct cui)::int n_firms,
      to_jsonb(array_agg(distinct cui)) cuis from reference.company_reps where person_key=${id} group by person_key`;
    if (!person) throw new CaptureError("Persoana nu mai este disponibilă.");
    const spec: AskSpec = { block: "stat", measure: "value", dataset: "all", filters: { adminPersonKey: id } };
    const result = await queryCapture(q,captureId,spec,request);
    result.summary = { ...result.summary, ...{ name: person.name, title: person.name, nFirms: person.n_firms, firms: person.cuis } };
    return result;
  }
  const [entity] = await q`select name_display name,county,cui_canonical cui from core.entities where id=${id}`;
  if (!entity) throw new CaptureError("Entitatea nu mai este disponibilă.");
  const profiles = await q`select role,n_das,n_contracts,total_ron_full::text value from marts.entity_profile where entity_id=${id}`;
  const flags = await q`select role,cri::text,n_flags,to_jsonb(flags) flags from marts.entity_flags where entity_id=${id}`;
  const spec = { block: "stat", measure: "value", dataset: "all", filters: {}, population: { operator: "or", groups: [
    { operator: "or", conditions: [{ field: "authority", op: "in", values: [id] }, { field: "supplier", op: "in", values: [id] }] },
  ] } } as unknown as AskSpec;
  const result = await queryCapture(q,captureId,spec,request);
  result.summary = { ...result.summary, ...{ entityId:id,requestedEntityId:request.refId,title: entity.name, name: entity.name, county: entity.county, cui: entity.cui,
    roles: Object.fromEntries(profiles.map(r => [r.role,{ nDas:r.n_das,nContracts:r.n_contracts,totalRon:r.value }])),
    riskProfiles: flags, cri: flags[0]?.cri ?? null, nFlags: flags[0]?.n_flags ?? 0 } };
  return result;
}

/** Durable job runner. A failed/incomplete version has no committed source rows.
 * The caller schedules this after responding, or explicitly resumes it later. */
export async function processCapture(userId: string, investigationId: string, captureId: string, sql = captureDatabase(),
  hooks: { beforePublish?:()=>Promise<void> } = {}): Promise<void> {
  if (!isWorkspaceId(captureId)) return;
  const claim = await withInvestigationAccess(userId, investigationId, "edit", async q => {
    const [row] = await q`select status,started_at from app.evidence_captures
      where id=${captureId} and investigation_id=${investigationId} for update skip locked`;
    if (!row || row.status === "complete") return null;
    if (row.status === "running" && row.started_at && Date.now()-new Date(row.started_at).getTime() < 5*60_000) return null;
    const [started]=await q`update app.evidence_captures set status='running',started_at=now(),error=null
      where id=${captureId} returning started_at::text token`;
    return String(started!.token);
  }, sql);
  if (!claim) return;
  try {
    const [queued] = await sql`select request from app.evidence_captures where id=${captureId} and investigation_id=${investigationId}`;
    const connection = (queued?.request as CaptureRequest | undefined)?.connection;
    const peer = (queued?.request as CaptureRequest | undefined)?.peer;
    const execute = async (transaction: DbSql, peerEvidence?: BoundPeerEvidence) => {
      const q=transaction as unknown as DbSql;
      const access=await getInvestigationAccess(userId,investigationId,q);
      if(!access?.canEdit)throw new CaptureError("Accesul la anchetă s-a schimbat. Captura nu a fost publicată.");
      const [job] = await q`select * from app.evidence_captures where id=${captureId} and investigation_id=${investigationId}
        and status='running' and started_at::text=${claim} for update skip locked`;
      if (!job) return;
      await q`set local statement_timeout='15min'`;
      const request = job.request as CaptureRequest;
      const [time] = await q`select transaction_timestamp()::text captured_at`;
      await q`delete from app.evidence_capture_rows where capture_id=${captureId}`;
      const result = request.kind === "query" ? await queryCapture(q,captureId,request.spec as AskSpec,request,peerEvidence)
        : request.kind === "entity" || request.kind === "person" ? await entityOrPerson(q,captureId,request)
        : await namedCapture(q,captureId,request);
      const [totals] = await q`select count(*)::text n,coalesce(sum(value_exact),0)::text known_value,
        count(*) filter(where value_exact is null)::int unknown,
        (${result.expectedTotal}::numeric is null or coalesce(sum(value_exact),0)=${result.expectedTotal}::numeric) reconciled
        from app.evidence_capture_rows where capture_id=${captureId}`;
      if (Number(totals!.n)!==result.expectedRows || !totals!.reconciled) throw new CaptureError("Captura nu corespunde selecției complete. Nu am salvat o listă parțială.");
      const totalExact = totals!.unknown ? null : String(totals!.known_value);
      const coverage = await readCoverage(q);
      const [published]=await q`select id,version::text,methodology from app.monitoring_refreshes order by version desc limit 1`;
      const methodology={...result.methodology,checkpointId:String(published!.id),checkpointVersion:String(published!.version),
        riskVersion:typeof published!.methodology?.flags==='string'?published!.methodology.flags:null};
      const summary = { ...result.summary, verification:"server-verified", capturedAt:time!.captured_at,
        captureId, rowCount:Number(totals!.n), totalExact, knownValueExact:String(totals!.known_value), unknownValues:Number(totals!.unknown),
        valueRon: "valueRon" in result.summary ? result.summary.valueRon : totalExact,
        evidenceScope:result.summary.evidenceScope??request.options.scope??{}, evidenceOptions:{search:request.options.search,state:request.options.state,stream:request.options.stream},
        sourceTotals:{count:Number(totals!.n),value:totalExact}, complete:true };
      await hooks.beforePublish?.();
      // Long reads do not lock the workspace. At publication, a member/owner
      // change updates this parent and forces RR serialization rollback. Once
      // locked, revocation waits for this short atomic publication to finish.
      await q`select id from app.investigations where id=${investigationId} for update`;
      if(!(await getInvestigationAccess(userId,investigationId,q))?.canEdit)throw new CaptureError("Accesul la anchetă s-a schimbat. Captura nu a fost publicată.");
      await q`update app.evidence_captures set status='complete',summary=${json(summary)}::jsonb,
        result=${json(result.result)}::jsonb,coverage=${json(coverage)}::jsonb,methodology=${json(methodology)}::jsonb,
        row_count=${Number(totals!.n)},total_exact=${totalExact},completed_at=now(),error=null where id=${captureId}`;
      await q`update app.investigations set updated_at=now() where id=${investigationId}`;
    };
    if(peer) await withPeerEvidence(sql,peer,async (q,bound)=>execute(q,bound));
    else if(connection) await withConnectionEvidence(sql,connection,async q=>execute(q));
    // Ordinary entity/query/source captures share the publication gate too.
    // A queued job must not freeze repaired core rows over preceding marts.
    else await withMonitoringSnapshot(sql,q=>execute(q));
  } catch (error) {
    const code=(error as {code?:string}).code;
    const message = captureRequestError(error) ?? (code==="40001"
      ? "Datele sau accesul la anchetă s-au schimbat în timpul capturii. Nicio probă parțială nu a fost publicată; reîncearcă."
      : error instanceof Error && error.message.includes("statement timeout")
      ? "Captura a depășit timpul disponibil. Nu am salvat rânduri parțiale. Restrânge selecția sau reîncearcă."
      : error instanceof Error && error.message.startsWith("Această selecție depășește") ? error.message
      : "Captura nu a putut fi încheiată. Nicio listă parțială nu este prezentată ca probă completă. Poți reîncerca.");
    // A revoked creator cannot publish evidence. The already-authorized worker
    // may only mark its own failed attempt, without exposing or storing rows.
    await sql`update app.evidence_captures set status='failed',error=${message}
      where id=${captureId} and investigation_id=${investigationId} and status='running' and started_at::text=${claim}`;
  }
}
