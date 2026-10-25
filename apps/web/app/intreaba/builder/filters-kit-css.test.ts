import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Plan §2.1 R7 and kit §8–§9: the kit takes its colours from tokens defined for
// both themes, draws no fixed colour in a component rule, gives 44 px targets
// under 600 px, and does not collide with today's builder (.qb-*).
const css = readFileSync(new URL("./filters-kit.css", import.meta.url), "utf8");
const block = (opening: string) => {
  const start = css.indexOf(opening);
  expect(start, opening).toBeGreaterThanOrEqual(0);
  return css.slice(start + opening.length, css.indexOf("}", start));
};
const light = block(":root {"), darkByPreference = block(':root:not([data-theme="light"]) {'), darkByChoice = block(':root[data-theme="dark"] {');
const names = (tokens: string) => [...tokens.matchAll(/(--fk-[a-z-]+):/g)].map(match => match[1]);
const sources = (dir: URL, kinds = /\.(tsx?|css)$/): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? sources(new URL(`${entry.name}/`, dir), kinds) : kinds.test(entry.name) && !entry.name.endsWith(".test.ts") ? [readFileSync(new URL(entry.name, dir), "utf8")] : []);
const uncommented = css.replace(/\/\*[^]*?\*\//g, "");

describe("filter kit styles", () => {
  it("defines every builder token for the light theme and for both ways to the dark one", () => {
    const themed = names(light).filter(name => name !== "--fk-proc" && name !== "--fk-da");
    expect(themed.length).toBeGreaterThan(20);
    expect(names(darkByPreference)).toEqual(themed);
    expect(names(darkByChoice)).toEqual(themed);
    expect(light).toContain("--fk-proc:var(--map-4); --fk-da:var(--map-2);"); // the channels: the site's map pair, never blue
  });

  it("has no fixed colour outside the token blocks", () => {
    let rules = css;
    for (const tokens of [light, darkByPreference, darkByChoice]) rules = rules.replace(tokens, "");
    expect(rules.replace(/\/\*[^]*?\*\//g, "")).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|(?<![\w-])(white|black)(?![\w-])/i);
  });

  it("styles every kit class the components use, in the builder and in the answer", () => {
    const used = new Set([...sources(new URL("./", import.meta.url), /\.tsx$/), ...sources(new URL("../answer/", import.meta.url), /\.tsx$/)].join("\n").match(/(?<![\w-])fk-[a-z0-9-]+/g));
    const missing = [...used].filter(name => !css.includes(`.${name}`));
    expect(missing).toEqual([]);
  });

  it("gives every control a 44 px target under 600 px, the (?) included", () => {
    const phone = css.slice(css.indexOf("@media (max-width:600px){"));
    const rules = [...phone.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({ selectors: selectors!.split(",").map(item => item.trim()), body: body! }));
    const tall = (selector: string) => rules.some(rule => rule.selectors.includes(selector) && /min-height:4[48]px/.test(rule.body));
    for (const selector of [".fk-invite", ".fk-chip-main", ".fk-toggle", ".fk-seg-opt", ".fk-pill", ".fk-chip--parked", ".fk-opt--link", ".fk-field input", ".fk-field select", ".fk-present .fk-phrase", ".fk-suggest", ".fk-relax button", ".fk-more-btn", ".fk-menu-item", ".fk-link", ".fk-rec", ".fk-crumbs a", ".fk-crumbs button", ".fk-search input"]) expect(tall(selector), selector).toBe(true);
    expect(phone).toContain(".fk-more{width:44px;height:44px}"); // the row's "⋯"
    // At least 44 px at every width: the bands, the years, the results, the bottom buttons.
    for (const [selector, height] of [["fk-band", 52], ["fk-year", 50], ["fk-res", 48], ["fk-primary", 44], ["fk-secondary", 44]] as const) expect(css, selector).toMatch(new RegExp(`\\.${selector}\\{[^}]*min-height:${height}px`));
    expect(phone).toContain(".fk-chip-x{min-width:44px}");
    expect(phone).toContain(".fk .term-tip>.term-trigger{min-width:44px;min-height:44px;margin-block:-10px}");
    expect(phone).toContain(".fk-close{width:44px;height:44px}");
    expect(phone).toMatch(/dialog\.fk-pop\{inset:auto 0 0 0;max-width:100%/); // the bottom sheet
  });

  it("opens a (?) where it can be seen: down inside a window, over its own chip on a phone", () => {
    // Above, a window's overflow:auto would hide it; the title's (?) anchors on the head, under the title.
    expect(css).toContain(".fk-pop .term-tip>.term-def{top:calc(100% + 6px);bottom:auto}");
    expect(css).toMatch(/\.fk-pop-head\{position:relative;/);
    const phone = css.slice(css.indexOf("@media (max-width:600px){"));
    expect(phone).toContain(".fk-tipwrap-sm{position:relative}");
    expect(css.slice(0, css.indexOf("@media (max-width:600px){"))).not.toMatch(/\.fk-tipwrap-sm\{[^}]*position/); // the row's width on desktop (kit)
    expect(css).toMatch(/\.fk-sw-l\{[^}]*white-space:nowrap/); // a channel's swatch never wraps away from its word
  });

  it("lets a phrase glued to its punctuation wrap inside, leaving room for the mark (F1b-tests: a long name at 320 px)", () => {
    // white-space inherits: without this a name in .fk-nowrap ran past the sentence and the page clipped it.
    expect(css).toContain(".fk-nowrap>.fk-phrase{white-space:normal;max-width:calc(100% - .6em)}");
    expect(css).toMatch(/\.fk-phrase>span\{[^}]*overflow-wrap:anywhere/);
  });

  it("keeps clear of today's builder classes and honours reduced motion", () => {
    expect(uncommented).not.toMatch(/\.qb-/);
    expect(css).toContain("@media (prefers-reduced-motion:reduce){.fk *{transition:none!important;animation:none!important}}");
  });

  it("writes Romanian with ș and ț (comma below), in the kit and its demo", () => {
    const all = [...sources(new URL("./", import.meta.url)), ...sources(new URL("../answer/", import.meta.url)), ...sources(new URL("../trusa/", import.meta.url))].join("\n");
    expect(all).not.toMatch(/[şţŞŢ]/);
    expect(all).toMatch(/ș/);
  });
});
