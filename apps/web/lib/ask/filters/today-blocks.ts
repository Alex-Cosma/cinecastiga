import type { Block } from "../spec";
import type { BlockFilters, FilterCtx, FilterId, FilterSpec, Slot } from "./types";

/*
 * TODAY_BLOCK_FILTERS: what today's builder (app/intreaba/QuestionBuilder.tsx)
 * offers on each of the 13 questions, in which place, exactly as it draws them
 * (sentence(), activeConditions(), the "add" list, "Mai multe filtre" and the
 * presentation line). Written at F0 as BLOCK_FILTERS; F1b's offers replaced it
 * there (blocks.ts). today.test.ts pins the code it describes and walks every
 * offer against the engine, which finds TODAY_REFUSALS. It leaves with that
 * code, when the builder renders from BLOCK_FILTERS.
 */

/** The questions whose sentence carries who bought and where (activeConditions `scopeInSentence`). */
const SCOPE_IN_SENTENCE: readonly string[] = ["table", "stat", "timeseries", "breakdown"];
/** The questions about one entity, shown as the focal phrase (activeConditions `focalBlock`). */
const FOCAL_BLOCKS: readonly string[] = ["network", "sankey", "distribution", "compare"];

const slot = (id: FilterId, extra: Omit<Slot, "id"> = {}): Slot => ({ id, ...extra });
/** "{who}" / "{buyer}": the named institution, else the kind of institution. */
const buyer = (ctx: FilterCtx): Slot => slot(ctx.named.authority ? "authority" : "authorityKind");
/** "de la {firma}", only when a firm is named. */
const fromSupplier = (ctx: FilterCtx): Slot[] => ctx.named.supplier ? [slot("supplier")] : [];
/** "din {where}": the place picker, which also offers a locality where the question supports one. */
const place = (ctx: FilterCtx): Slot => slot("county", ctx.locality.ok ? { writes: ["locality"] } : {});
/** A named entity is the scope: no "din toată România" unless a county or a locality is set. */
const inPlace = (spec: FilterSpec, ctx: FilterCtx): Slot[] =>
  (ctx.named.authority || ctx.named.supplier) && !spec.filters.county && !spec.filters.uatName ? [] : [place(ctx)];
/** The focal entity: one picker with an institution/firm switch (it rewrites the dimension to the role). */
const focal = (ctx: FilterCtx): Slot =>
  ctx.role === "authority" ? slot("authority", { picker: "focal", writes: ["supplier"] }) : slot("supplier", { picker: "focal", writes: ["authority"] });
const period = slot("period");

/** The chips row, as activeConditions() builds it (the profile badge is scopeLine). */
function chips(spec: FilterSpec, ctx: FilterCtx): Slot[] {
  const f = spec.filters;
  const inSentence = SCOPE_IN_SENTENCE.includes(spec.block);
  const focalBlock = FOCAL_BLOCKS.includes(spec.block);
  const out: Slot[] = [slot("dataset")];
  if (f.authorityKind && (!inSentence || ctx.named.authority || spec.block === "table" && spec.dim !== "supplier")) out.push(slot("authorityKind", { removable: true }));
  if (f.county && (!inSentence || f.uatSiruta)) out.push({ ...place(ctx), removable: true });
  if (f.uatSiruta && !inSentence) out.push(slot("locality", { removable: true }));
  if (ctx.profile && (f.yearFrom || f.yearTo) || !ctx.profile && !inSentence && !["trend", "map"].includes(spec.block))
    out.push(slot("period", { removable: Boolean(f.yearFrom || f.yearTo) }));
  if (f.cpvTerm) out.push(slot("cpvTerm", { removable: true }));
  if (ctx.named.authority && !inSentence && !["map", "fact_check"].includes(spec.block) && !(focalBlock && ctx.role === "authority")) out.push(slot("authority", { removable: true }));
  if (ctx.named.supplier && spec.block !== "fact_check" && !(focalBlock && ctx.role === "supplier")) out.push(slot("supplier", { removable: true }));
  if (f.minEmployees !== undefined || f.maxEmployees !== undefined) out.push(slot("employees", { removable: true }));
  if (f.adminName || f.adminPersonKey) out.push(slot("admin", { removable: true }));
  if (f.singleBidder) out.push(slot("singleBidder", { removable: true }));
  return out;
}

/** "Adaugă o condiție": the same list on every transaction question, every item whether set or not. */
function addList(spec: FilterSpec, ctx: FilterCtx): Slot[] {
  if (spec.block === "compare") return [];
  if (ctx.profile) return [
    slot("county", { label: "Județul grupului de comparație", detail: "Restrânge profilurile comparate." }),
    ...(spec.dim !== "supplier" ? [slot("authorityKind")] : []),
  ];
  return [
    slot("cpvTerm"),
    ...(!["network", "sankey"].includes(spec.block) ? [slot("authority"), slot("supplier")] : []),
    ...(spec.block !== "map" && spec.dim !== "county" ? [place(ctx), ...(ctx.locality.ok ? [slot("locality")] : [])] : []),
    slot("authorityKind"), slot("employees"), slot("admin"), slot("singleBidder"),
  ];
}

/** "Mai multe filtre": under every question but a comparison, unless the link already carries one. */
const moreFilters = (spec: FilterSpec): Slot[] =>
  spec.block !== "compare" || spec.population || spec.minimumRecords ? [slot("minimumRecords"), slot("population")] : [];

function entry(sentence: BlockFilters["sentence"], presentation: BlockFilters["presentation"] = () => []): BlockFilters {
  return {
    sentence, presentation,
    scopeLine: (_spec, ctx) => ctx.profile ? "historical-da" : null,
    invites: addList, under: chips, advanced: moreFilters,
    rows: () => [], strip: [], rowMenu: [], facts: [],
  };
}

/** "Măsoară {valoarea înregistrată}." */
const measureLine = (): Slot[] => [slot("measure")];

export const TODAY_BLOCK_FILTERS: Record<Block, BlockFilters> = {
  // "Cine câștigă contractele de la {buyer}{ de la firma} din {where}, în {when}?" or
  // "Ce {instituții|județe} cumpără cel mai mult{ de la firma}{ din where}, în {when}?"
  table: entry(
    (spec, ctx) => spec.dim === "supplier"
      ? [buyer(ctx), ...fromSupplier(ctx), ...inPlace(spec, ctx), period]
      : [slot("dim"), ...fromSupplier(ctx), ...(spec.dim === "county" ? [] : inPlace(spec, ctx)), period],
    // "Arată {primele N|toate} {firme}, după {valoarea înregistrată}."
    () => [slot("topN"), slot("dim"), slot("measure")],
  ),
  // "Cât valorează achizițiile {who}…" / "Câte achiziții au {buyer}…"
  stat: entry((spec, ctx) => [buyer(ctx), ...fromSupplier(ctx), ...inPlace(spec, ctx), period], measureLine),
  timeseries: entry((spec, ctx) => [buyer(ctx), ...fromSupplier(ctx), ...inPlace(spec, ctx), period], measureLine),
  // "Cum se împart achizițiile {who}{ de la firma} pe județe, în {when}?"
  map: entry((_spec, ctx) => [buyer(ctx), ...fromSupplier(ctx), period], measureLine),
  breakdown: entry((spec, ctx) => [buyer(ctx), ...fromSupplier(ctx), ...inPlace(spec, ctx), period]),
  // "Compară {focal} cu {compareWith}."
  compare: entry((_spec, ctx) => [focal(ctx), slot("compareWith")]),
  // "Ce {firme} au cea mai mare schimbare între {primul an} și {al doilea an}?" (both years open one picker)
  trend: entry(() => [slot("dim"), period, period], () => [slot("topN")]),
  network: entry((_spec, ctx) => [focal(ctx)]),
  sankey: entry((_spec, ctx) => [focal(ctx)]),
  // "A cumpărat {instituția} de la {firma}?"
  fact_check: entry(() => [slot("authority"), slot("supplier")]),
  distribution: entry((_spec, ctx) => [focal(ctx)]),
  scatter: entry(() => [slot("dim")]),
  // "Care {firmă|instituție} are {cea mai mare valoare…|cel mai ridicat indice de risc}?"
  entity_card: entry(() => [slot("dim"), slot("rankBy")]),
};
