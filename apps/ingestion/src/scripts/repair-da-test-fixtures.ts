import { runMonitoredCli } from "../monitoring/cli.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { createDb, directAcquisitions, rawDocuments } from "@seap/db";
import { PARSERS } from "../normalize/parsers.js";
import { loadCpvCatalog, loadCpvPrefixMap, loadUnitMap } from "../normalize/context.js";
import { contentHash } from "../scrape/hash.js";

/** Four independently corroborated July 2026 mock snapshots, never a general repair. */
export const REPAIRS = [
  { id: 120379639, mock: 185890, detail: 130805, list: 130705, value: 40000,
    mockHash: "4e30fda81c352cc3a97918512c13e584eb04522eaee075da43fa1be7a68ad431",
    detailHash: "1c3ff44558944773425f60690f43eb50c0c74d8670413a05a0122bc6dac20246",
    listHash: "0f7c51cb477c2e3a1679e9d7d3fa5d67575c1b56f282b13468966a64f93d3d48" },
  { id: 120617973, mock: 185891, detail: 83895, list: 83875, value: 2224,
    mockHash: "243e163b3f7b9ebb05ee5bb42e0e9b646ed234cabbbfa96f975f862664824716",
    detailHash: "a6d47f279766aada7cad835072df3aaae3409bc3889cc478c6aa78a11baaa690",
    listHash: "cf9e77ca3ccd59124c97c79a0e0c1968488dc4d480c2e95bdada296393cde1d4" },
  { id: 120618371, mock: 185892, detail: 83894, list: 83874, value: 1112,
    mockHash: "92b6a78511a2e8d6ab6cffdd980a1320b9f3bae49c10bba7c8915119e111d186",
    detailHash: "2f124e87051d5836838bd16eef319fe9bcd898763787a0bd0ac1f9eb505130c4",
    listHash: "f754509893d2e88995ae9cc6305676efaaeba1db7b019e8cce92508541f31be3" },
  { id: 122557878, mock: 185893, detail: 5564, list: 5464, value: 12840,
    mockHash: "539b8abedb12c342e7121ec077716639753207b13e8b16e0e3a7d6deb2eb22a3",
    detailHash: "272ecfe6d9bb61b34d3232758ef9c5b5f5f59e03adf2e2e3dd430ab7450168cc",
    listHash: "8d4ae2fd0fc14412e41e6b4b71078ab9b660b12754c8898bdf79bac564088f52" },
] as const;
type Raw = typeof rawDocuments.$inferSelect;
type Header = typeof directAcquisitions.$inferSelect;
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const object = (value: unknown) => value as Record<string, unknown>;
const iso = (value: unknown) => value == null ? null : new Date(String(value)).toISOString();
const json = (value: unknown) => JSON.stringify(value, (_, v: unknown) => typeof v === "bigint" ? v.toString() : v, 2);

export function assertMockSignature(repair: typeof REPAIRS[number], mock: Pick<Raw,"id"|"externalId"|"contentHash"|"payload">) {
  const bad = object(mock.payload);
  assert(mock.id === BigInt(repair.mock) && mock.externalId === `da:${repair.id}`, "Unexpected mock record identity");
  assert(mock.contentHash === repair.mockHash && contentHash(mock.payload) === repair.mockHash, "Mock hash changed");
  assert(bad && Object.keys(bad).sort().join(",") === "closingValue,directAcquisitionID,isOpenForCorrection"
    && bad.directAcquisitionID === repair.id && bad.closingValue === 222 && bad.isOpenForCorrection === true,
  `Unexpected mock signature at raw ${mock.id}`);
}

export function validateRepair(repair: typeof REPAIRS[number], raw: Raw[], header: Header | undefined) {
  assert(header && header.sicapDaId === BigInt(repair.id), `Missing core DA ${repair.id}`);
  const documents = [repair.mock, repair.detail, repair.list].map(id => raw.find(row => row.id === BigInt(id)));
  const [mock, detail, list] = documents;
  assert(mock && detail && list, `Incomplete archive for DA ${repair.id}`);
  assertMockSignature(repair,mock);
  for (const [document, hash] of [[mock,repair.mockHash],[detail,repair.detailHash],[list,repair.listHash]] as const) {
    assert(document.externalId === `da:${repair.id}`, `Wrong external ID at raw ${document.id}`);
    assert(document.contentHash === hash && contentHash(document.payload) === hash, `Hash changed at raw ${document.id}`);
  }
  const good = object(detail.payload), summary = object(list.payload);
  assert(detail.source === "elicitatie" && detail.endpointVersion === "da-detail:v1"
    && list.source === "elicitatie" && list.endpointVersion === "da-list:v1", `Unexpected genuine source metadata for ${repair.id}`);
  assert(good.directAcquisitionID === repair.id && summary.directAcquisitionId === repair.id, "Prior payload ID mismatch");
  assert(detail.fetchedAt < mock.fetchedAt && list.fetchedAt < mock.fetchedAt, "Prior snapshots are not older than the mock");
  assert(PARSERS["da-detail:v1"]!.schema.safeParse(good).success, "Verified detail no longer satisfies the parser");
  for (const payload of [good,summary]) {
    const state = object(payload.sysDirectAcquisitionState);
    assert(state?.id === 8 && state.text === "Oferta neacceptata in termen", `Prior DA ${repair.id} is not the expected unaccepted offer`);
    assert(payload.closingValue === repair.value && typeof payload.finalizationDate === "string"
      && typeof payload.publicationDate === "string" && typeof payload.uniqueIdentificationCode === "string", "Incomplete prior header");
  }
  for (const key of ["closingValue","finalizationDate","publicationDate","uniqueIdentificationCode"]) {
    assert(good[key] === summary[key], `List/detail disagreement on ${key} for ${repair.id}`);
  }
  assert(Array.isArray(good.directAcquisitionItems) && good.directAcquisitionItems.length > 0, "Missing prior line items");
  const cpv = object(good.cpvCode).localeKey;
  assert(typeof cpv === "string" && typeof summary.cpvCode === "string" && summary.cpvCode.startsWith(cpv), "List/detail CPV disagreement");
  assert(good.estimatedValue === summary.estimatedValueRon, "List/detail estimate disagreement");
  const restored = {
    rawId: BigInt(repair.detail), daCode: String(good.uniqueIdentificationCode), state: "Oferta neacceptata in termen",
    closingValue: String(repair.value), estimatedValueRon: String(good.estimatedValue), cpvCode: cpv,
    acquisitionType: String(object(good.sysAcquisitionContractType).text),
    publicationDate: iso(good.publicationDate), finalizationDate: iso(good.finalizationDate),
  };
  const applied = mock.source === "test-fixture" && mock.endpointVersion === "test-fixture:da-detail:v1";
  if (applied) assertRestored(header, restored);
  else {
    assert(mock.source === "elicitatie" && mock.endpointVersion === "da-detail:v1", "Unexpected mock archive classification");
    assert(header.rawId === BigInt(repair.mock) && header.closingValue === "222" && header.state === null
      && header.finalizationDate === null && header.publicationDate === null && header.daCode === null && header.cpvCode === null,
    `DA ${repair.id} changed since investigation; refusing to overwrite it`);
  }
  return { mock, detail, list, header, restored, applied };
}

function assertRestored(header: Header, expected: ReturnType<typeof validateRepair>["restored"]) {
  for (const [key,value] of Object.entries(expected)) {
    const actual = header[key as keyof Header];
    assert((actual instanceof Date ? actual.toISOString() : actual) === value, `Restoration mismatch for ${key}`);
  }
}

async function main() {
  assert(process.argv.slice(2).every(arg => arg === "--apply"), "Usage: repair-da-test-fixtures.ts [--apply]");
  const apply = process.argv.includes("--apply");
  const { db, sql } = createDb();
  await runMonitoredCli(sql, "repair-da-test-fixtures", async () => {
    const artifact = fileURLToPath(new URL("../../../../docs/implementation/previews/da-test-fixture-repair.json", import.meta.url));
    const save = async (value: unknown) => { await mkdir(dirname(artifact), { recursive: true }); await writeFile(artifact, json(value) + "\n", { mode: 0o600 }); };
      const rawIds = REPAIRS.flatMap(r => [BigInt(r.mock),BigInt(r.detail),BigInt(r.list)]);
      const ids = REPAIRS.map(r => BigInt(r.id));
      const [raw, headers] = await Promise.all([
        db.select().from(rawDocuments).where(inArray(rawDocuments.id,rawIds)),
        db.select().from(directAcquisitions).where(inArray(directAcquisitions.sicapDaId,ids)),
      ]);
      const checks = REPAIRS.map(r => validateRepair(r,raw,headers.find(h => h.sicapDaId===BigInt(r.id))));
      assert(checks.every(c => c.applied) || checks.every(c => !c.applied), "Partial prior repair; manual review required");
      if (checks.every(c => c.applied)) { console.log("All four repairs are already applied and verified. Existing audit artifact preserved."); return; }
      const audit = { version: 1, status: apply ? "prepared" : "dry-run", checkedAt: new Date().toISOString(),
        ordinaryValuePopulationChange: "None: all four verified source states are unaccepted offers.",
        changes: checks.map(c => ({ sicapDaId: c.header.sicapDaId, originalMockArchive: c.mock,
          proposedMockMetadata: { source: "test-fixture", endpointVersion: "test-fixture:da-detail:v1" },
          genuineDetail: { id:c.detail.id,contentHash:c.detail.contentHash,fetchedAt:c.detail.fetchedAt },
          corroboratingList: { id:c.list.id,contentHash:c.list.contentHash,fetchedAt:c.list.fetchedAt },
          before:c.header, expectedRestoredHeader:c.restored })),
        rollback: "Restore the four core headers and original raw source/endpoint metadata from this artifact in one transaction; do not delete any raw rows.",
      };
      await save(audit); // Durable before-images precede any database mutation.
      if (!apply) { console.log(json({ mode:"dry-run", verified:checks.length, artifact })); return; }
      const [cpvCatalog,cpvByPrefix,units] = await Promise.all([loadCpvCatalog(db),loadCpvPrefixMap(db),loadUnitMap(db)]);
      const after = await db.transaction(async tx => {
        const lockedRaw = await tx.select().from(rawDocuments).where(inArray(rawDocuments.id,rawIds)).for("update");
        const lockedHeaders = await tx.select().from(directAcquisitions).where(inArray(directAcquisitions.sicapDaId,ids)).for("update");
        for (const repair of REPAIRS) {
          const c = validateRepair(repair,lockedRaw,lockedHeaders.find(h => h.sicapDaId===BigInt(repair.id)));
          assert(!c.applied, "Concurrent repair detected; no changes applied");
          const before = checks.find(check => check.header.sicapDaId === BigInt(repair.id))!;
          assert(json(c.header) === json(before.header) && json(c.mock) === json(before.mock),
            "Source or core metadata changed after saving before-images; retry the dry run");
          await PARSERS["da-detail:v1"]!.load({tx,cpvCatalog,cpvByPrefix,units},c.detail.id,c.detail.payload);
          await tx.update(rawDocuments).set({source:"test-fixture",endpointVersion:"test-fixture:da-detail:v1"}).where(eq(rawDocuments.id,c.mock.id));
          const [restored] = await tx.select().from(directAcquisitions).where(eq(directAcquisitions.sicapDaId,BigInt(repair.id)));
          assert(restored, "Restored DA missing"); assertRestored(restored,c.restored);
          assert(restored.id===c.header.id && restored.authorityEntityId===c.header.authorityEntityId
            && restored.supplierEntityId===c.header.supplierEntityId,"Entity identity changed during replay");
        }
        return { headers:await tx.select().from(directAcquisitions).where(inArray(directAcquisitions.sicapDaId,ids)),
          mocks:await tx.select().from(rawDocuments).where(inArray(rawDocuments.id,REPAIRS.map(r=>BigInt(r.mock)))) };
      });
      await save({...audit,status:"applied",appliedAt:new Date().toISOString(),after});
      console.log(json({mode:"apply",restored:4,artifact}));
  }, process.argv.includes("--apply"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode=1; });
}
