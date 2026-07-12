import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  awards,
  contracts,
  contractWinners,
  daItems,
  directAcquisitions,
  notices,
} from "@seap/db";
import type { NormalizeCtx } from "./context.js";
import { parseCpvObject, parseCpvString, resolveCpv } from "./cpv.js";
import { parseEntityString } from "./name.js";
import { linkSicapId, resolveEntity } from "./resolve-entity.js";
import { resolveUnit } from "./unit.js";

/**
 * Era-aware parsers (core-layer DEC-001/002/004/006). One (schema, load) pair
 * per endpoint_version. `load` throws on an unexpected shape (zod) — the
 * pipeline catches that and quarantines the record. Success writes core rows
 * keyed on natural ids (idempotent under replay).
 */

// ── converters ────────────────────────────────────────────────────────────
const toDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
/** numeric column value: keep as string; Postgres numeric preserves precision. */
const dec = (n: number | string | null | undefined): string | null =>
  n == null ? null : String(n);

const labeled = z.object({ text: z.string().nullish() }).nullish();
const labelText = (
  v: { text?: string | null | undefined } | null | undefined,
) => v?.text ?? null;

export interface Parser {
  schema: z.ZodTypeAny;
  load: (ctx: NormalizeCtx, rawId: bigint, payload: unknown) => Promise<void>;
}

// ── tender-list:v1 ──────────────────────────────────────────────────────────
const tenderListSchema = z
  .object({
    cNoticeId: z.number(),
    noticeNo: z.string().nullish(),
    contractTitle: z.string().nullish(),
    contractingAuthorityNameAndFN: z.string().nullish(),
    cpvCodeAndName: z.string().nullish(),
    estimatedValueRon: z.number().nullish(),
    noticeStateDate: z.string().nullish(),
    sysNoticeState: labeled,
    sysNoticeTypeId: z.number().nullish(),
    sysNoticeVersionId: z.number().nullish(),
    sysAcquisitionContractType: labeled,
    isOnline: z.boolean().nullish(),
    sysProcedureType: labeled,
    hasLots: z.boolean().nullish(),
  })
  .passthrough();

async function loadNoticeLike(
  ctx: NormalizeCtx,
  rawId: bigint,
  p: z.infer<typeof tenderListSchema>,
  extra: { ronContractValue?: number | null; lowest?: number | null; highest?: number | null } = {},
  target: typeof notices | typeof awards = notices,
): Promise<void> {
  const seenAt = toDate(p.noticeStateDate);
  let authorityEntityId: bigint | null = null;
  if (p.contractingAuthorityNameAndFN) {
    const { cuiRaw, name } = parseEntityString(p.contractingAuthorityNameAndFN);
    authorityEntityId = await resolveEntity(ctx.tx, {
      cuiRaw,
      nameDisplay: name,
      namespace: "authority",
      seenAt,
    });
  }
  const cpv = resolveCpv(parseCpvString(p.cpvCodeAndName), ctx.cpvCatalog);

  const common = {
    rawId,
    noticeNo: p.noticeNo ?? null,
    sysNoticeTypeId: p.sysNoticeTypeId ?? null,
    sysNoticeVersionId: p.sysNoticeVersionId ?? null,
    authorityEntityId,
    cpvCode: cpv.cpvCode,
    cpvValid: cpv.cpvValid,
    cpvRaw: cpv.cpvRaw,
    estimatedValueRon: dec(p.estimatedValueRon),
    acquisitionType: labelText(p.sysAcquisitionContractType),
    state: labelText(p.sysNoticeState),
    stateDate: seenAt,
  };

  if (target === awards) {
    await ctx.tx
      .insert(awards)
      .values({
        ...common,
        caNoticeId: BigInt(p.cNoticeId),
        ronContractValue: dec(extra.ronContractValue),
        lowestOfferValue: dec(extra.lowest),
        highestOfferValue: dec(extra.highest),
      })
      .onConflictDoUpdate({
        target: awards.caNoticeId,
        set: {
          ...common,
          ronContractValue: dec(extra.ronContractValue),
          lowestOfferValue: dec(extra.lowest),
          highestOfferValue: dec(extra.highest),
        },
      });
  } else {
    await ctx.tx
      .insert(notices)
      .values({
        ...common,
        cNoticeId: BigInt(p.cNoticeId),
        isOnline: p.isOnline ?? null,
        procedureType: labelText(p.sysProcedureType),
        hasLots: p.hasLots ?? null,
      })
      .onConflictDoUpdate({
        target: notices.cNoticeId,
        set: {
          ...common,
          isOnline: p.isOnline ?? null,
          procedureType: labelText(p.sysProcedureType),
          hasLots: p.hasLots ?? null,
        },
      });
  }
}

// ── award-list:v1 ───────────────────────────────────────────────────────────
const awardListSchema = z
  .object({
    caNoticeId: z.number(),
    noticeNo: z.string().nullish(),
    contractingAuthorityNameAndFN: z.string().nullish(),
    cpvCodeAndName: z.string().nullish(),
    ronContractValue: z.number().nullish(),
    lowestOfferValue: z.number().nullish(),
    highestOfferValue: z.number().nullish(),
    noticeStateDate: z.string().nullish(),
    sysNoticeState: labeled,
    sysNoticeTypeId: z.number().nullish(),
    sysNoticeVersionId: z.number().nullish(),
    sysAcquisitionContractType: labeled,
    estimatedValueExport: z.unknown().nullish(),
  })
  .passthrough();

// ── award-contracts:v1 ──────────────────────────────────────────────────────
const winnerSchema = z
  .object({
    entityId: z.number().nullish(),
    fiscalNumber: z.string().nullish(),
    name: z.string().nullish(),
    address: z
      .object({
        officialName: z.string().nullish(),
        county: labeled,
        nutsCodeItem: labeled,
      })
      .nullish(),
  })
  .passthrough();

const awardContractsSchema = z
  .object({
    caNoticeId: z.number().nullish(),
    items: z.array(
      z
        .object({
          caNoticeContractId: z.number(),
          caNoticeId: z.number().nullish(),
          contractNo: z.string().nullish(),
          contractTitle: z.string().nullish(),
          contractDate: z.string().nullish(),
          contractValue: z.number().nullish(),
          defaultCurrencyContractValue: z.number().nullish(),
          lotsCaption: z.string().nullish(),
          currency: labeled,
          winner: winnerSchema.nullish(),
          winners: z.array(winnerSchema).nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

async function loadAwardContracts(
  ctx: NormalizeCtx,
  rawId: bigint,
  p: z.infer<typeof awardContractsSchema>,
): Promise<void> {
  for (const item of p.items) {
    const contractDate = toDate(item.contractDate);
    const inserted = await ctx.tx
      .insert(contracts)
      .values({
        rawId,
        caNoticeContractId: BigInt(item.caNoticeContractId),
        caNoticeId: item.caNoticeId != null ? BigInt(item.caNoticeId) : null,
        contractNo: item.contractNo ?? null,
        contractDate,
        contractValue: dec(item.defaultCurrencyContractValue ?? item.contractValue),
        currency: labelText(item.currency),
        cpvCode: null,
        title: item.contractTitle ?? null,
        lotsCaption: item.lotsCaption ?? null,
      })
      .onConflictDoUpdate({
        target: contracts.caNoticeContractId,
        set: {
          rawId,
          contractNo: item.contractNo ?? null,
          contractDate,
          contractValue: dec(item.defaultCurrencyContractValue ?? item.contractValue),
          currency: labelText(item.currency),
          title: item.contractTitle ?? null,
          lotsCaption: item.lotsCaption ?? null,
        },
      })
      .returning({ id: contracts.id });
    const contractId = inserted[0]!.id;

    const winnerList =
      item.winners && item.winners.length > 0
        ? item.winners
        : item.winner
          ? [item.winner]
          : [];
    for (const w of winnerList) {
      const entityId = await resolveEntity(ctx.tx, {
        sicapId: w.entityId ?? null,
        namespace: "winner",
        cuiRaw: w.fiscalNumber ?? null,
        nameDisplay: w.address?.officialName ?? w.name ?? "(necunoscut)",
        county: labelText(w.address?.county),
        nutsCode: labelText(w.address?.nutsCodeItem),
        seenAt: contractDate,
      });
      await ctx.tx
        .insert(contractWinners)
        .values({ contractId, entityId })
        .onConflictDoNothing();
    }
  }
}

// ── da-list:v1 ──────────────────────────────────────────────────────────────
const daListSchema = z
  .object({
    directAcquisitionId: z.number(),
    uniqueIdentificationCode: z.string().nullish(),
    contractingAuthority: z.string().nullish(),
    supplier: z.string().nullish(),
    cpvCode: z.string().nullish(),
    estimatedValueRon: z.number().nullish(),
    closingValue: z.number().nullish(),
    publicationDate: z.string().nullish(),
    finalizationDate: z.string().nullish(),
    sysDirectAcquisitionState: labeled,
  })
  .passthrough();

async function loadDaList(
  ctx: NormalizeCtx,
  rawId: bigint,
  p: z.infer<typeof daListSchema>,
): Promise<void> {
  const seenAt = toDate(p.finalizationDate) ?? toDate(p.publicationDate);
  let authorityEntityId: bigint | null = null;
  let supplierEntityId: bigint | null = null;
  if (p.contractingAuthority) {
    const { cuiRaw, name } = parseEntityString(p.contractingAuthority);
    authorityEntityId = await resolveEntity(ctx.tx, {
      cuiRaw,
      nameDisplay: name,
      namespace: "authority",
      seenAt,
    });
  }
  if (p.supplier) {
    const { cuiRaw, name } = parseEntityString(p.supplier);
    supplierEntityId = await resolveEntity(ctx.tx, {
      cuiRaw,
      nameDisplay: name,
      namespace: "supplier",
      seenAt,
    });
  }
  const cpv = resolveCpv(parseCpvString(p.cpvCode), ctx.cpvCatalog);
  const header = {
    rawId,
    daCode: p.uniqueIdentificationCode ?? null,
    authorityEntityId,
    supplierEntityId,
    cpvCode: cpv.cpvCode,
    cpvValid: cpv.cpvValid,
    cpvRaw: cpv.cpvRaw,
    estimatedValueRon: dec(p.estimatedValueRon),
    closingValue: dec(p.closingValue),
    publicationDate: toDate(p.publicationDate),
    finalizationDate: toDate(p.finalizationDate),
    state: labelText(p.sysDirectAcquisitionState),
  };
  await ctx.tx
    .insert(directAcquisitions)
    .values({ ...header, sicapDaId: BigInt(p.directAcquisitionId) })
    .onConflictDoUpdate({ target: directAcquisitions.sicapDaId, set: header });
}

// ── da-detail:v1 ────────────────────────────────────────────────────────────
const daDetailSchema = z
  .object({
    directAcquisitionID: z.number(),
    uniqueIdentificationCode: z.string().nullish(),
    contractingAuthorityID: z.number().nullish(),
    supplierId: z.number().nullish(),
    sysAcquisitionContractType: labeled,
    // Detail carries CPV as an object ({id,text,localeKey}), unlike the list.
    cpvCode: z
      .object({ text: z.string().nullish(), localeKey: z.string().nullish() })
      .nullish(),
    estimatedValue: z.number().nullish(),
    closingValue: z.number().nullish(),
    publicationDate: z.string().nullish(),
    finalizationDate: z.string().nullish(),
    sysDirectAcquisitionState: labeled,
    directAcquisitionItems: z
      .array(
        z
          .object({
            directAcquisitionItemID: z.number(),
            catalogItemName: z.string().nullish(),
            itemQuantity: z.number().nullish(),
            itemMeasureUnit: z.string().nullish(),
            catalogItemPrice: z.number().nullish(),
            itemClosingPrice: z.number().nullish(),
            cpvCode: z
              .object({ text: z.string().nullish(), localeKey: z.string().nullish() })
              .nullish(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();

async function loadDaDetail(
  ctx: NormalizeCtx,
  rawId: bigint,
  p: z.infer<typeof daDetailSchema>,
): Promise<void> {
  const sicapDaId = BigInt(p.directAcquisitionID);
  const cpv = resolveCpv(parseCpvObject(p.cpvCode), ctx.cpvCatalog);
  // Upsert header fields detail knows; do NOT touch authority/supplier entity
  // ids (only the list payload carries the CUI/name to resolve them).
  const detailHeader = {
    rawId,
    daCode: p.uniqueIdentificationCode ?? null,
    cpvCode: cpv.cpvCode,
    cpvValid: cpv.cpvValid,
    cpvRaw: cpv.cpvRaw,
    estimatedValueRon: dec(p.estimatedValue),
    closingValue: dec(p.closingValue),
    acquisitionType: labelText(p.sysAcquisitionContractType),
    publicationDate: toDate(p.publicationDate),
    finalizationDate: toDate(p.finalizationDate),
    state: labelText(p.sysDirectAcquisitionState),
  };
  const upserted = await ctx.tx
    .insert(directAcquisitions)
    .values({ ...detailHeader, sicapDaId })
    .onConflictDoUpdate({ target: directAcquisitions.sicapDaId, set: detailHeader })
    .returning({
      id: directAcquisitions.id,
      authorityEntityId: directAcquisitions.authorityEntityId,
      supplierEntityId: directAcquisitions.supplierEntityId,
    });
  const da = upserted[0]!;

  // Attach SICAP numeric ids to the entities the list already resolved.
  if (p.contractingAuthorityID != null && da.authorityEntityId != null) {
    await linkSicapId(ctx.tx, da.authorityEntityId, "authority", p.contractingAuthorityID);
  }
  if (p.supplierId != null && da.supplierEntityId != null) {
    await linkSicapId(ctx.tx, da.supplierEntityId, "supplier", p.supplierId);
  }

  for (const it of p.directAcquisitionItems ?? []) {
    const itemCpv = resolveCpv(parseCpvObject(it.cpvCode), ctx.cpvCatalog);
    const unit = resolveUnit(it.itemMeasureUnit, ctx.units);
    const itemRow = {
      daId: da.id,
      cpvCode: itemCpv.cpvCode,
      catalogItemName: it.catalogItemName ?? null,
      quantity: dec(it.itemQuantity),
      unitRaw: unit.unitRaw,
      unitCanonical: unit.unitCanonical,
      unitFactor: unit.unitFactor,
      unitPrice: dec(it.catalogItemPrice),
      closingPrice: dec(it.itemClosingPrice),
    };
    await ctx.tx
      .insert(daItems)
      .values({ ...itemRow, sicapItemId: BigInt(it.directAcquisitionItemID) })
      .onConflictDoUpdate({ target: daItems.sicapItemId, set: itemRow });
  }
}

// ── registry ────────────────────────────────────────────────────────────────
export const PARSERS: Record<string, Parser> = {
  "tender-list:v1": {
    schema: tenderListSchema,
    load: (ctx, rawId, payload) =>
      loadNoticeLike(ctx, rawId, tenderListSchema.parse(payload)),
  },
  "award-list:v1": {
    schema: awardListSchema,
    load: (ctx, rawId, payload) => {
      const p = awardListSchema.parse(payload);
      return loadNoticeLike(
        ctx,
        rawId,
        // award-list shares the notice shape but keys on caNoticeId
        { ...p, cNoticeId: p.caNoticeId } as z.infer<typeof tenderListSchema>,
        {
          ronContractValue: p.ronContractValue ?? null,
          lowest: p.lowestOfferValue ?? null,
          highest: p.highestOfferValue ?? null,
        },
        awards,
      );
    },
  },
  "award-contracts:v1": {
    schema: awardContractsSchema,
    load: (ctx, rawId, payload) =>
      loadAwardContracts(ctx, rawId, awardContractsSchema.parse(payload)),
  },
  "da-list:v1": {
    schema: daListSchema,
    load: (ctx, rawId, payload) =>
      loadDaList(ctx, rawId, daListSchema.parse(payload)),
  },
  "da-detail:v1": {
    schema: daDetailSchema,
    load: (ctx, rawId, payload) =>
      loadDaDetail(ctx, rawId, daDetailSchema.parse(payload)),
  },
};
