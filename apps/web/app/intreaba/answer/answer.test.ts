import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AnswerRow, { AnswerList } from "./AnswerRow";
import AnswerStrip, { Crumbs, StripEnd, StripLabelled, StripRow, Suggest } from "./AnswerStrip";
import DetailCard, { shouldReturnFocus } from "./DetailCard";
import EmptyState, { MAX_RELAX, removeWords } from "./EmptyState";
import { recordsWords } from "./KitLink";
import ListFoot, { focusFirstNew, listFootWords } from "./ListFoot";
import Locate, { placeWords } from "./Locate";
import RowFacts, { MAX_FACTS } from "./RowFacts";
import RowMenu, { type RowAction } from "./RowMenu";
import TotalLine from "./TotalLine";

// F1a, part 2 (answer side): the strip (14), the answer row and its menu (15),
// the empty state (17), the card (19), "Unde e …?" (20), the total line and
// the longer list (21), as markup. The menu's and the combobox's keys are pure
// functions in builder/keyboard.test.ts; focus moves are checked in Playwright.
const html = <P extends object>(component: FunctionComponent<P>, props: P) => renderToStaticMarkup(createElement(component, props));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tags = (markup: string, tag: string) => markup.match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? [];
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

const actions: RowAction[] = [
  { id: "rec", label: "Vezi înregistrările", glyph: "→", onSelect: () => undefined },
  { id: "out", label: "Scoate din calcul", glyph: "−", disabled: "Cel mult 5 excluderi." },
  { id: "page", label: "Fișa firmei", glyph: "↗", href: "/entitati/1" },
];

describe("the strip beside the answer (14)", () => {
  it("is a named group, with the display choice at its end", () => {
    const markup = html(AnswerStrip, { children: [createElement(Suggest, { key: "s", text: "99,9% e Construcții" }), createElement(StripEnd, { key: "e", children: "Vizual | Tabel" })] });
    // The anchor of the strip's (?): without it a tip ("Ponderile", "Doar clienții comuni") opened at the page's top (S4 tests).
    expect(markup.startsWith('<div class="qb-strip qb-tipwrap" role="group" aria-label="Ajustează răspunsul">')).toBe(true);
    expect(markup).not.toContain('role="toolbar"'); // each control keeps its own keys
    expect(markup).toMatch(/<span class="qb-strip-end">Vizual \| Tabel<\/span><\/div>$/);
    expect(text(markup)).toContain("99,9% e Construcții · Detaliază ›");
  });
  it("puts each control on a labelled line in the rows variant, with its (?)", () => {
    const markup = html(AnswerStrip, { rows: true, children: createElement(StripRow, { label: "Primele după", tip: { title: "Primele după", text: "Semnale, apoi valoarea." }, children: "control" }) });
    expect(markup).toContain('class="qb-strip qb-strip--rows qb-tipwrap"');
    expect(markup).toMatch(/<div class="qb-strip-row"><span class="qb-strip-label">Primele după<span class="term term-tip/);
  });
  it("keeps a squeezing label for screen readers only on phones", () => {
    expect(html(StripLabelled, { before: "Împarte", smHide: true, children: "x" })).toContain('<span class="qb-strip-label qb-strip-label--sm-hide">Împarte</span>');
    expect(text(html(StripLabelled, { before: "Arată", after: "firme", children: "6 10 15" }))).toBe("Arată 6 10 15 firme");
  });
  it("draws the thread with the current step as text", () => {
    const markup = html(Crumbs, { label: "Domenii", items: [{ label: "toate", onClick: () => undefined }], current: "Construcții" });
    expect(markup).toContain('<nav class="qb-crumbs" aria-label="Domenii">');
    expect(markup).toContain('<button type="button">toate</button>');
    expect(markup).toContain('<b aria-current="location">Construcții</b>');
  });
});

describe("the answer row (15) and its facts (P8)", () => {
  it("shows at most three facts, by tone, colour never alone", () => {
    const markup = html(RowFacts, { facts: [{ text: "posibilă fracționare", tone: "signal" }, { text: "1 contract: 58%", tone: "caveat" }, { text: "client principal", tone: "accent" }, { text: "în asociere" }] });
    expect(MAX_FACTS).toBe(3);
    expect(tags(markup, "span").map(span => attr(span, "class"))).toEqual(["qb-tag qb-tag--signal", "qb-tag qb-tag--caveat", "qb-tag qb-tag--accent"]);
    expect(html(RowFacts, { facts: [] })).toBe("");
  });
  it("is a list item that code can focus, with the value, share and records", () => {
    const markup = html(AnswerList, { label: "Firmele", children: createElement(AnswerRow, { name: "SYSTRA", place: "din străinătate", value: "100.011.056 lei", share: "6,5%", records: { label: recordsWords(1), onClick: () => undefined }, actions }) });
    expect(markup).toContain('<div class="qb-alist" role="list" aria-label="Firmele"><div class="qb-arow" role="listitem" tabindex="-1" data-qb-arow="">');
    expect(text(markup)).toContain("SYSTRA din străinătate");
    expect(text(markup)).toContain("100.011.056 lei 6,5% · 1 înregistrare →");
    expect(markup).toMatch(/<button type="button" class="qb-rec">1 înregistrare<span class="qb-glyph" aria-hidden="true">→<\/span><\/button>/);
  });
  it("writes records with “de” from 20", () => {
    expect([1, 14, 58, 124, 101].map(recordsWords)).toEqual(["1 înregistrare", "14 înregistrări", "58 de înregistrări", "124 de înregistrări", "101 înregistrări"]);
  });
});

describe("the row menu (P7, menu button)", () => {
  it("is a button that names its entity and says it opens a menu", () => {
    const markup = html(RowMenu, { name: "SYSTRA", actions });
    const button = tags(markup, "button")[0]!;
    expect(attr(button, "aria-haspopup")).toBe("menu");
    expect(attr(button, "aria-expanded")).toBe("false");
    expect(attr(button, "aria-label")).toBe("Mai multe pentru SYSTRA");
    expect(markup).not.toContain('role="menu"'); // closed: no menu in the page
  });
  it("opens a menu of items by R8, the disabled one with its reason, links for pages", () => {
    const markup = html(RowMenu, { name: "SYSTRA", actions, defaultOpen: true });
    const button = tags(markup, "button")[0]!;
    expect(attr(button, "aria-expanded")).toBe("true");
    const menu = tags(markup, "div").find(div => attr(div, "role") === "menu")!;
    expect(attr(menu, "id")).toBe(attr(button, "aria-controls"));
    expect(attr(menu, "aria-label")).toBe("SYSTRA");
    const items = markup.match(/<(button|a)\b[^>]*role="menuitem"[^>]*>/g)!;
    expect(items).toHaveLength(3);
    expect(items.every(item => attr(item, "tabindex") === "-1")).toBe(true);
    expect(attr(items[1]!, "aria-disabled")).toBe("true");
    expect(items[2]).toMatch(/^<a\b[^>]*href="\/entitati\/1"/);
    expect(text(markup)).toContain("Scoate din calcul Cel mult 5 excluderi. −");
    expect(text(markup)).not.toMatch(/Ascunde/); // kit §5.13: “Scoate din calcul”
  });
});

describe("the total line and the longer list (21)", () => {
  it("says its words in a polite live region read whole, with the conditions and the caveat on amounts", () => {
    const markup = html(TotalLine, { conditions: ["fără SYSTRA", "doar firmele cu sediul în alt județ"], children: "Din 1.550.554.366 lei, câștigați de 412 firme" });
    expect(markup.startsWith('<p class="qb-total qb-tipwrap"><span aria-live="polite" aria-atomic="true">')).toBe(true);
    const live = /<span aria-live="polite" aria-atomic="true">(.*?)<\/span><span class="qb-nowrap">/.exec(markup)?.[1] ?? "";
    expect(text(live).replace(/ /g, " ")).toBe("Din 1.550.554.366 lei, câștigați de 412 firme · fără SYSTRA · doar firmele cu sediul în alt județ · valoare înregistrată, nu plăți");
    expect(text(html(TotalLine, { note: false, children: "Din 10 lei" }))).toBe("Din 10 lei");
  });
  it("keeps the (?) out of the live region, on the line of the last two words", () => {
    const markup = html(TotalLine, { children: "Din 10 lei" });
    const live = /<span aria-live="polite" aria-atomic="true">(.*?)<\/span><span class="qb-nowrap">/.exec(markup)?.[1] ?? "";
    expect(live).toMatch(/<span class="qb-sr">nu plăți<\/span>$/); // the caveat is announced, the definition is not
    expect(live).not.toContain("term-");
    // On screen: the two words and the (?) in one unbreakable span, the words hidden from the reader (said above).
    expect(markup).toMatch(/<span class="qb-nowrap"><span aria-hidden="true">nu plăți<\/span> <span class="term term-tip[^"]*"><button[^>]*aria-label="Valoare înregistrată, nu plată: ce înseamnă"/);
    expect(html(TotalLine, { note: { text: "valoare înregistrată, nu plăți" }, children: "Din 10 lei" })).not.toContain("qb-sr"); // no (?), no copy
    // a line breaks before a "·", never between it and its condition
    expect(html(TotalLine, { note: false, conditions: ["fără SYSTRA"], children: "Din 10 lei" })).toContain('Din 10 lei <span class="qb-total-sep" aria-hidden="true">·</span> <span class="qb-total-cond">fără SYSTRA</span>');
  });
  it("pages by ten, shows all up to the caller's limit, and folds the rest in words", () => {
    expect(listFootWords({ shown: 20, total: 412, noun: ["firmă", "firme", "f"] })).toEqual({ more: "Arată încă 10", rest: "alte 392 de firme" });
    expect(listFootWords({ shown: 10, total: 14, noun: ["firmă", "firme", "f"] })).toEqual({ more: "Arată încă 4", rest: "alte 4 firme" });
    expect(listFootWords({ shown: 5, total: 14, noun: ["firmă", "firme", "f"], all: true })).toEqual({ more: "Arată toate cele 14", rest: "alte 9 firme" });
    expect(listFootWords({ shown: 14, total: 14, noun: ["firmă", "firme", "f"] })).toEqual({ more: null, rest: null });
  });
  it("agrees “alte” / “alți” and a single rest with the noun's gender", () => {
    expect(listFootWords({ shown: 15, total: 282, noun: ["partener", "parteneri", "m"], step: 15, restDetail: "25% din valoare" })).toEqual({ more: "Arată încă 15", rest: "alți 267 de parteneri · 25% din valoare" });
    expect(listFootWords({ shown: 10, total: 22, noun: ["furnizor", "furnizori", "m"] }).rest).toBe("alți 12 furnizori");
    expect(listFootWords({ shown: 10, total: 40, noun: ["domeniu", "domenii", "n"] }).rest).toBe("alte 30 de domenii");
    expect(listFootWords({ shown: 13, total: 14, noun: ["domeniu", "domenii", "n"] })).toEqual({ more: "Arată încă 1", rest: "un alt domeniu" });
    expect(listFootWords({ shown: 13, total: 14, noun: ["partener", "parteneri", "m"] }).rest).toBe("un alt partener");
    expect(listFootWords({ shown: 13, total: 14, noun: ["firmă", "firme", "f"] }).rest).toBe("o altă firmă");
  });
  it("draws the button, the folded rest as text, and the records at the end", () => {
    const markup = html(ListFoot, { shown: 20, total: 412, noun: ["firmă", "firme", "f"], records: { label: `Vezi cele ${recordsWords(124)}` } });
    expect(text(markup)).toBe("Arată încă 10 alte 392 de firme Vezi cele 124 de înregistrări →");
    expect(markup).toContain('<span class="qb-rest">alte 392 de firme</span>');
    expect(tags(markup, "button")).toHaveLength(2);
    expect(html(ListFoot, { shown: 4, total: 4, noun: ["firmă", "firme", "f"] })).toBe("");
  });
  it("moves focus to the first new row", () => {
    const rows = Array.from({ length: 20 }, () => ({ focus: vi.fn() }));
    focusFirstNew({ querySelectorAll: () => rows } as unknown as HTMLElement, 10);
    expect(rows[10]!.focus).toHaveBeenCalledOnce();
    expect(rows.filter(row => row.focus.mock.calls.length).length).toBe(1);
    expect(() => focusFirstNew(null, 10)).not.toThrow();
  });
});

describe("the empty state (17)", () => {
  it("says what is missing and offers at most three relaxations, never “Fără …”", () => {
    const relax = ["Toți anii", "Oriunde", removeWords("Furnizori noi"), "Orice firmă"].map((label, index) => ({ id: `r${index}`, label }));
    const markup = html(EmptyState, { message: "Niciun furnizor nou din 2025 cu sediul în străinătate.", relax });
    expect(MAX_RELAX).toBe(3);
    expect(tags(markup, "button")).toHaveLength(3);
    expect(text(markup)).toBe("Niciun furnizor nou din 2025 cu sediul în străinătate. Toți anii Oriunde Scoate „Furnizori noi”");
    expect(markup).toContain('class="qb-relax" role="group" aria-label="Lărgește întrebarea"');
    expect(text(markup)).not.toMatch(/Fără|Toată perioada|Toate firmele/);
  });
});

describe("the card (19)", () => {
  const props = { title: "Comuna Sageata", meta: "Primărie de comună · locul 20 din 82, după semnale", facts: [{ label: "Achiziții directe", value: "21,0 mil. lei" }], lines: [{ tag: { text: "posibilă fracționare", tone: "signal" as const }, text: "2018–2019", records: { label: recordsWords(9) } }], actions: [{ label: "Vezi cele 9 cu semnalul", glyph: "→" as const }, { label: "Unde se situează?", glyph: "›" as const }, { label: "Fișa instituției", glyph: "↗" as const, href: "/entitati/2" }], onClose: () => undefined };
  it("is a region named by its title, whose heading takes focus, closed from ×", () => {
    const markup = html(DetailCard, props);
    expect(markup.startsWith('<section class="qb-card" aria-label="Comuna Sageata">')).toBe(true); // a named section is a region
    expect(markup).toContain('<h4 tabindex="-1">Comuna Sageata</h4>');
    expect(markup).toContain('<button type="button" class="qb-close" aria-label="Închide fișa">×</button>');
    expect(text(markup)).toContain("posibilă fracționare 2018–2019 9 înregistrări →");
    expect(markup).toMatch(/<a class="qb-secondary" href="\/entitati\/2">Fișa instituției<span class="qb-glyph" aria-hidden="true">↗<\/span><\/a>/);
    expect(markup).not.toMatch(/background:|qb-card--fill/); // a mint surface from CSS, never an inline or solid fill
  });
  it("returns focus only when it was inside the card or nowhere", () => {
    const body = {} as Element, inside = {} as Element, elsewhere = {} as Element;
    const card = { contains: (node: Element) => node === inside } as unknown as Element;
    expect(shouldReturnFocus(body, card, body)).toBe(true);
    expect(shouldReturnFocus(null, card, body)).toBe(true);
    expect(shouldReturnFocus(inside, card, body)).toBe(true);
    expect(shouldReturnFocus(elsewhere, card, body)).toBe(false);
  });
});

describe("“Unde e …?” (20)", () => {
  it("says the place in words, not “#1 din 46”", () => {
    expect(placeWords(20, 82, "semnale")).toBe("locul 20 din 82, după semnale");
    expect(placeWords(37, 1413)).toBe("locul 37 din 1.413");
  });
  it("is the combobox with its list under the field, and the place in a status region", () => {
    const markup = html(Locate, { label: "Unde e o instituție?", defaultQuery: "sageata", results: [{ id: "s", name: "Comuna Sageata" }], found: { name: "Comuna Sageata", place: placeWords(20, 82, "semnale") } });
    expect(markup.startsWith('<div class="qb-find"><div class="qb-combo qb-combo--pop">')).toBe(true);
    const input = tags(markup, "input")[0]!;
    expect(attr(input, "role")).toBe("combobox");
    expect(attr(input, "placeholder")).toBe("Unde e o instituție?");
    expect(markup).toContain('<span class="qb-find-res" role="status"><b>Comuna Sageata</b> locul 20 din 82, după semnale</span>');
    expect(markup).not.toMatch(/Caută în grup|#\d/);
  });
});
