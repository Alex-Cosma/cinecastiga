import { directAcquisitions, entities, type Db, type DbSql } from "@seap/db";
import { canonicalCui } from "../normalize/cui.js";
import { normalizeName, parseEntityString } from "../normalize/name.js";
import { streamBson } from "./bson-stream.js";

/**
 * Import the 2020 dump's 4.78M `directAcquisitionContract` rows into
 * `core.direct_acquisitions` (transaction grain) so DA red-flags compute over
 * `core`. Entities resolve from in-memory maps built once from the DB (both
 * `contractingAuthority` and `supplier` are fiscal "CUI name" strings) —
 * no per-row lookups; the rare miss is created inline. Idempotent on sicap_da_id.
 */
const BATCH = 2000;

export interface LoadDasResult {
  seen: number;
  inserted: number;
  authorityMisses: number;
  supplierMisses: number;
  cpvInvalid: number;
}

const CPV_RE = /^(\d{8}-\d)\b/; // leading "66514110-0"

export async function loadDas(
  db: Db,
  sql: DbSql,
  file: string,
  log: (m: string) => void = () => {},
): Promise<LoadDasResult> {
  // Preload resolution maps.
  const cuiMap = new Map<string, bigint>();
  for (const r of (await sql`
    select cui_canonical, id from core.entities where cui_valid = true
  `) as unknown as { cui_canonical: string; id: bigint }[]) {
    cuiMap.set(r.cui_canonical, r.id);
  }
  const cpvCatalog = new Set<string>(
    (
      (await sql`select code from core.cpv_codes`) as unknown as { code: string }[]
    ).map((r) => r.code),
  );
  log(`maps: valid-cui=${cuiMap.size} cpv=${cpvCatalog.size}; legacy parties use fiscal identifiers`);

  // Dedupe name-only fallbacks (no sicap id, no valid CUI) by their raw string,
  // so a repeated malformed party doesn't spawn thousands of duplicate entities.
  const rawCache = new Map<string, bigint>();

  // Inline creators for the rare entity not present in the dimension import.
  const createEntity = async (
    nameDisplay: string,
    cui: string | null,
  ): Promise<bigint> => {
    const { normalized, legalForm } = normalizeName(nameDisplay);
    const [row] = await db
      .insert(entities)
      .values({
        cuiCanonical: cui,
        cuiValid: cui != null,
        nameDisplay,
        nameNormalized: normalized,
        legalForm: legalForm ?? null,
      })
      .returning({ id: entities.id });
    return row!.id;
  };

  const createByRaw = async (rawKey: string, name: string): Promise<bigint> => {
    const cached = rawCache.get(rawKey);
    if (cached != null) return cached;
    const id = await createEntity(name, null);
    rawCache.set(rawKey, id);
    return id;
  };

  const resolveAuthority = async (raw: string): Promise<bigint | null> => {
    if (!raw.trim()) return null;
    // Verified against the ORIGINAL dimension + all 4,781,249 archive rows.
    // Never look this prefix up in the SICAP namespace, even when it fits int32.
    const { cuiRaw, name: parsed } = parseEntityString(raw);
    const name = parsed.trim() || "(fără nume)";
    const canon = canonicalCui(cuiRaw);
    if (canon.valid) {
      const hit = cuiMap.get(canon.cui);
      if (hit != null) return hit;
      const id = await createEntity(name, canon.cui);
      cuiMap.set(canon.cui, id);
      authorityMisses++;
      return id;
    }
    // Invalid fiscal identifiers are retained as unverified entities. They do
    // not become invented SICAP links and are not merged by name.
    return createByRaw(`authority:${raw}`, name);
  };

  const resolveSupplier = async (raw: string): Promise<bigint | null> => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // Supplier is "[RO ]CUI NAME" in several real forms — "RO 335278 X" (58% of
    // rows), "RO335278 X", "335278 X". Reuse the live pipeline's parser so the
    // RO-with-space form is not mis-split (the leading "RO" is not the CUI, and
    // the digits must not leak into the name → the historic no-CUI pollution).
    const { cuiRaw, name: parsed } = parseEntityString(trimmed);
    const name = parsed.trim() || "(fără nume)";
    const canonical = canonicalCui(cuiRaw);
    if (canonical.valid) {
      const hit = cuiMap.get(canonical.cui);
      if (hit != null) return hit;
      const id = await createEntity(name, canonical.cui);
      cuiMap.set(canonical.cui, id);
      return id;
    }
    return createByRaw(trimmed, name); // no merge key — dedupe by raw string
  };

  let seen = 0;
  let inserted = 0;
  let authorityMisses = 0;
  let supplierMisses = 0;
  let cpvInvalid = 0;
  let batch: (typeof directAcquisitions.$inferInsert)[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const added = await db.insert(directAcquisitions).values(batch).onConflictDoNothing().returning({ id: directAcquisitions.id });
    inserted += added.length;
    batch = [];
  };

  const toDate = (v: unknown): Date | null => {
    if (typeof v !== "string" || v.length === 0) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const toNum = (v: unknown): string | null =>
    v == null || v === "" ? null : String(v);

  const cuiCountBefore = cuiMap.size;

  const importChunk = async (documents: Record<string, unknown>[]) => {
    const sourceIds = documents.map(d => Number(d["directAcquisitionId"])).filter(id => Number.isSafeInteger(id) && id > 0);
    const existing = new Set((await sql`select sicap_da_id::text id from core.direct_acquisitions where sicap_da_id = any(${sql.array(sourceIds.map(String))}::bigint[])`).map(r => String(r.id)));
    for (const d of documents) {
      const daIdNum = Number(d["directAcquisitionId"]);
      if (!Number.isSafeInteger(daIdNum) || daIdNum <= 0) throw new Error("Invalid legacy acquisition ID");
      if (existing.has(String(daIdNum))) continue; // replay must not create orphan identities
      existing.add(String(daIdNum));
      const authorityRaw = String(d["contractingAuthority"] ?? "");
      const supplierRaw = String(d["supplier"] ?? "");
      const authorityId = await resolveAuthority(authorityRaw);
      const supplierId = await resolveSupplier(supplierRaw);

      const cpvRaw = (d["cpvCode"] as string | undefined) ?? null;
      const cpvMatch = cpvRaw ? CPV_RE.exec(cpvRaw) : null;
      const cpvCode = cpvMatch && cpvCatalog.has(cpvMatch[1]!) ? cpvMatch[1]! : null;
      const cpvValid = cpvRaw ? cpvCode != null : null;
      if (cpvRaw && !cpvCode) cpvInvalid += 1;

      const state = (d["sysDirectAcquisitionState"] as { text?: string } | undefined)?.text ?? null;

      batch.push({
        rawId: null,
        daCode: (d["uniqueIdentificationCode"] as string | undefined) ?? null,
        sicapDaId: BigInt(Math.trunc(daIdNum)),
        authorityEntityId: authorityId,
        supplierEntityId: supplierId,
        cpvCode,
        cpvValid,
        cpvRaw,
        estimatedValueRon: toNum(d["estimatedValueRon"]),
        closingValue: toNum(d["closingValue"]),
        acquisitionType: null,
        publicationDate: toDate(d["publicationDate"]),
        finalizationDate: toDate(d["finalizationDate"]),
        state,
      });
      if (batch.length >= BATCH) {
        await flush();
        if (inserted % 200_000 < BATCH) log(`  ${inserted} inserted / ${seen} seen`);
      }
    }
    await flush();
  };
  let documents: Record<string, unknown>[] = [];
  for (const d of streamBson(file)) {
    seen++;
    documents.push(d);
    if (documents.length >= BATCH) { await importChunk(documents); documents = []; }
  }
  if (documents.length) await importChunk(documents);
  await flush();

  supplierMisses = cuiMap.size - cuiCountBefore - authorityMisses;
  return { seen, inserted, authorityMisses, supplierMisses, cpvInvalid };
}
