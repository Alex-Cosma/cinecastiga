import { describe, expect, it } from "vitest";
import type { NetworkData } from "../../lib/ask/network-shared";
import type { SankeyData } from "../../lib/ask/sankey-shared";
import type { AskSpec } from "../../lib/ask/spec";
import { decodeSpec } from "../../lib/ask/permalink";
import { answerCsv } from "./answer-csv";
import { appliedAfterNetwork, appliedAfterSankeyShown, sankeyDeeperSpec, threadHref } from "./answer-state";
import { networkButtons, networkEmpty, networkPage, networkRowView, orderedRows, rowFacts, yearBand, yearsWords } from "./network-answer";
import { flowGeometry, partnerDomainsWords, sankeySuggestion, sankeyView, shownOptions } from "./sankey-answer";
import { patchDraft } from "./builder/view";

/*
 * F4, the relations' answers as words (network-answer.ts, sankey-answer.ts):
 * the network's buttons, rows, orders, rest and empty groups; the flow's
 * folding at 6 · 10 · 15, its rests, suggestion and geometry; the strip's
 * changes on the applied question and the draft; the shown CSV.
 */

const row = (entityId: string, value: number, count = 1, joint = 0) => ({ entityId, value, count, joint });
const partner = (entityId: string, name: string, first: number, last: number, years: number[], extra: Partial<NetworkData["partners"][string]> = {}) =>
  ({ entityId, name, county: "Buzau", employees: 12, first, last, years, signals: [], firmShare: null, ...extra });
const list = (rows: ReturnType<typeof row>[], partners = rows.length) =>
  ({ partners, value: rows.reduce((t, r) => t + r.value, 0), count: rows.reduce((t, r) => t + r.count, 0), oneOff: rows.filter((r) => r.count === 1).length, joint: rows.reduce((t, r) => t + r.joint, 0), rows });
const NETWORK: NetworkData = {
  block: "network", focal: { entityId: "1", name: "MUNICIPIUL BUZAU", role: "authority" }, since: 2025, complete: 2025, list: "all",
  lists: {
    all: { ...list([row("10", 332_540_727, 14), row("11", 146_131_789, 2, 146_131_789), row("12", 51_111_529, 58), row("13", 900)], 282), value: 1_570_558_148 },
    new: list([row("11", 146_131_789, 2, 146_131_789)], 28),
    continuing: list([row("10", 332_540_727, 14), row("12", 51_111_529, 58)], 37),
    gone: list([], 0),
  },
  partners: {
    10: partner("10", "RER SUD", 2019, 2025, [2019, 2020, 2021, 2022, 2023, 2024, 2025], { employees: 388, firmShare: 0.654 }),
    11: partner("11", "CONCELEX", 2025, 2025, [2025], { county: "Bucuresti", employees: 910 }),
    12: partner("12", "URBAN SCOPE", 2018, 2026, [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026], { signals: ["da_split", "net_shared_admin"] }),
    13: partner("13", "KARSAN", 2024, 2024, [2024], { county: "Străinătate", employees: null }),
  },
  lastNew: 2023, streams: { da: { value: 81_803_975, count: 782 }, contracts: { value: 1_488_754_172, count: 201 } },
};
const spec: AskSpec = { block: "network", dim: "authority", measure: "value", filters: { authorityId: 1, authorityName: "MUNICIPIUL BUZAU" } };

describe("the network's answer (final network §3.1, §3.5, §3.7, §4)", () => {
  it("has four buttons with their partners and sums, an empty group disabled with its reason", () => {
    expect(networkButtons(NETWORK).map((b) => [b.value, b.name, b.count, b.disabled ?? null])).toEqual([
      ["all", "Toți", "282 · 1,6 mld.", null], ["new", "Noi", "28 · 146,1 mil.", null], ["continuing", "Continuă", "37 · 383,7 mil.", null],
      ["gone", "Nu mai apar", "0 · 0 lei", "Toți partenerii au înregistrări și din 2025."],
    ]);
    expect(networkEmpty({ ...NETWORK, lists: { ...NETWORK.lists, new: list([], 0) } }, "new")).toBe("Niciun furnizor nou din 2025. Cel mai recent nou: 2023.");
  });

  it("orders the rows it holds by value, records or years, and folds the rest", () => {
    expect(orderedRows(NETWORK, "all", "count").map((r) => r.entityId)).toEqual(["12", "10", "11", "13"]);
    expect(orderedRows(NETWORK, "all", "years").map((r) => r.entityId)).toEqual(["12", "10", "11", "13"]);
    const page = networkPage(NETWORK, { network: { show: 10 } }, "all");
    expect([page.shown, page.held, page.more, page.rest]).toEqual([4, 4, null, "alți 278 de parteneri · 66,3% din valoare"]);
    // An old link shows 14; „Arată încă” adds rows the answer holds.
    expect(networkPage(NETWORK, {}, "continuing", 0).rows.map((r) => r.entityId)).toEqual(["10", "12"]);
  });

  it("draws a row with its place, at most two facts, its share and its band of years", () => {
    const view = networkRowView(NETWORK.lists.all.rows[2]!, NETWORK, "all", 2026);
    expect([view.name, view.place, view.facts.map((f) => [f.text, f.tone ?? "neutral"]), view.share, view.records, view.yearsText]).toEqual([
      "URBAN SCOPE", "Buzau · 12 angajați", [["posibilă fracționare +1", "signal"]], "3,3% din total", "58 de înregistrări", "≤2018–2026 · 9 ani",
    ]);
    expect(view.band.map((c) => `${c.label}${c.on ? "+" : "-"}${c.partial ? "~" : ""}${c.gap ? "|" : ""}`).join(" "))
      .toBe("≤2018+ 2019+ 2020+ 2021+ 2022+ 2023+ 2024+ 2025+| 2026+~");
    expect(view.scope).toEqual({ role: "supplier", entityIds: ["12"] });
    expect(rowFacts(NETWORK.lists.all.rows[1]!, NETWORK.partners["11"]!).map((f) => f.text)).toEqual(["în asociere"]);
    expect(rowFacts(NETWORK.lists.all.rows[0]!, NETWORK.partners["10"]!).map((f) => f.text)).toEqual(["65,4% din ce a câștigat firma"]);
    expect(networkRowView(NETWORK.lists.all.rows[3]!, NETWORK, "all", 2026).place).toBe("Străinătate");
    expect([yearsWords(NETWORK.partners["11"]!, "new"), yearsWords(NETWORK.partners["13"]!, "gone")]).toEqual(["2025 · nou", "ultima: 2024"]);
    expect(yearBand({ years: [] }, NETWORK, 2025).every((c) => !c.on)).toBe(true);
  });

  it("switches group, order and year on the applied question; the draft gets the same", () => {
    const period: AskSpec = { ...spec, filters: { ...spec.filters, yearFrom: 2023, yearTo: 2024 }, network: { show: 15 } };
    const group = appliedAfterNetwork(period, { list: "new" }, 2023);
    expect(group).toEqual({ spec: { ...spec, network: { show: 15, partners: "new", since: 2023 } }, dropPeriod: true });
    expect(appliedAfterNetwork(group.spec, { order: "count" }, 2023).spec.network).toEqual({ show: 15, partners: "new", since: 2023, order: "count" });
    expect(appliedAfterNetwork({ ...group.spec, network: { ...group.spec.network, order: "count" } }, { order: "value" }, 2023).spec.network).toEqual({ show: 15, partners: "new", since: 2023 });
    expect(appliedAfterNetwork(group.spec, { since: 2021 }, 2023).spec.network?.since).toBe(2021);
    const draft = patchDraft(period as never, { path: "network", value: "new", network: group.spec.network!, dropPeriod: true });
    expect([draft.filters.yearFrom, draft.network]).toEqual([undefined, { show: 15, partners: "new", since: 2023 }]);
  });

  it("exports the rows on screen with their group, years, share, association and signals", () => {
    const { text, filename } = answerCsv(NETWORK, { ...spec, network: { partners: "continuing", since: 2025 } }, "Cu cine a continuat să lucreze MUNICIPIUL BUZAU din 2025?");
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toBe("partener,judet,valoare_lei,inregistrari,grupa,primul_an,ultimul_an,ani,procent_din_total,valoare_in_asociere_lei,pondere_in_castigurile_firmei,semnale");
    expect(lines.slice(1)).toEqual([
      `"RER SUD","Buzau",332540727,14,"Continuă",2019,2025,"2019 2020 2021 2022 2023 2024 2025",86.68,0,65.4,""`,
      `"URBAN SCOPE","Buzau",51111529,58,"Continuă",2018,2026,"2018 2019 2020 2021 2022 2023 2024 2025 2026",13.32,0,,"posibilă fracționare; reprezentant comun"`,
    ]);
    expect(filename).toMatch(/\.csv$/);
  });
});

const flowPartner = (entityId: string, value: number, extra = {}) => ({ entityId, name: `Firma ${entityId}`, value, count: 1, domains: 1, joint: 0, ...extra });
const SANKEY: SankeyData = {
  block: "sankey", focal: { entityId: "1", name: "MUNICIPIUL BUZAU", role: "authority" },
  partners: Array.from({ length: 15 }, (_, i) => flowPartner(String(100 + i), 1000 - i * 10)).map((p, i) => i === 1 ? { ...p, with: ["Gama SRL", "Delta SRL", "Epsilon SRL"], withMore: 4, joint: 990 } : p),
  domains: [{ code: "45", name: "Lucrări de construcţii", value: 9000, count: 9, partners: 9 }, { code: "90", name: null, value: 4000, count: 4, partners: 4 }],
  flows: [
    ...Array.from({ length: 15 }, (_, i) => ({ partnerId: String(100 + i), partner: `Firma ${100 + i}`, categoryCode: i % 2 ? "90" : "45", category: null, value: 1000 - i * 10, count: 1 })),
    { partnerId: "_alt", partner: "alți parteneri", categoryCode: "_alt", category: "alte domenii", value: 2000, count: 30 },
  ],
  totals: { value: 16950, count: 45, partners: 40, domains: 9 }, stemLen: 2, joint: 990,
};

describe("the flow's answer (final sankey §3.2–§3.4, §3.10)", () => {
  it("folds the partners past „Arată” into one dotted node and the domains past five into another", () => {
    const six = sankeyView(SANKEY, {});
    expect(six.partners.map((p) => p.id)).toEqual(["100", "101", "102", "103", "104", "105", "_alt"]);
    expect(six.partners.at(-1)).toMatchObject({ rest: true, name: "alte 34 de firme", value: 16950 - 5850, scope: { role: "supplier", excludeEntityIds: ["100", "101", "102", "103", "104", "105"] } });
    expect(six.domains.map((d) => [d.id, d.name, d.rest])).toEqual([["45", "Construcții", false], ["90", "Salubritate, mediu", false], ["_alt", "alte 7 domenii", true]]);
    expect(six.links.find((l) => l.partner === "_alt" && l.domain === "45")?.value).toBe(940 + 920 + 900 + 880 + 860);
    expect(sankeyView(SANKEY, { sankey: { shown: 15 } }).partners).toHaveLength(16);
    expect(six.partners[1]!.joint).toBe("În asociere cu Gama SRL, Delta SRL, Epsilon SRL și încă 4 firme");
    expect(six.joint).toBe("5,8% din valoare vine din contracte în asociere, împărțite egal între câștigători.");
    expect(partnerDomainsWords(six, "100")).toBe("Construcții 100%");
    expect(shownOptions({ totals: { ...SANKEY.totals, partners: 8 } }).map((o) => o.disabled ?? null)).toEqual([null, null, "Selecția are mai puțini parteneri."]);
  });

  it("suggests the domain that holds 90% of the value, never at eight digits", () => {
    expect(sankeySuggestion(SANKEY)).toBeNull();
    const one = { ...SANKEY, domains: [{ ...SANKEY.domains[0]!, value: 16_000 }], totals: { ...SANKEY.totals, value: 16_950 } };
    expect(sankeySuggestion(one)).toEqual({ code: "45", name: "Construcții", text: "94,4% e Construcții" });
    expect(sankeySuggestion({ ...one, domains: [{ ...one.domains[0]!, code: "45233140" }] })).toBeNull();
    const deeper = sankeyDeeperSpec({ block: "sankey", measure: "value", filters: { authorityId: 1, purchaseKind: "lucrari" } }, "45");
    expect(deeper).toEqual({ block: "sankey", measure: "value", filters: { authorityId: 1, cpvTerm: "45" } });
    const href = new URL(threadHref(deeper, "4523", { root: null, steps: [{ code: "45", name: "Construcții" }, { code: "4523", name: "Drumuri" }] }), "http://x");
    expect([decodeSpec(href.searchParams.get("spec")!), JSON.parse(href.searchParams.get("fir")!).steps.length]).toEqual([{ ...deeper, filters: { ...deeper.filters, cpvTerm: "4523" } }, 2]);
  });

  it("stacks each side with room for its labels, the bands as thick as their share of each node", () => {
    const geo = flowGeometry(sankeyView(SANKEY, {}));
    expect(geo.height).toBe(7 * 58);
    for (const side of [geo.left, geo.right]) for (const { h } of side.values()) expect(h).toBeGreaterThanOrEqual(44);
    const lastLeft = [...geo.left.values()].at(-1)!;
    expect(lastLeft.y + lastLeft.h).toBeCloseTo(geo.height, 6);
    expect(geo.bands.every((b) => b.h0 > 0 && b.h1 > 0)).toBe(true);
  });

  it("keeps its length on the applied question and the draft (six is the question without the key)", () => {
    const flow: AskSpec = { block: "sankey", dim: "authority", measure: "value", filters: { authorityId: 1 } };
    expect(appliedAfterSankeyShown(flow, 10).sankey).toEqual({ shown: 10 });
    expect(appliedAfterSankeyShown({ ...flow, sankey: { shown: 10 } }, 6)).not.toHaveProperty("sankey");
    expect(patchDraft(flow as never, { path: "sankey", value: "15", sankey: { shown: 15 } }).sankey).toEqual({ shown: 15 });
    const { text } = answerCsv(SANKEY, flow, "Ce cumpără MUNICIPIUL BUZAU și de la cine?");
    expect(text.split("\r\n")[0]!.replace(/^\uFEFF/, "")).toBe("partener,domeniu,cod_cpv,valoare_lei,inregistrari");
  });
});
