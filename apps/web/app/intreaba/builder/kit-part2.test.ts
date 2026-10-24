import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Bands, { EMPLOYEE_BANDS, bandRange, bandsMessage, bandsWords, spokenCount } from "./Bands";
import EntitySearch, { resultGroups, type SearchResult } from "./EntitySearch";
import PeriodPicker, { EMPTY_RANGE, PeriodRange, YEAR_COLUMNS, YearGrid, periodRangeError } from "./PeriodPicker";

// F1a, part 2 (builder side): the bands (10), the period (12) and the entity
// search (13) as markup (kit README §3, §8). The key paths are pure functions
// in keyboard.test.ts; the live behaviour is in the Playwright notes.
const html = <P extends object>(component: FunctionComponent<P>, props: P) => renderToStaticMarkup(createElement(component, props));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tags = (markup: string, tag: string) => markup.match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? [];
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

describe("the adjoining bands (10)", () => {
  const bands = EMPLOYEE_BANDS.map((band, index) => ({ ...band, count: ["6", "123", "69", "29", "21"][index]! }));
  it("is a group of toggle buttons named with their count, and the rest row is text", () => {
    const markup = html(Bands, { label: "Benzi de angajați", bands, value: ["1-9", "10-49"], rest: [{ label: "Fără bilanț", count: "4,1% · 34" }] });
    expect(markup).toContain('class="fk-bands" role="group" aria-label="Benzi de angajați"');
    const buttons = tags(markup, "button");
    expect(buttons.map(button => attr(button, "aria-pressed"))).toEqual(["false", "true", "true", "false", "false"]);
    // Each name starts with what the band shows (WCAG 2.5.3) and says what its number counts.
    expect(buttons.map(button => attr(button, "aria-label"))).toEqual(["0 angajați, 6 firme", "1–9 angajați, 123 de firme", "10–49 de angajați, 69 de firme", "50–249 de angajați, 29 de firme", "250+ angajați, 21 de firme"]);
    for (const band of EMPLOYEE_BANDS) expect(band.name?.startsWith(band.label), band.label).toBe(true);
    expect(markup).toMatch(/<div class="fk-opt fk-opt--rest">[^]*Fără bilanț[^]*4,1% · 34/);
    expect(markup).toContain('role="status" aria-live="polite"'); // what a press chose besides itself is said
    expect(markup).not.toMatch(/<input/); // no free fields (kit §5.5)
  });
  it("says what a run of bands applies, numerals with “de” from 20", () => {
    expect(bandRange(EMPLOYEE_BANDS, ["1-9", "10-49"])).toEqual({ min: 1, max: 49 });
    expect(bandRange(EMPLOYEE_BANDS, ["50-249", "250+"])).toEqual({ min: 50, max: null });
    expect(bandRange(EMPLOYEE_BANDS, [])).toBeNull();
    expect(bandsWords({ min: 1, max: 49 })).toBe("Firme cu 1–49 de angajați");
    expect(bandsWords({ min: 1, max: 9 })).toBe("Firme cu 1–9 angajați");
    expect(bandsWords({ min: 0, max: 0 })).toBe("Firme fără angajați");
    expect(bandsWords({ min: 250, max: null })).toBe("Firme cu cel puțin 250 de angajați");
  });
  it("says a run from 0 as “cel mult”, and all the bands as the firms with a balance sheet", () => {
    expect(bandsWords({ min: 0, max: 9 })).toBe("Firme cu cel mult 9 angajați");
    expect(bandsWords({ min: 0, max: 49 })).toBe("Firme cu cel mult 49 de angajați");
    // Every band still leaves out the rest row ("Fără bilanț"): never "cel puțin 0 angajați".
    expect(bandsWords(bandRange(EMPLOYEE_BANDS, EMPLOYEE_BANDS.map(band => band.value))!)).toBe("Firme cu bilanț");
  });
  it("reads a whole count with its noun, anything else as shown", () => {
    expect(spokenCount("6", ["firmă", "firme"])).toBe("6 firme");
    expect(spokenCount("1", ["firmă", "firme"])).toBe("1 firmă");
    expect(spokenCount("1.234", ["firmă", "firme"])).toBe("1.234 de firme");
    expect(spokenCount("4,1% · 34", ["firmă", "firme"])).toBe("4,1% · 34");
    expect(html(Bands, { label: "Benzi", bands: [{ ...EMPLOYEE_BANDS[1]!, count: "20" }], value: [], noun: ["partener", "parteneri"] })).toContain('aria-label="1–9 angajați, 20 de parteneri"');
  });
  it("announces the bands a press chose or dropped besides itself", () => {
    expect(bandsMessage(EMPLOYEE_BANDS, [2], [])).toBe("Am ales și 10–49.");
    expect(bandsMessage(EMPLOYEE_BANDS, [], [3, 4])).toBe("Am scos și 50–249, 250+.");
    expect(bandsMessage(EMPLOYEE_BANDS, [], [])).toBe("");
  });
});

describe("the period (12)", () => {
  const presets = [
    { value: "2026", label: "2026", detail: "până la 25 sept." },
    { value: "2025", label: "2025" },
    { value: "3y", label: "Ultimii 3 ani compleți", detail: "2023–2025" },
    { value: "all", label: "Toți anii", detail: "apr. 2018 – 25 sept. 2026" },
  ];
  it("lists the presets as a radiogroup with their years, then the free range behind a disclosure", () => {
    const markup = html(PeriodPicker, { presets, value: "all", custom: { open: false, value: EMPTY_RANGE, years: ["2024", "2025"] } });
    expect(markup).toContain('role="radiogroup" aria-label="Perioada"');
    const radios = tags(markup, "button").filter(button => attr(button, "role") === "radio");
    expect(radios.map(radio => attr(radio, "aria-checked"))).toEqual(["false", "false", "false", "true"]);
    expect(radios.map(radio => attr(radio, "tabindex"))).toEqual(["-1", "-1", "-1", "0"]);
    expect(text(markup)).toContain("Ultimii 3 ani compleți 2023–2025");
    const disclosure = tags(markup, "button").find(button => attr(button, "class") === "fk-link fk-range-open")!;
    expect(attr(disclosure, "aria-expanded")).toBe("false");
    expect(attr(disclosure, "aria-controls")).toBeNull();
    expect(text(markup)).toContain("Alege anii sau lunile…");
    expect(markup).not.toContain("<select");
    expect(text(markup)).not.toMatch(/Toată perioada|toți anii disponibili|Ultimul an complet/); // kit §4 vocabulary
  });
  it("opens the free range with year and month fields, unchecking the presets", () => {
    const markup = html(PeriodPicker, { presets, value: "all", custom: { open: true, value: { yearFrom: "2024", yearTo: "", monthFrom: "3", monthTo: "" }, years: ["2023", "2024", "2025"] } });
    expect(tags(markup, "button").filter(button => attr(button, "role") === "radio").every(radio => attr(radio, "aria-checked") === "false")).toBe(true);
    const disclosure = tags(markup, "button").find(button => attr(button, "class") === "fk-link fk-range-open")!;
    expect(attr(disclosure, "aria-expanded")).toBe("true");
    expect(markup).toContain(`id="${attr(disclosure, "aria-controls")}"`);
    expect(tags(markup, "select")).toHaveLength(4);
    expect(text(markup)).toMatch(/Din anul de la început 2023 2024 2025 Până în anul până acum/);
    expect(markup).toContain('<option value="3" selected="">martie</option>');
    expect(markup).toContain('<option value="2024" selected="">2024</option>');
  });
  it("says why a free range cannot be used, in today's words", () => {
    expect(periodRangeError({ ...EMPTY_RANGE, yearFrom: "2025", yearTo: "2023" })).toBe("Perioada trebuie să înceapă înainte să se încheie.");
    expect(periodRangeError({ ...EMPTY_RANGE, monthFrom: "3" })).toBe("Alege și anul pentru fiecare lună selectată.");
    expect(periodRangeError({ yearFrom: "2024", yearTo: "2024", monthFrom: "9", monthTo: "3" })).toBe("Luna de început trebuie să fie înaintea lunii de sfârșit.");
    expect(periodRangeError({ ...EMPTY_RANGE, yearFrom: "2024", yearTo: "2024" }, { twoYears: true })).toBe("Alege doi ani diferiți pentru comparație.");
    expect(periodRangeError({ ...EMPTY_RANGE, yearFrom: "2021", yearTo: "2025" })).toBeNull();
    expect(periodRangeError(EMPTY_RANGE)).toBeNull();
    const markup = html(PeriodRange, { value: { ...EMPTY_RANGE, yearFrom: "2025", yearTo: "2023" }, years: ["2023", "2025"], months: false, error: "Perioada trebuie să înceapă înainte să se încheie." });
    expect(tags(markup, "select")).toHaveLength(2);
    const error = /<p class="fk-form-error" id="([^"]+)" role="alert">/.exec(markup);
    expect(error).not.toBeNull();
    expect(tags(markup, "select").every(select => attr(select, "aria-describedby") === error![1])).toBe(true);
  });
  it("draws the year grid as one radiogroup of five columns, an incomplete year hatched and said", () => {
    const years = ["2024", "2025", "2026"].map(year => ({ value: year, label: year, count: "7", ...(year === "2026" ? { partial: "până la 25 sept." } : {}) }));
    const markup = html(YearGrid, { label: "Anul", years: [...years, { value: "range", label: "…", count: "interval", name: "Interval", zero: true }, { value: "2017", label: "2017", disabled: "Înainte de arhivă." }], value: "2025" });
    expect(YEAR_COLUMNS).toBe(5);
    expect(markup).toContain('class="fk-years" role="radiogroup" aria-label="Anul" data-roving=""');
    const radios = tags(markup, "button");
    expect(radios.map(radio => attr(radio, "tabindex"))).toEqual(["-1", "0", "-1", "-1", "-1"]);
    expect(radios.map(radio => attr(radio, "aria-label"))).toEqual(["2024, 7 înregistrări", "2025, 7 înregistrări", "2026, până la 25 sept., 7 înregistrări", "Interval", "2017"]);
    expect(html(YearGrid, { label: "Anul", years: [{ value: "2024", label: "2024", count: "21" }], value: null, noun: ["contract", "contracte"] })).toContain('aria-label="2024, 21 de contracte"');
    expect(attr(radios[2]!, "class")).toBe("fk-year is-partial");
    expect(attr(radios[3]!, "class")).toBe("fk-year is-zero");
    expect(attr(radios[4]!, "aria-disabled")).toBe("true");
    expect(markup).toContain("Înainte de arhivă.");
  });
});

describe("the entity search (13)", () => {
  const results: SearchResult[] = [
    { id: "a", name: "Primăria Vânători", detail: "primăria și consiliul local", side: "Galați", group: "Primăria localității" },
    { id: "b", name: "Primăria Vânători", detail: "primăria și consiliul local", side: "Iași", group: "Primăria localității" },
    { id: "c", name: "Consiliul Județean Iași", side: "Iași", group: "Instituții" },
  ];
  it("is a combobox owning a listbox of options, with the active one as aria-activedescendant", () => {
    const markup = html(EntitySearch, { label: "Instituție sau localitate", defaultQuery: "vân", results, activeIndex: 1 });
    const input = tags(markup, "input")[0]!;
    expect(attr(input, "role")).toBe("combobox");
    expect(attr(input, "aria-expanded")).toBe("true");
    expect(attr(input, "aria-autocomplete")).toBe("list");
    const list = attr(input, "aria-controls")!;
    expect(markup).toContain(`<div class="fk-listbox" role="listbox" id="${list}" aria-label="Instituție sau localitate">`);
    const options = tags(markup, "div").filter(div => attr(div, "role") === "option");
    expect(options).toHaveLength(3);
    expect(options.map(option => attr(option, "aria-selected"))).toEqual(["false", "true", "false"]);
    expect(attr(input, "aria-activedescendant")).toBe(attr(options[1]!, "id"));
    expect(markup).not.toMatch(/role="option"[^>]*tabindex/); // focus stays in the field
    expect(markup).not.toMatch(/<button[^>]*role="option"/);
  });
  it("groups results under their headings, and keeps the county on the right", () => {
    expect(resultGroups(results).map(run => [run.group, run.start, run.items.length])).toEqual([["Primăria localității", 0, 2], ["Instituții", 2, 1]]);
    const markup = html(EntitySearch, { label: "Instituție", defaultQuery: "vân", results });
    const groups = tags(markup, "div").filter(div => attr(div, "role") === "group");
    expect(groups).toHaveLength(2);
    for (const group of groups) expect(markup).toContain(`id="${attr(group, "aria-labelledby")}" role="presentation">`);
    expect(markup).toContain('<span class="fk-res-side">Galați</span>');
  });
  it("says “Caut…”, the count or that nothing was found in a live region", () => {
    const status = (markup: string) => /<p class="([^"]+)" role="status" aria-live="polite">([^<]*)<\/p>/.exec(markup)!;
    const loading = status(html(EntitySearch, { label: "Firmă", defaultQuery: "porr", results: [], loading: true }));
    expect(loading[2]).toBe("Caut…");
    expect(loading[1]).toBe("fk-search-status");
    const found = status(html(EntitySearch, { label: "Firmă", defaultQuery: "vân", results }));
    expect(found[2]).toBe("3 rezultate");
    expect(found[1]).toBe("fk-search-status fk-sr"); // the count is for screen readers
    const none = status(html(EntitySearch, { label: "Firmă", defaultQuery: "xyzw", results: [] }));
    expect(none[2]).toMatch(/^Nicio potrivire/);
    expect(status(html(EntitySearch, { label: "Firmă", defaultQuery: "v", results: [] }))[2]).toBe(""); // under two letters, no search
    const many = status(html(EntitySearch, { label: "Firmă", defaultQuery: "spital", results: Array.from({ length: 24 }, (_, index) => ({ id: `s${index}`, name: `Spital ${index}` })) }));
    expect(many[2]).toBe("24 de rezultate");
  });
  it("collapses the list under the field when it is not in a window", () => {
    const markup = html(EntitySearch, { label: "Unde e o firmă?", defaultQuery: "vân", results, inline: false });
    expect(markup).toContain('class="fk-combo fk-combo--pop"');
    expect(attr(tags(markup, "input")[0]!, "aria-expanded")).toBe("false");
    expect(markup).toMatch(/role="listbox"[^>]*hidden=""/);
    expect(attr(tags(markup, "input")[0]!, "aria-activedescendant")).toBeNull();
  });
});
