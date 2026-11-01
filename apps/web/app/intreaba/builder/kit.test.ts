import { createElement, isValidElement, type ComponentProps, type FunctionComponent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Chip from "./Chip";
import ConditionRow, { rowNoun, selectionTip } from "./ConditionRow";
import CountGroups from "./CountGroups";
import Invitations, { Invite } from "./Invitations";
import ParkedRow, { restoredMessage } from "./ParkedRow";
import Pills, { RangeFields } from "./Pills";
import ScopeLine from "./ScopeLine";
import Segmented from "./Segmented";
import Sentence, { Presentation } from "./Sentence";
import Toggle from "./Toggle";
import UnderChips, { orderUnderChips, type UnderChipItem } from "./UnderChips";
import OptionList from "./pickers/OptionList";
import Popover, { StaticPopover } from "./pickers/Popover";
import type { SentenceToken } from "./kit-types";

// F1a, part 1: the kit's components as markup (kit README §3, §8). The tests
// run without a browser: keyboard moves are in keyboard.test.ts, the live
// behaviour in the Playwright notes of the demo route.
const html = <P extends object>(component: FunctionComponent<P>, props: P) => renderToStaticMarkup(createElement(component, props));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tags = (markup: string, tag: string) => markup.match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? [];
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
/** The elements of a tree returned by a component without hooks, to press their handlers. */
type Pressable = ReactElement<{ role?: string; onClick: () => void; children?: ReactNode }>;
const elements = (node: ReactNode, found: Pressable[] = []): Pressable[] => {
  if (Array.isArray(node)) for (const child of node) elements(child, found);
  else if (isValidElement<{ children?: ReactNode }>(node)) { found.push(node as Pressable); elements(node.props.children, found); }
  return found;
};
const describedReason = (markup: string, control: string) => {
  const id = attr(control, "aria-describedby");
  return id ? text(new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(markup)?.[1] ?? "") : null;
};

const t = (value: string): SentenceToken => ({ kind: "text", text: value });
const s = (id: string, slot: string, value: string): SentenceToken => ({ kind: "slot", id, slot, value });

describe("the sentence (1), the fixed phrase (1b) and the presentation line (P5)", () => {
  const tokens = [t("Ce "), s("subject", "Ce clasăm", "firme"), t(" câștigă achizițiile făcute de primăria "), s("uat", "Primăria", "Cluj-Napoca"), t(", în "), s("period", "Perioada", "2025"), t("?")];
  it("draws each phrase as a button named by its slot that opens a window", () => {
    const markup = html(Sentence, { tokens, openId: "period" });
    const buttons = tags(markup, "button");
    expect(buttons).toHaveLength(3);
    for (const button of buttons) expect(attr(button, "aria-haspopup")).toBe("dialog");
    expect(buttons.map(button => attr(button, "aria-label"))).toEqual(["Ce clasăm: firme", "Primăria: Cluj-Napoca", "Perioada: 2025"]);
    expect(buttons.map(button => attr(button, "aria-expanded"))).toEqual(["false", "false", "true"]);
    expect(markup.startsWith('<h2 class="qb-sentence">')).toBe(true);
  });
  it("has no × and keeps punctuation on the phrase's line", () => {
    const markup = html(Sentence, { tokens, as: "h3" });
    expect(markup).not.toMatch(/×|Scoate|Elimină/);
    expect(markup).toContain('<span class="qb-nowrap"><button');
    expect(markup).toMatch(/Cluj-Napoca<\/span><i class="qb-chev" aria-hidden="true"><\/i><\/button>,<\/span> în /);
    expect(markup).toMatch(/2025<\/span><i class="qb-chev" aria-hidden="true"><\/i><\/button>\?<\/span><\/h3>$/);
    expect(text(markup)).toBe("Ce firme câștigă achizițiile făcute de primăria Cluj-Napoca , în 2025 ?");
  });
  it("draws a fixed phrase as text and keeps the closing words together", () => {
    const markup = html(Sentence, { tokens: [t("Ce "), s("kind", "Ce clasăm", "consilii județene"), t(" "), { kind: "fixed", text: "din toată țara" }, t(" ies din tipar după risc și valoarea achizițiilor directe?")] });
    expect(markup).toContain('<span class="qb-phrase qb-phrase--fixed"><span>din toată țara</span></span>');
    expect(tags(markup, "button")).toHaveLength(1);
    expect(markup).toContain('<span class="qb-nowrap">achizițiilor directe?</span>');
  });
  it("uses the same tokens for the presentation line", () => {
    const markup = html(Presentation, { tokens: [t("Arată "), s("top", "Câte rânduri", "primele 10"), t(", după "), s("by", "Ordinea", "valoarea înregistrată"), t(".")] });
    expect(markup.startsWith('<p class="qb-present">')).toBe(true);
    expect(text(markup)).toBe("Arată primele 10 , după valoarea înregistrată .");
  });
});

describe("the invitations (2)", () => {
  it("names the unset fragments and shows at most four", () => {
    const items = ["Ce s-a cumpărat", "Cine a cumpărat", "De la cine", "Ce fel de achiziții", "Sediul firmei"].map((label, index) => ({ id: `i${index}`, label }));
    const markup = html(Invitations, { items, openId: "i1" });
    const buttons = tags(markup, "button");
    expect(buttons).toHaveLength(4);
    expect(text(markup)).toBe("+ Ce s-a cumpărat + Cine a cumpărat + De la cine + Ce fel de achiziții");
    expect(buttons.map(button => attr(button, "aria-expanded"))).toEqual(["false", "true", "false", "false"]);
    expect(html(Invitations, { items: [] })).toBe("");
  });
  it("keeps a disabled invitation readable, with its reason and a (?)", () => {
    const markup = html(Invite, { id: "from", label: "De la cine", availability: { state: "disabled", reason: "Cu o firmă în centru, firma e deja aleasă.", tip: { title: "De la cine", text: "Cu o firmă în centru, firma e deja aleasă." } } });
    const invite = tags(markup, "button")[0]!;
    expect(attr(invite, "aria-disabled")).toBe("true");
    expect(invite).not.toMatch(/\sdisabled[=\s>]/);
    expect(describedReason(markup, invite)).toBe("Cu o firmă în centru, firma e deja aleasă.");
    expect(markup).toContain("De la cine: ce înseamnă");
  });
});

describe("the profile line (18)", () => {
  it("says the same words on every profile, with the (?) on the last words' line", () => {
    const markup = html(ScopeLine, {});
    expect(text(markup)).toMatch(/^Profil istoric · achiziții directe, toată arhiva \? Profil istoric\. Toată arhiva de achiziții directe acceptate, de cel mult 2 mil\. lei fiecare/);
    expect(markup).toContain('<span class="qb-nowrap">toată arhiva <span class="term term-tip');
    expect(tags(markup, "button")).toHaveLength(1); // the (?) only: the line itself is not pressable
    expect(markup).not.toMatch(/neacceptate|toate sursele/);
  });
});

describe("the condition row (3), the chip (4) and the switch (5)", () => {
  it("labels a group row without a (?) and a selection row with one about the total", () => {
    const group = html(ConditionRow, { label: "Câștigătorii", kind: "group", children: null });
    expect(group).toContain('class="qb-row qb-tipwrap" role="group" aria-label="Câștigătorii"');
    expect(group).not.toContain("term-tip");
    const selection = html(ConditionRow, { label: "Furnizorii", kind: "selection", children: null });
    expect(selection).toContain('class="qb-row qb-row--select qb-tipwrap" role="group" aria-label="Furnizorii"');
    expect(text(selection)).toContain("Totalul se schimbă");
  });
  it("says the selection row's own noun in its default (?), as the kit does", () => {
    expect(selectionTip("Furnizorii")).toEqual({ title: "Furnizorii", text: "Alege ce furnizori intră în calcul. Totalul se schimbă, iar linia de sub răspuns spune cum." });
    expect(text(html(ConditionRow, { label: "Clienții", kind: "selection", children: null }))).toContain("Alege ce clienți intră în calcul.");
    expect(["Partenerii", "Câștigătorii", "Firmele", "Instituțiile"].map(rowNoun)).toEqual(["parteneri", "câștigători", "firme", "instituții"]);
  });
  it("lets a chip or switch with a (?) anchor its own tip on phones, outside the chip's clip", () => {
    const disabled = html(Chip, { id: "emp", label: "Angajați", availability: { state: "disabled", reason: "Motiv.", tip: { title: "Angajați", text: "Motiv." } } });
    expect(disabled).toMatch(/^<span class="qb-pair qb-tipwrap-sm"><span class="qb-chip is-dim">/);
    const legacy = html(UnderChips, { items: [{ kind: "legacy", id: "min", words: "doar firmele cu cel puțin 5 înregistrări", tip: { title: "Din link", text: "Text." } }] });
    expect(legacy).toContain('<span class="qb-tipwrap-sm"><span class="qb-chip qb-chip--legacy">');
  });
  it("draws an unset chip as “+ X ▾” without ×, an active one as “✓ value · count ▾ ×”", () => {
    const unset = html(Chip, { id: "emp", label: "Angajați" });
    expect(text(unset)).toBe("+ Angajați");
    expect(tags(unset, "button")).toHaveLength(1);
    const active = html(Chip, { id: "emp", label: "1–49 angajați", name: "Angajați", active: true, count: "192", open: true, onRemove: () => undefined });
    expect(active).toContain('class="qb-chip is-active"');
    expect(active).toContain('<i class="qb-ck" aria-hidden="true"></i>');
    const [main, x] = tags(active, "button");
    expect(attr(main!, "aria-haspopup")).toBe("dialog");
    expect(attr(main!, "aria-expanded")).toBe("true");
    expect(attr(x!, "aria-label")).toBe("Scoate «Angajați»");
    expect(text(active)).toBe("1–49 angajați 192 ×");
  });
  it("dims a chip that cannot apply, with the reason read on the chip", () => {
    const reason = "Nu se poate cu „cu sediul în străinătate”: firmele străine nu au bilanț.";
    const markup = html(Chip, { id: "emp", label: "Angajați", availability: { state: "disabled", reason } });
    expect(markup).toContain('class="qb-chip is-dim"');
    const main = tags(markup, "button")[0]!;
    expect(attr(main, "aria-disabled")).toBe("true");
    expect(attr(main, "aria-expanded")).toBeNull();
    expect(describedReason(markup, main)).toBe(reason);
  });
  it("presses a switch instead of removing it, and keeps it at 0 with the reason", () => {
    const off = html(Toggle, { id: "main", label: "Clientul lor principal", count: "21 · 7,3%", pressed: false });
    expect(attr(tags(off, "button")[0]!, "aria-pressed")).toBe("false");
    expect(text(off)).toBe("+ Clientul lor principal 21 · 7,3%");
    const on = html(Toggle, { id: "main", label: "Clientul lor principal", pressed: true });
    expect(attr(tags(on, "button")[0]!, "aria-pressed")).toBe("true");
    expect(on).toContain("qb-ck");
    expect(on).not.toContain("×");
    const zero = html(Toggle, { id: "z", label: "Cu semnale", count: "0", pressed: false, availability: { state: "disabled", reason: "Niciun furnizor cu semnale." } });
    expect(describedReason(zero, tags(zero, "button")[0]!)).toBe("Niciun furnizor cu semnale.");
    const months = html(Toggle, { id: "m", label: "Aceleași luni: ian.–mai", pressed: true, glyph: "half", auto: true });
    expect(months).toContain('class="qb-toggle is-auto"');
    expect(months).toContain("qb-half");
    expect(months).not.toContain("qb-ck");
  });
  it("says what a switch means in a (?) beside it, on and off, and with its reason at 0 (S5 review)", () => {
    const tip = { title: "Principalul lor client public", text: "Cel puțin jumătate din tot ce a câștigat firma." };
    const off = html(Toggle, { id: "main", label: "Principalul lor client public", pressed: false, tip });
    expect(attr(tags(off, "button")[0]!, "aria-pressed")).toBe("false");
    expect(off).toContain("qb-tipwrap-sm");
    expect(off).toContain("Cel puțin jumătate");
    const zero = html(Toggle, { id: "main", label: "Principalul lor client public", pressed: false, tip, availability: { state: "disabled", reason: "Nicio firmă în selecția de acum." } });
    expect(describedReason(zero, tags(zero, "button")[0]!)).toBe("Nicio firmă în selecția de acum.");
    expect(zero).toContain("Cel puțin jumătate");
  });
});

describe("the chips under the sentence (6)", () => {
  const tip = { title: "Din link", text: "Condiție dintr-un link mai vechi; se aplică la fel." };
  const items: UnderChipItem[] = [
    { kind: "origin", id: "rel", prefix: "Selecția relației", words: "2 firme", tip },
    { kind: "legacy", id: "min", words: "doar firmele cu cel puțin 5 înregistrări", tip },
    { kind: "auto", id: "months", label: "Aceleași luni: ian.–mai", name: "Aceleași luni" },
    { kind: "exclude", id: "b", label: "Fără SYSTRA" },
    { kind: "only", id: "size", label: "Doar cele de peste 1 mil. lei", name: "Mărimea achiziției" },
    { kind: "exclude", id: "a", label: "Fără PORR" },
  ];
  it("keeps the kit's order: only, exclusions, automatic, from a link, from another page", () => {
    expect(orderUnderChips(items).map(item => item.id)).toEqual(["size", "b", "a", "months", "min", "rel"]);
    const markup = html(UnderChips, { items, onRemove: () => undefined });
    expect([...markup.matchAll(/qb-chip qb-chip--(\w+)/g)].map(match => match[1])).toEqual(["only", "exclude", "exclude", "auto", "legacy", "origin"]);
  });
  it("lets a link's or another page's condition only be removed, with a (?)", () => {
    const markup = html(UnderChips, { items: [items[1]!, items[0]!], onRemove: () => undefined });
    expect(text(markup)).toContain("Din link: doar firmele cu cel puțin 5 înregistrări");
    expect(text(markup)).toContain("Selecția relației: 2 firme");
    expect(markup).not.toContain('aria-haspopup="dialog"');
    expect(tags(markup, "button").filter(button => attr(button, "class") === "qb-chip-x").map(button => attr(button, "aria-label"))).toEqual(["Scoate «Din link: doar firmele cu cel puțin 5 înregistrări»", "Scoate «Selecția relației»"]);
    expect(markup.match(/term-tip/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it("opens collapsed exclusions and restrictions, never a single exclusion", () => {
    const markup = html(UnderChips, { items: [items[3]!, { kind: "exclude", id: "three", label: "Fără 3 firme", name: "cele 3 excluderi", collapsed: true }, items[4]!], onRemove: () => undefined });
    expect(markup).toContain('<span class="qb-chip-main">Fără SYSTRA</span>');
    expect(tags(markup, "button").filter(button => attr(button, "aria-haspopup") === "dialog")).toHaveLength(2);
    expect(markup).toContain('aria-label="Scoate «cele 3 excluderi»"');
  });
  it("brings a parked condition back from a button, announced, and never as an error", () => {
    const markup = html(ParkedRow, { label: "Nu se aplică riscului", items: [{ id: "y", label: "2025" }, { id: "c", label: "„medicamente”" }] });
    expect(tags(markup, "button").filter(button => attr(button, "class") === "qb-chip--parked").map(button => attr(button, "aria-label"))).toEqual(["Readu «2025»", "Readu «„medicamente”»"]);
    expect(markup).toContain('role="status" aria-live="polite"');
    expect(markup).not.toMatch(/<s>|line-through|eroare/i);
    expect(html(ParkedRow, { label: "Nu se aplică riscului", items: [] })).toBe('<span class="qb-sr" role="status" aria-live="polite"></span>');
    expect(restoredMessage("2025")).toBe("«2025» se aplică din nou.");
  });
});

describe("the choices: segmented (7), count groups (8), pills (11)", () => {
  const roving = (markup: string, role: string) => tags(markup, "button").filter(button => attr(button, "role") === role);
  it("gives a segmented control one Tab stop, on the chosen option, and keeps 0 visible, disabled", () => {
    const markup = html(Segmented, { label: "Ce fel de achiziții", value: "da", options: [{ value: "all", label: "Toate" }, { value: "da", label: "Directe", count: "100%" }, { value: "proc", label: "Proceduri", count: "—", disabled: "Nicio înregistrare din proceduri." }] });
    expect(markup).toContain('role="radiogroup" aria-label="Ce fel de achiziții"');
    const radios = roving(markup, "radio");
    expect(radios.map(radio => attr(radio, "tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(radios.map(radio => attr(radio, "aria-checked"))).toEqual(["false", "true", "false"]);
    expect(attr(radios[2]!, "aria-disabled")).toBe("true");
    expect(describedReason(markup, radios[2]!)).toBe("Nicio înregistrare din proceduri.");
  });
  it("puts the Tab stop on the first enabled option when nothing is chosen", () => {
    const markup = html(Segmented, { label: "Tipul achiziției", value: null, options: [{ value: "p", label: "Produse", disabled: true }, { value: "s", label: "Servicii" }] });
    expect(roving(markup, "radio").map(radio => attr(radio, "tabindex"))).toEqual(["-1", "0"]);
  });
  it("draws the tabs of “De la cine?” with the same look, as a tablist", () => {
    const markup = html(Segmented, { label: "De la cine", mode: "tabs", value: "admin", options: [{ value: "firm", label: "O firmă", controls: "p1" }, { value: "admin", label: "Administrator", controls: "p2" }] });
    expect(markup).toContain('role="tablist"');
    const tabs = roving(markup, "tab");
    expect(tabs.map(tab => attr(tab, "aria-selected"))).toEqual(["false", "true"]);
    expect(tabs.map(tab => attr(tab, "aria-controls"))).toEqual(["p1", "p2"]);
    expect(markup).not.toContain("aria-checked");
  });
  it("names each count group with its count and sum, keeps empty ones disabled, and “Toate” wide", () => {
    const markup = html(CountGroups, { label: "Felul schimbării", value: "up", head: { text: "Firme în 2024 sau 2025:", total: "96.929" }, groups: [
      { value: "all", name: "Toate", count: "96.929 · după diferență", swatch: "all", all: true },
      { value: "up", name: "Creșteri", count: "28.670 · +45,3 mld", swatch: "up" },
      { value: "new", name: "Noi", count: "0", swatch: "new", disabled: "Nicio firmă nouă." },
    ] });
    expect(text(markup)).toContain("Firme în 2024 sau 2025: 96.929");
    const radios = roving(markup, "radio");
    expect(radios.map(radio => attr(radio, "tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(attr(radios[0]!, "class")).toBe("qb-group qb-group--all");
    expect(attr(radios[2]!, "aria-disabled")).toBe("true");
    expect(text(markup)).toContain("Creșteri 28.670 · +45,3 mld");
    expect(markup).toMatch(/<i class="qb-sw qb-sw--up" aria-hidden="true">/);
  });
  it("draws signal pills with the dot as decoration and the count in the name", () => {
    const markup = html(Pills, { label: "Semnal", value: "split", options: [{ value: "all", label: "Tot grupul", count: "82" }, { value: "split", label: "Posibilă fracționare", count: "46", signal: true }, { value: "2026", label: "2026", disabled: "După sfârșitul perioadei." }] });
    expect(markup).toContain('role="radiogroup" aria-label="Semnal"');
    expect(markup).toContain('<i class="qb-dot qb-dot--signal" aria-hidden="true"></i>Posibilă fracționare<span class="qb-n">46</span>');
    const radios = roving(markup, "radio");
    expect(radios.map(radio => attr(radio, "tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(describedReason(markup, radios[2]!)).toBe("După sfârșitul perioadei.");
  });
  it("labels the free interval's fields and asks for digits", () => {
    const markup = html(RangeFields, { from: "250.000", to: "" });
    expect(text(markup)).toBe("Între și");
    expect(tags(markup, "input").every(input => attr(input, "inputMode") === "numeric" && attr(input, "placeholder") === "lei")).toBe(true);
    expect(tags(markup, "label")).toHaveLength(2);
  });
});

describe("the window (9): popover, sheet and option list", () => {
  const seat = [
    { value: "any", label: "Oriunde", count: "282" },
    { value: "same", label: "În județul Buzău", detail: "județul instituției", share: .32, count: "32,0% · 88" },
    { value: "abroad", label: "În străinătate", count: "3,8% · 3", disabled: "doar pe valoare" },
  ];
  it("is a radiogroup with one Tab stop on the chosen option, the share bar and a rest row that takes no focus", () => {
    const markup = html(OptionList, { label: "Sediul firmei", options: seat, value: "same", rest: [{ label: "Sediu necunoscut", count: "0,3% · 19" }] });
    const radios = tags(markup, "button");
    expect(radios.map(radio => attr(radio, "role"))).toEqual(["radio", "radio", "radio"]);
    expect(radios.map(radio => attr(radio, "tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(markup).toContain('style="--w:32%"');
    expect(markup).toMatch(/<div class="qb-opt qb-opt--rest">[^]*Sediu necunoscut[^]*0,3% · 19/);
    expect(attr(radios[2]!, "aria-disabled")).toBe("true");
    expect(text(markup)).toContain("În străinătate doar pe valoare 3,8% · 3"); // the reason is read with the option
  });
  it("is a group of checkboxes, each its own Tab stop, with what a choice replaces", () => {
    const markup = html(OptionList, { label: "Grupul de comparație", multiple: true, values: ["pop"], options: [{ value: "pop", label: "Populație apropiată" }, { value: "county", label: "Județul Buzău", swap: "în locul populației apropiate", count: "→ 336" }] });
    expect(markup).toContain('class="qb-opts qb-opts--check" role="group"');
    const boxes = tags(markup, "button");
    expect(boxes.map(box => attr(box, "role"))).toEqual(["checkbox", "checkbox"]);
    expect(boxes.map(box => attr(box, "aria-checked"))).toEqual(["true", "false"]);
    expect(boxes.every(box => attr(box, "tabindex") === null)).toBe(true);
    expect(text(markup)).toContain("în locul populației apropiate → 336");
  });
  it("writes each group heading once and ends with the link row", () => {
    const markup = html(OptionList, { label: "Ce clasăm", value: "firme", options: [{ value: "firme", label: "Firme", group: "Firme" }, { value: "inst", label: "Instituții publice", group: "Instituții" }, { value: "spitale", label: "Spitale", group: "Instituții" }], link: { label: "Firme cu sediul în…", onClick: () => undefined } });
    expect(markup.match(/class="qb-opt-group"/g)).toHaveLength(2);
    expect(markup).toMatch(/<button type="button" class="qb-opt--link">Firme cu sediul în…<span aria-hidden="true">›<\/span><\/button>$/);
  });
  it("names the window by its title, keeps the (?) out of that name and closes from ×", () => {
    const markup = html(StaticPopover, { title: "Unde au sediul firmele?", tip: { title: "Sediul firmei", text: "Sediul social de azi." }, children: null });
    const dialog = tags(markup, "div")[0]!;
    expect(attr(dialog, "role")).toBe("dialog");
    const id = attr(dialog, "aria-labelledby");
    expect(markup).toContain(`<h3 id="${id}">Unde au sediul firmele?</h3>`);
    expect(markup).toContain('<button type="button" class="qb-close" aria-label="Închide">×</button>');
    expect(markup).toContain('<span class="qb-sheet-grip" aria-hidden="true"></span>');
  });
  it("is a <dialog> labelled by its title, with its content only while open", () => {
    const props = { anchor: null, onClose: () => undefined, title: "În ce perioadă?", children: createElement("p", null, "conținut") } satisfies Omit<ComponentProps<typeof Popover>, "open">;
    const open = html(Popover, { ...props, open: true });
    // Not a .qb-tipwrap: a (?) in a window anchors inside it (its head or its row) and opens downward (filters-kit.css).
    expect(open).toMatch(/^<dialog class="qb qb-pop" aria-labelledby="([^"]+)"><span class="qb-sheet-grip"/);
    expect(open).toContain("<p>conținut</p>");
    expect(open).not.toMatch(/<dialog[^>]*\sopen/); // shown by show()/showModal(), never by the attribute
    expect(html(Popover, { ...props, open: false })).toMatch(/^<dialog class="qb qb-pop" aria-labelledby="[^"]+"><\/dialog>$/);
  });
  it("reports “activate” for the option already chosen too, so a window can close on it", () => {
    const changes: [string, string][] = [];
    const tree = OptionList({ label: "Sediul firmei", options: seat, value: "same", onChange: (value, source) => changes.push([value, source]) });
    const radios = elements(tree).filter(element => element.props.role === "radio");
    radios[1]!.props.onClick(); // the chosen one: Enter, Space or a click after the arrows chose it
    radios[0]!.props.onClick();
    radios[2]!.props.onClick(); // disabled: nothing
    expect(changes).toEqual([["same", "activate"], ["any", "activate"]]);
  });
});
