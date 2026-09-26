import { createHash } from "node:crypto";
import type { RadiografiePatternBinding } from "./evidence-captures-shared";
import type { DbSql } from "@seap/db";
import { daCeiling, daPurchaseType } from "@seap/domain";
import { readDaEvidence, readContractEvidence, sourceEvidence, type SourceEvidence } from "./source-evidence";

export type RadiografieSelection = { type: "slicing"; supplierId: string } | { type: "pattern"; patternId: string; expectedFingerprint?:string };
const isId = (value: unknown): value is string => typeof value === "string" && /^[1-9]\d{0,17}$/.test(value);
export function validateRadiografieSelection(raw: unknown): RadiografieSelection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.type === "slicing" && isId(value.supplierId)) return { type: "slicing", supplierId: value.supplierId };
  if(value.type==="pattern"&&isId(value.patternId)){
    if(value.expectedFingerprint!==undefined&&(typeof value.expectedFingerprint!=="string"||!/^[a-f0-9]{64}$/.test(value.expectedFingerprint)))return null;
    return{type:"pattern",patternId:value.patternId,...(typeof value.expectedFingerprint==="string"?{expectedFingerprint:value.expectedFingerprint}:{})};
  }
  return null;
}

/** Pattern row IDs are rebuild-local, never a durable finding identity. */
export class RadiografieIdentityError extends Error {}
const identityChanged="Tiparul Radiografiei s-a schimbat sau nu mai este disponibil. Nu am capturat altă selecție în locul lui. Deschide Radiografia actuală pentru a salva separat un tipar nou.";
export function patternBinding(authorityId:string,pattern:Record<string,unknown>):RadiografiePatternBinding {
  const descriptor={version:"radiografie-pattern-1" as const,authorityId,kind:String(pattern.kind),cpvClass:String(pattern.cpv_class),
    memberIds:[...new Set((pattern.member_ids as string[]).map(String))].sort(),
    notices:[...new Set((pattern.notices as string[]).map(String))].sort()};
  return {...descriptor,fingerprint:createHash("sha256").update(JSON.stringify(descriptor)).digest("hex")};
}
async function readPattern(sql:DbSql,authorityId:string,patternId:string){
  const [pattern]=await sql`select *,value::text "recordedValue",
    to_jsonb(array(select member::text from unnest(member_ids) member)) member_ids,to_jsonb(notices) notices
    from marts.lot_patterns where id=${patternId} and authority_id=${authorityId}`;
  return pattern??null;
}
/** Only the server calls this while creating a capture request. Client-provided
 * bindings are removed by validateCaptureRequest before reaching the queue. */
export async function bindRadiografiePattern(sql:DbSql,authorityId:string,patternId:string):Promise<RadiografiePatternBinding>{
  const pattern=await readPattern(sql,authorityId,patternId);
  if(!pattern)throw new RadiografieIdentityError(identityChanged);
  return patternBinding(authorityId,pattern);
}
export function sameRadiografiePattern(recorded:RadiografiePatternBinding,current:RadiografiePatternBinding):boolean{
  // Compare the descriptor as well as the hash; do not accept a reused hash or
  // an incomplete pre-binding legacy request as an identity assertion.
  return recorded?.version===current.version&&recorded.authorityId===current.authorityId&&recorded.kind===current.kind&&
    recorded.cpvClass===current.cpvClass&&JSON.stringify(recorded.memberIds)===JSON.stringify(current.memberIds)&&
    JSON.stringify(recorded.notices)===JSON.stringify(current.notices)&&recorded.fingerprint===current.fingerprint;
}
export function requireRadiografiePattern(recorded:RadiografiePatternBinding|undefined,current:RadiografiePatternBinding):void{
  if(!recorded||!sameRadiografiePattern(recorded,current))throw new RadiografieIdentityError(identityChanged);
}

/** Thresholds are integral RON; keep sub-cent precision at the boundary. */
export function belowExactCeiling(value: string, ceiling: number): boolean {
  if (!/^\d+(\.\d+)?$/.test(value) || !Number.isSafeInteger(ceiling) || ceiling <= 0) return false;
  const [whole = "0", fraction = ""] = value.split(".");
  const scale = 10n ** BigInt(fraction.length);
  return BigInt(whole + fraction) < BigInt(ceiling) * scale;
}

/** Run on the caller's repeatable-read transaction, including when capturing. */
export async function readRadiografieEvidence(sql: DbSql, authorityId: string, raw: unknown, expectedPattern?:RadiografiePatternBinding): Promise<SourceEvidence | null> {
  const selection = validateRadiografieSelection(raw);
  if (!isId(authorityId) || !selection) return null;
  if (selection.type === "slicing") {
    const [slice] = await sql`select *, d0::text "fromDate", d1::text "toDate", sum_window::text "recordedTotal", ceiling::text "ceilingExact"
      from marts.da_slicing where authority_id = ${authorityId} and supplier_id = ${selection.supplierId}`;
    if (!slice) return null;
    // Reconstruct the actual threshold membership, not all pair/date purchases.
    const candidates = await sql`select da.sicap_da_id::text id, da.closing_value::text value, da.cpv_code, da.acquisition_type,
      to_char(coalesce(da.publication_date, da.finalization_date) at time zone 'Europe/Bucharest', 'YYYY-MM-DD') reference_date
      from marts.da_transactions dt join core.direct_acquisitions da on da.sicap_da_id = dt.sicap_da_id
      where dt.authority_id = ${authorityId} and dt.supplier_id = ${selection.supplierId}
        and left(btrim(da.cpv_code),4) = ${slice.cpv_class}
        and left(dt.finalization_date,10)::date between ${slice.fromDate}::date and ${slice.toDate}::date
        and not dt.value_suspect and dt.closing_value > 0`;
    const type = slice.acquisition_type === "da_ceiling_works" ? "works" : "goods_services";
    const ids = candidates.filter(row => {
      const ceiling = daCeiling(row.reference_date, row.cpv_code, row.acquisition_type);
      return daPurchaseType(row.cpv_code, row.acquisition_type) === type && ceiling !== null && belowExactCeiling(row.value, ceiling);
    }).map(row => String(row.id));
    const records = ids.length ? await readDaEvidence(sql, sql`da.sicap_da_id = any(${ids}::bigint[])`) : [];
    const result = sourceEvidence({ title: `Achiziții apropiate în timp · ${slice.supplier_name ?? selection.supplierId}`,
      methodology: String(slice.methodology_version), records, warnings: [],
      context: { kind: "radiografie", authorityId, selection, cpvClass: slice.cpv_class, purchaseType: type,
        from: slice.fromDate, to: slice.toDate, recordedCount: slice.n, recordedTotalExact: slice.recordedTotal,
        ceilingExact: slice.ceilingExact, dateFallbackCount: slice.date_fallback_count, typeInferredCount: slice.type_inferred_count,
        membership: "reconstructed_from_current_records" } });
    const [check] = await sql`select ${result.totalExact}::numeric = ${slice.recordedTotal}::numeric matches`;
    if (records.length !== Number(slice.n) || !check?.matches) result.warnings.push("Sursele actuale diferă de calculul Radiografiei. Numărul și suma capturate sunt cele ale înregistrărilor disponibile acum.");
    result.warnings.push("Selecția reconstituie fereastra de calcul din datele curente. CPV-ul comun și depășirea cumulată nu dovedesc singure fracționarea ilegală.");
    return result;
  }
  const pattern=await readPattern(sql,authorityId,selection.patternId);
  if(!pattern){if(expectedPattern)throw new RadiografieIdentityError(identityChanged);return null;}
  const binding=patternBinding(authorityId,pattern);
  if(selection.expectedFingerprint&&selection.expectedFingerprint!==binding.fingerprint)return null;
  if(expectedPattern)requireRadiografiePattern(expectedPattern,binding);
  const notices = Array.isArray(pattern.notices) ? pattern.notices.map(String) : [];
  const members = Array.isArray(pattern.member_ids) ? pattern.member_ids.map(String) : [];
  const records = notices.length && members.length ? await readContractEvidence(sql, sql`ct.authority_id = ${authorityId}
    and ct.notice_no = any(${notices}::text[]) and left(ct.cpv_code,4) = ${pattern.cpv_class}
    and ct.supplier_id = any(${members}::bigint[])`) : [];
  return sourceEvidence({ title: `Tipar de loturi · CPV ${pattern.cpv_class}`, methodology: "radiografie-rf-2026.5",
    records, context: { kind: "radiografie", authorityId, selection, sourceBinding:binding, cpvClass: pattern.cpv_class, pattern: pattern.kind,
      notices, memberIds: members, recordedValueExact: pattern.recordedValue, membership: "current_contract_allocations_in_recorded_notices" },
    warnings: ["Sunt prezentate cotele furnizorilor selectați din contractele disponibile pentru anunțurile tiparului. Valorile din matrice pot reprezenta contracte integrale; nu se adună repetat pentru fiecare membru al unui consorțiu.",
      "Un tipar de câștigători este o pistă de verificare. Datele nu includ toate ofertele respinse."] });
}
