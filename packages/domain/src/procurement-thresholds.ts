/**
 * Direct-purchase limits, excluding VAT. These are NOT TED publication limits.
 * L98/2016 art. 7(5), art. 240: published 23 May, effective 26 May 2016.
 * https://portal.afir.info/Uploads/Docu%20LEGISLATIE/Legislatie_2016/Lege-98.pdf
 * OUG45/2018 art. I(2): effective on publication, 4 June 2018.
 * https://legislatie.just.ro/Public/DetaliiDocument/222867
 * L208/2022 art. I(1), V(1): effective 10 September 2022 (60 days after 12 July).
 * https://legislatie.just.ro/Public/FormaPrintabila/00000G05OK3OY7YY9YC0XZ8XYG6HRBZV
 * Dates are Romanian calendar dates; validTo is exclusive.
 */
export const DA_CEILING_ERAS = [
  { validFrom: "2016-05-26", validTo: "2018-06-04", goodsServices: 132_519, works: 441_730, law: "Legea 98/2016 art. 7(5)" },
  { validFrom: "2018-06-04", validTo: "2022-09-10", goodsServices: 135_060, works: 450_200, law: "OUG 45/2018 art. I(2)" },
  { validFrom: "2022-09-10", validTo: null, goodsServices: 270_120, works: 900_400, law: "Legea 208/2022 art. I(1), V(1)" },
] as const;

export type DaPurchaseType = "works" | "goods_services";
export type DaCeilingKey = "da_ceiling_works" | "da_ceiling_goods_services";

// Main CPV vocabulary divisions. A missing, truncated or unrecognized division
// must never fall through to the lower goods/services ceiling. CPV is a proxy
// for acquisition type, not a legal determination for mixed contracts.
const CPV_DIVISIONS = "03|09|14|15|16|18|19|22|24|30|31|32|33|34|35|37|38|39|41|42|43|44|45|48|50|51|55|60|63|64|65|66|70|71|72|73|75|76|77|79|80|85|90|92|98";
export const DA_CPV_TYPE_PATTERN = `^(${CPV_DIVISIONS})[0-9]{6}(-[0-9])?$`;
const cpvTypePattern = new RegExp(DA_CPV_TYPE_PATTERN);

export function daPurchaseType(cpv: string | null | undefined, acquisitionType?: string | null): DaPurchaseType | null {
  const explicit = acquisitionType?.trim().toLowerCase();
  if (explicit) {
    if (["lucrari", "lucrări"].includes(explicit)) return "works";
    if (["furnizare", "produse", "servicii"].includes(explicit)) return "goods_services";
    return null;
  }
  const code = cpv?.trim();
  if (!code || !cpvTypePattern.test(code)) return null;
  return code.startsWith("45") ? "works" : "goods_services";
}

/** Unknown dates/types and pre-2016 purchases have no supported ceiling. */
export function daCeiling(date: string | null, cpv: string | null, acquisitionType?: string | null): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  const type = daPurchaseType(cpv, acquisitionType);
  if (!type) return null;
  const era = DA_CEILING_ERAS.find((r) => date >= r.validFrom && (!r.validTo || date < r.validTo));
  return era ? (type === "works" ? era.works : era.goodsServices) : null;
}

export const DA_CEILING_SEED_ROWS = DA_CEILING_ERAS.flatMap((era) => [
  { key: "da_ceiling_goods_services" as const, validFrom: era.validFrom, validTo: era.validTo, valueNum: String(era.goodsServices), note: `${era.law}; produse/servicii; lei fără TVA` },
  { key: "da_ceiling_works" as const, validFrom: era.validFrom, validTo: era.validTo, valueNum: String(era.works), note: `${era.law}; lucrări; lei fără TVA` },
]);
