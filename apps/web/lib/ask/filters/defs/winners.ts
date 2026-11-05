import { NEW_ARCHIVE_FROM, NEW_SCOPES, WINNERS_RULES, namedBuyer, type NewScope } from "../../spec";
import type { AnswerForm, FilterCtx, FilterDef, FilterSpec } from "../types";
import { alwaysScope, edited, setFilters } from "./shared";
import { DOMINANT_LABEL, MAIN_CLIENT_LABEL } from "../words";

/*
 * The ranked winners (plan §3, §4.2 P3a, F5; final table §3.3, §3.6, §3.7;
 * kit §4 "Prima înregistrare a firmei", "Nou", "Înmatriculare"): conditions on
 * the firms or institutions of a ranking, in its group row. They narrow the
 * list; the total and „% din total” stay the sentence's (compile.ts keep). The
 * engine reads the firm's own years on its profile and resolves the relations
 * into lists (lib/ask/winners.ts).
 * - newSince + newScope, „Firme noi”: new for the named buyer („Furnizori
 *   noi”), first in our data („Prima dată”) or registered („Înmatriculate”),
 *   from a year. On institutions and counties the firm's own years are a
 *   selection of the records, in „De la cine › Ce fel de firme”.
 * - mainClient, „Principalul lor client public”: a ranking of firms of one
 *   named buyer.
 * - dominantSupplier, „O firmă ia peste jumătate”: a ranking of institutions.
 */

export interface NewFirmsChoice { newSince?: number; newScope?: string }

/** A ranking of firms: "Cine câștigă?" on firms, and "Cine conduce?" by value, which runs it. */
const firmRanking = (spec: FilterSpec) => spec.dim === "supplier" && (spec.block === "table" || spec.block === "entity_card" && spec.rankBy === "value");
const rankedForm = (form: AnswerForm) => form === "table" || form === "entity_card:value";

/** The senses a question offers: new for its buyer only on firms of a named buyer; the firm's own years on any ranking. */
export function newScopesOf(spec: FilterSpec, ctx: Pick<FilterCtx, "form">): NewScope[] {
  if (!rankedForm(ctx.form)) return [];
  return NEW_SCOPES.filter((scope) => scope !== "buyer" || firmRanking(spec) && namedBuyer(spec.filters));
}
/**
 * The years "Firme noi" offers (final table §3.3): the last four up to the period's end (with every year, up to the
 * current one), never after it; the archive's own senses from 2020.
 */
export function newYearsOf(spec: FilterSpec, ctx: Pick<FilterCtx, "year">, scope: NewScope): number[] {
  const end = spec.filters.yearTo !== undefined ? Number(spec.filters.yearTo) : ctx.year;
  return [end - 3, end - 2, end - 1, end].filter((year) => scope === "registry" || year >= NEW_ARCHIVE_FROM);
}
/** The sense the window opens on (final table §3.3): new for the buyer when one is named, else registered. */
export const defaultNewScope = (spec: FilterSpec, ctx: Pick<FilterCtx, "form">): NewScope | null => {
  const scopes = newScopesOf(spec, ctx);
  return scopes.includes("buyer") ? "buyer" : scopes.includes("registry") ? "registry" : scopes[0] ?? null;
};

export const newSince: FilterDef<NewFirmsChoice> = {
  id: "newSince", keys: ["filters.newSince", "filters.newScope"], placement: "row", control: "rangePills",
  label: "Firme noi", windowTitle: "Ce firme noi?",
  windowNote: "Furnizori noi: prima înregistrare cu instituția aleasă. Prima dată: prima înregistrare în datele noastre. Înmatriculate: anul din Registrul Comerțului.",
  // The firm's own year: a semi-join on its profile; new for the buyer: the list winners.ts resolves. On firms a group
  // (CÂȘTIGĂTORII: the list narrows, the total stays), on institutions and counties a selection of their sellers.
  engine: { table: "entityAttr", "entity_card:value": "entityAttr" },
  scope: (_form, spec) => spec?.dim === "supplier" ? "group" : "selection", since: "F5",
  read: (spec) => spec.filters.newSince !== undefined || spec.filters.newScope !== undefined
    ? {
      ...(spec.filters.newSince !== undefined ? { newSince: Number(spec.filters.newSince) } : {}),
      ...(spec.filters.newScope !== undefined ? { newScope: String(spec.filters.newScope) } : {}),
    } : undefined,
  write: (spec, value) => setFilters(spec, { newSince: value?.newSince, newScope: value?.newScope }),
  choices: (spec, ctx) => newScopesOf(spec, ctx).flatMap((scope) => newYearsOf(spec, ctx, scope).map((year) => ({ newScope: scope, newSince: year }))),
  validate: WINNERS_RULES.newSince,
};

export const mainClient: FilterDef<true> = {
  id: "mainClient", keys: ["filters.mainClient"], placement: "row", control: "toggle",
  label: MAIN_CLIENT_LABEL, windowTitle: MAIN_CLIENT_LABEL,
  windowNote: "Cel puțin jumătate din tot ce a câștigat firma în achiziții publice (din 2018, cel puțin 3 înregistrări) vine de la această instituție.",
  // An attribute of the firm against the named buyer (whole archive), a list winners.ts resolves: a row semi-join.
  engine: { table: "entityAttr" }, scope: alwaysScope("group"), since: "F5",
  read: (spec) => spec.filters.mainClient === true ? true : undefined,
  write: (spec, value) => setFilters(spec, { mainClient: value }),
  choices: (spec) => spec.block === "table" && spec.dim === "supplier" && namedBuyer(spec.filters) ? [undefined, true] : [undefined],
  validate: WINNERS_RULES.mainClient,
};

export const dominantSupplier: FilterDef<true> = {
  id: "dominantSupplier", keys: ["filters.dominantSupplier"], placement: "row", control: "toggle",
  label: DOMINANT_LABEL, windowTitle: DOMINANT_LABEL,
  windowNote: "Cea mai mare firmă are cel puțin jumătate din valoarea instituției în selecție, din cel puțin 3 înregistrări.",
  engine: { table: "group" }, scope: alwaysScope("group"), since: "F5",
  read: (spec) => spec.filters.dominantSupplier === true ? true : undefined,
  write: (spec, value) => edited(spec, (next) => { if (value) next.filters.dominantSupplier = true; else delete next.filters.dominantSupplier; }),
  choices: (spec) => spec.block === "table" && spec.dim === "authority" ? [undefined, true] : [undefined],
  validate: WINNERS_RULES.dominantSupplier,
};

/**
 * „Și profilurile istorice” (rf-2026.22, owner decision S8): the ranking by the risk score leaves out the profiles
 * without any record in the last 24 months; the answer offers them back (EntityCardAnswer, „Include-le”).
 */
export const HISTORIC_LABEL = "Și profilurile istorice";
export const includeHistoric: FilterDef<true> = {
  id: "includeHistoric", keys: ["filters.includeHistoric"], placement: "row", control: "toggle",
  label: HISTORIC_LABEL, windowTitle: HISTORIC_LABEL,
  windowNote: "Profilurile fără nicio achiziție sau contract în ultimele 24 de luni. Clasamentul după risc nu le arată implicit; scorul lor rămâne.",
  engine: { "entity_card:risk": "profile" }, scope: alwaysScope("group"), since: "rf-2026.22",
  read: (spec) => spec.filters.includeHistoric === true ? true : undefined,
  write: (spec, value) => setFilters(spec, { includeHistoric: value }),
  choices: (spec) => spec.block === "entity_card" && (spec.rankBy ?? "risk") === "risk" ? [undefined, true] : [undefined],
};

export const WINNERS_DEFS: readonly FilterDef[] = [newSince, mainClient, dominantSupplier, includeHistoric];
