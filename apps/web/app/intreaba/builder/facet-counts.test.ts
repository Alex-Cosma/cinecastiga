import { describe, expect, it } from "vitest";
import { EMPLOYEE_BAND_BOUNDS, FACET_PENDING, type FacetCounts, type FacetView } from "../../../lib/ask/facet-parts";
import { defaultQuestion, transitionQuestion } from "../../../lib/ask/question-ui";
import { EMPLOYEE_BANDS } from "./Bands";
import { facetAsk } from "./use-facet";
import { bandCount, countedOptions, countedRest, countySide, emptyReason, presetCounts, shareText, type PeriodPreset } from "./window-model";
import type { KitOption } from "./kit-types";

/*
 * The builder's side of the windows' counts (kit R5): how a window draws the
 * counts it asked for (pending, read, none), the empty option it disables
 * (R1), the rest row, the bands, the segmented's and the pills' shares, the
 * period presets, and the request it makes (the draft without the window's key).
 */

const counts = (over: Partial<FacetCounts> = {}): FacetCounts => ({
  part: "kind", unit: "institutions", checkpoint: "c1", tookMs: 3,
  options: [{ value: "spital", n: 344, value_ron: 600, share: 0.6 }, { value: "comuna", n: 0, value_ron: 0, share: 0 }],
  rest: { label: "Alte instituții", n: 40, value_ron: 400, share: 0.4 },
  total: { n: 384, value_ron: 1000 },
  ...over,
});
const ready = (c: FacetCounts = counts()): FacetView => ({ status: "ready", counts: c });
const options: KitOption[] = [{ value: "all", label: "Toate instituțiile publice" }, { value: "spital", label: "Spitale" }, { value: "comuna", label: "Primării de comună" }, { value: "x", label: "Firme" }];
const valueOf = (o: KitOption) => o.value === "all" ? undefined : o.value === "x" ? null : o.value;

describe("countedOptions: a window's options with their counts", () => {
  it("marks every counted option while the counts load, and leaves the uncounted alone", () => {
    expect(countedOptions(options, { status: "loading" }, valueOf).map((o) => o.count)).toEqual([FACET_PENDING, FACET_PENDING, FACET_PENDING, undefined]);
  });
  it("draws the share and the number, the first row the total, and disables an empty option with the reason", () => {
    const drawn = countedOptions(options, ready(), valueOf);
    expect(drawn.map((o) => [o.count, o.share, o.disabled])).toEqual([
      ["384", undefined, undefined], ["60,0% · 344", 0.6, undefined], ["0,0% · 0", 0, "Nicio instituție în selecția de acum."], [undefined, undefined, undefined],
    ]);
  });
  it("keeps the checked option and an empty year choosable", () => {
    expect(countedOptions(options, ready(), valueOf, { checked: "comuna" })[2]!.disabled).toBeUndefined();
    expect(countedOptions(options, ready(), valueOf, { disable: false })[2]!.disabled).toBeUndefined();
  });
  it("leaves the options as they are without counts (a timeout, an error, a count the marts stage will keep)", () => {
    expect(countedOptions(options, { status: "none" }, valueOf)).toEqual(options);
  });
  it("shares the procedures of every purchase once the channels are read", () => {
    const procedures = counts({ part: "procedure", unit: "records", options: [{ value: "deschisa", n: 10, value_ron: 250, share: 0.5 }], rest: null });
    expect(countedOptions([{ value: "p", label: "Licitație deschisă" }], ready(procedures), () => "deschisa", { over: 1000 })[0]!.count).toBe("25,0% · 10");
  });
});

describe("the other controls' counts", () => {
  it("counts the rest row it holds, by its label", () => {
    expect(countedRest([{ label: "Alte instituții" }], ready())).toEqual([{ label: "Alte instituții", count: "40,0% · 40" }]);
    expect(countedRest([{ label: "Sediu necunoscut" }], ready())).toEqual([{ label: "Sediu necunoscut" }]);
    expect(countedRest([{ label: "Alte instituții" }], { status: "loading" })).toEqual([{ label: "Alte instituții", count: FACET_PENDING }]);
    expect(countedRest(undefined, ready())).toBeUndefined();
  });
  it("gives the segmented and the pills a share, and the reason of an empty value", () => {
    expect(shareText(ready(), "spital")).toBe("60,0%");
    expect(shareText({ status: "loading" }, "spital")).toBe(FACET_PENDING);
    expect(shareText({ status: "none" }, "spital")).toBeUndefined();
    expect(emptyReason(ready(), "comuna")).toBe("Nicio instituție în selecția de acum.");
    expect(emptyReason(ready(), "spital")).toBeNull();
  });
  it("puts the firms of a band under it, and a county's count beside it (0 where the draft has none)", () => {
    expect(bandCount(ready(counts({ part: "employees", unit: "firms", options: [{ value: "1-9", n: 46969, value_ron: 1, share: 1 }] })), "1-9")).toBe("46.969");
    const county = ready(counts({ part: "county", unit: "records", options: [{ value: "Cluj", n: 133971, value_ron: 54, share: 0.054 }] }));
    expect(countySide(county, "Cluj")).toBe("5,4% · 133.971");
    expect(countySide(county, "Olt")).toBe("0,0% · 0");
  });
  it("counts each period preset over the years it holds", () => {
    const years = counts({ part: "years", unit: "records", rest: null, total: { n: 60, value_ron: 600 },
      options: [{ value: "2023", n: 10, value_ron: 100, share: 1 / 6 }, { value: "2024", n: 20, value_ron: 200, share: 1 / 3 }, { value: "2025", n: 30, value_ron: 300, share: 0.5 }] });
    const presets: PeriodPreset[] = [
      { value: "current", label: "2025", period: { yearFrom: 2025, yearTo: 2025 } },
      { value: "three", label: "Ultimii 3 ani compleți", period: { yearFrom: 2023, yearTo: 2025 } },
      { value: "all", label: "Toți anii", period: undefined },
    ];
    expect(presetCounts(presets, ready(years)).map((p) => p.count)).toEqual(["50,0% · 30", "100,0% · 60", "60"]);
    expect(presetCounts(presets, { status: "loading" }).every((p) => p.count === FACET_PENDING)).toBe(true);
  });
});

describe("the request of a window", () => {
  it("asks for the draft without the window's own key, under one key per draft and part", () => {
    const draft = transitionQuestion(defaultQuestion(), "stat").spec;
    draft.filters.authorityKind = "spital";
    const asked = facetAsk(draft, "kind");
    expect(asked.spec.filters).not.toHaveProperty("authorityKind");
    expect(asked.key).toBe(facetAsk({ ...draft, filters: { ...draft.filters, authorityKind: "scoala" } }, "kind").key);
    expect(asked.key).not.toBe(facetAsk(draft, "county").key);
    expect(draft.filters.authorityKind).toBe("spital");
  });
  it("names the bands as the builder draws them", () => {
    expect(EMPLOYEE_BAND_BOUNDS).toEqual(EMPLOYEE_BANDS.map((b) => ({ value: b.value, min: b.min, max: b.max })));
  });
});
