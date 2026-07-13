import { directAcquisitions, entities, entitySicapIds, type Db, type DbSql } from "@seap/db";
import { canonicalCui } from "../normalize/cui.js";
import { normalizeName } from "../normalize/name.js";
import { streamBson } from "./bson-stream.js";

/**
 * Import the 2020 dump's 4.78M `directAcquisitionContract` rows into
 * `core.direct_acquisitions` (transaction grain) so DA red-flags compute over
 * `core`. Entities resolve from in-memory maps built once from the DB (the DA
 * `contractingAuthority` field is "sicapId name", `supplier` is "CUI name") —
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

const AUTH_RE = /^(\d+)\s+(.*)$/; // "5002142 Spitalul ..."
const SUP_RE = /^(\S+)\s+(.*)$/; // "33264530 TRANSILVANIA ..."
const CPV_RE = /^(\d{8}-\d)\b/; // leading "66514110-0"

export async function loadDas(
  db: Db,
  sql: DbSql,
  file: string,
  log: (m: string) => void = () => {},
): Promise<LoadDasResult> {
  // Preload resolution maps.
  const authMap = new Map<number, bigint>();
  for (const r of (await sql`
    select sicap_id, entity_id from core.entity_sicap_ids where namespace = 'authority'
  `) as unknown as { sicap_id: number; entity_id: bigint }[]) {
    authMap.set(Number(r.sicap_id), r.entity_id);
  }
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
  log(`maps: authorities=${authMap.size} valid-cui=${cuiMap.size} cpv=${cpvCatalog.size}`);

  // Dedupe name-only fallbacks (no sicap id, no valid CUI) by their raw string,
  // so a repeated malformed party doesn't spawn thousands of duplicate entities.
  const rawCache = new Map<string, bigint>();
  const INT32_MAX = 2_147_483_647;

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
    const m = AUTH_RE.exec(raw.trim());
    if (!m) return null;
    const token = m[1]!;
    const name = m[2]!.trim() || "(fără nume)";
    const sicapId = Number(token);
    // A real SICAP id fits int32. A larger leading number is garbage (or a CUI) —
    // never insert it into the int32 sicap_id column.
    if (Number.isInteger(sicapId) && sicapId > 0 && sicapId <= INT32_MAX) {
      const hit = authMap.get(sicapId);
      if (hit != null) return hit;
      const id = await createEntity(name, null);
      await db
        .insert(entitySicapIds)
        .values({ entityId: id, namespace: "authority", sicapId })
        .onConflictDoNothing();
      authMap.set(sicapId, id);
      return id;
    }
    const canon = canonicalCui(token);
    if (canon.valid) {
      const hit = cuiMap.get(canon.cui);
      if (hit != null) return hit;
      const id = await createEntity(name, canon.cui);
      cuiMap.set(canon.cui, id);
      return id;
    }
    return createByRaw(raw, name);
  };

  const resolveSupplier = async (raw: string): Promise<bigint | null> => {
    const m = SUP_RE.exec(raw.trim());
    if (!m) return null;
    const canonical = canonicalCui(m[1]!);
    const name = m[2]!.trim() || "(fără nume)";
    if (canonical.valid) {
      const hit = cuiMap.get(canonical.cui);
      if (hit != null) return hit;
      const id = await createEntity(name, canonical.cui);
      cuiMap.set(canonical.cui, id);
      return id;
    }
    return createByRaw(raw, name); // no merge key — dedupe by raw string
  };

  let seen = 0;
  let inserted = 0;
  let authorityMisses = 0;
  let supplierMisses = 0;
  let cpvInvalid = 0;
  let batch: (typeof directAcquisitions.$inferInsert)[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await db.insert(directAcquisitions).values(batch).onConflictDoNothing();
    inserted += batch.length;
    batch = [];
  };

  const toDate = (v: unknown): Date | null => {
    if (typeof v !== "string" || v.length === 0) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const toNum = (v: unknown): string | null =>
    v == null || v === "" ? null : String(v);

  const authCountBefore = authMap.size;
  const cuiCountBefore = cuiMap.size;

  for (const d of streamBson(file)) {
    seen += 1;
    const daIdNum = Number(d["directAcquisitionId"]);
    if (!Number.isFinite(daIdNum)) continue; // malformed row — skip
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

  authorityMisses = authMap.size - authCountBefore;
  supplierMisses = cuiMap.size - cuiCountBefore;
  return { seen, inserted, authorityMisses, supplierMisses, cpvInvalid };
}
