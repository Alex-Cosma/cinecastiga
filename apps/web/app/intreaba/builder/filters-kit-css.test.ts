import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Plan §2.1 R7 and kit §8–§9: the kit takes its colours from tokens defined for
// both themes, draws no fixed colour in a component rule, gives 44 px targets
// under 600 px, and shares the builder's .qb- prefix without colliding with it.
const css = readFileSync(new URL("./filters-kit.css", import.meta.url), "utf8");
const sheet = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\/\*[^]*?\*\//g, "");
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

  it("styles every class the components use, in the builder and in the answer", () => {
    const code = [...sources(new URL("./", import.meta.url), /\.tsx$/), ...sources(new URL("../answer/", import.meta.url), /\.tsx$/)].join("\n").replace(/\/\*[^]*?\*\/|\/\/.*$/gm, "");
    const used = new Set(code.match(/(?<![\w-])qb-[a-z0-9-]+/g));
    const styled = css + sheet("question-builder.css");
    const hooks = new Set(["qb-excluded"]); // a window's excluded entity, drawn as a .qb-opt row
    const missing = [...used].filter(name => !styled.includes(`.${name}`) && !hooks.has(name));
    expect(missing).toEqual([]);
  });

  it("gives every control a 44 px target under 600 px, the (?) included", () => {
    const phone = css.slice(css.indexOf("@media (max-width:600px){"));
    const rules = [...phone.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({ selectors: selectors!.split(",").map(item => item.trim()), body: body! }));
    const tall = (selector: string) => rules.some(rule => rule.selectors.includes(selector) && /min-height:4[48]px/.test(rule.body));
    for (const selector of [".qb-invite", ".qb-chip-main", ".qb-toggle", ".qb-seg-opt", ".qb-pill", ".qb-chip--parked", ".qb-opt--link", ".qb-field input", ".qb-field select", ".qb-present .qb-phrase", ".qb-suggest", ".qb-relax button", ".qb-more-btn", ".qb-menu-item", ".qb-link", ".qb-rec", ".qb-crumbs a", ".qb-crumbs button", ".qb-search input"]) expect(tall(selector), selector).toBe(true);
    expect(phone).toContain(".qb-more{width:44px;height:44px}"); // the row's "⋯"
    // At least 44 px at every width: the bands, the years, the results, the bottom buttons.
    for (const [selector, height] of [["qb-band", 52], ["qb-year", 50], ["qb-res", 48], ["qb-primary", 44], ["qb-secondary", 44]] as const) expect(css, selector).toMatch(new RegExp(`\\.${selector}\\{[^}]*min-height:${height}px`));
    expect(phone).toContain(".qb-chip-x{min-width:44px}");
    expect(phone).toContain(".qb .term-tip>.term-trigger{min-width:44px;min-height:44px;margin-block:-10px}");
    expect(phone).toContain(".qb-close{width:44px;height:44px}");
    expect(phone).toMatch(/dialog\.qb-pop\{inset:auto 0 0 0;max-width:100%/); // the bottom sheet
  });

  it("opens a (?) where it can be seen: down inside a window, over its own chip on a phone", () => {
    // Above, a window's overflow:auto would hide it; the title's (?) anchors on the head, under the title.
    expect(css).toContain(".qb-pop .term-tip>.term-def{top:calc(100% + 6px);bottom:auto}");
    expect(css).toMatch(/\.qb-pop-head\{position:relative;/);
    const phone = css.slice(css.indexOf("@media (max-width:600px){"));
    expect(phone).toContain(".qb-tipwrap-sm{position:relative}");
    expect(css.slice(0, css.indexOf("@media (max-width:600px){"))).not.toMatch(/\.qb-tipwrap-sm\{[^}]*position/); // the row's width on desktop (kit)
    expect(css).toMatch(/\.qb-sw-l\{[^}]*white-space:nowrap/); // a channel's swatch never wraps away from its word
  });

  it("keeps a notice's (?) tap area inside its chip (F2-tests: the chip clips, the (?) is its last child)", () => {
    // guide.css widens a (?)'s tap area 4 px on each side; the notice chip leaves those 4 px inside its clip.
    const guide = readFileSync(new URL("../../guide.css", import.meta.url), "utf8");
    expect(guide).toContain(".term-trigger:after{content:\"\";position:absolute;left:-4px;right:-4px;");
    expect(css).toMatch(/\.qb-chip\{[^}]*overflow:hidden/);
    expect(css).toContain(".qb-chip--notice .term-tip{margin-right:4px}");
  });

  it("draws a chip's (?) focus ring inside the (?): the chip clips, and under 600 px the (?) is as tall as the chip", () => {
    // Every ring that reaches a (?) in a chip is 3 px (the kit's, the builder's, the answer page's); -3 px keeps it whole.
    expect(uncommented).toMatch(/\.qb :focus-visible,\.qb \.is-focus\{outline:3px solid /);
    expect(sheet("question-builder.css")).toMatch(/\.question-builder :focus-visible \{ outline: 3px solid /);
    expect(sheet("question-results.css")).toMatch(/\.cq-app button:focus-visible,[^{]*\{\s*outline: 3px solid /);
    expect(uncommented).toMatch(/\.qb-chip\{[^}]*overflow:hidden/);
    expect(uncommented).toContain(".qb-chip .term-tip>.term-trigger:focus-visible{outline-offset:-3px}");
  });

  it("lets a phrase glued to its punctuation wrap inside, leaving room for the mark (F1b-tests: a long name at 320 px)", () => {
    // white-space inherits: without this a name in .qb-nowrap ran past the sentence and the page clipped it.
    expect(css).toContain(".qb-nowrap>.qb-phrase{white-space:normal;max-width:calc(100% - .6em)}");
    expect(css).toMatch(/\.qb-phrase>span\{[^}]*overflow-wrap:anywhere/);
  });

  it("shares no class with the rest of the builder and honours reduced motion", () => {
    // The kit's prefix is the builder's (the kit's own .fk- until F2): none is left, none comes back.
    expect(uncommented).not.toMatch(/\.fk(?![\w-])|\.fk-/);
    expect(sources(new URL("../", import.meta.url)).join("\n")).not.toMatch(/(?<![\w-])fk-[a-z]|className="fk[ "]/);
    // A class drawn on its own (one compound, under the page and the theme at most) belongs to one sheet: the other
    // sheets restyle a kit class only inside another (".qb-editor-kit > .qb-sentence"), never as the old builder's
    // .qb-chip or ".question-builder .qb-sentence" did.
    const bare = (text: string) => new Set([...text.replace(/@media[^{]*\{/g, "").matchAll(/(?:^|[{},])\s*([^{},@]+?)\s*(?=[{,])/g)]
      .map(([, selector]) => selector!.trim().replace(/^(:root\S*\s+)?(\.explore-compact\s+)?(\.question-builder\s+)?/, ""))
      .filter(selector => !/[\s>+~]/.test(selector))
      .flatMap(selector => [...selector.matchAll(/\.(qb[\w-]*)/g)].map(match => match[1]!)));
    const kit = bare(uncommented);
    expect(kit.size).toBeGreaterThan(100);
    for (const name of ["question-builder.css", "question-results.css", "explore-compact.css", "../approved.css"]) {
      expect([...bare(sheet(name))].filter(cls => kit.has(cls)), name).toEqual([]);
    }
    expect(css).toContain("@media (prefers-reduced-motion:reduce){.qb *{transition:none!important;animation:none!important}}");
  });

  it("writes Romanian with ș and ț (comma below), in the kit and its demo", () => {
    const all = [...sources(new URL("./", import.meta.url)), ...sources(new URL("../answer/", import.meta.url)), ...sources(new URL("../trusa/", import.meta.url))].join("\n");
    expect(all).not.toMatch(/[şţŞŢ]/);
    expect(all).toMatch(/ș/);
  });
});
