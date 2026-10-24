import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import KitDemoPage, { metadata } from "./page";
import KitDemo from "./KitDemo";

// The kit's demo route is for development only (F1a): a 404 in production, never indexed.
describe("/intreaba/trusa", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("is not found in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => KitDemoPage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("shows the demo in development, kept out of search engines", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isValidElement(KitDemoPage())).toBe(true);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("draws each of the 21 components in its states, with tokens only", () => {
    const markup = renderToStaticMarkup(createElement(KitDemo));
    for (const name of ["fk-sentence", "fk-phrase--fixed", "fk-present", "fk-invite", "fk-scopeline", "fk-row--select", "fk-chip is-active", "fk-toggle", "fk-chip--only", "fk-chip--exclude", "fk-chip--auto", "fk-chip--legacy", "fk-chip--origin", "fk-chip--parked", "fk-seg", "fk-groups", "fk-pills", "fk-inputs", "fk-opts--check", "fk-opt--rest", "fk-opt--link", "fk-pop"]) expect(markup, name).toContain(name);
    // Part 2: bands, period, entity search, strip, row and menu, total, longer list, card, locate, empty state.
    for (const name of ["fk-bands", "fk-band", "fk-years", "fk-year is-partial", "fk-year is-zero", "fk-range-open", "fk-form-error", "fk-search is-focus", "fk-listbox", "fk-res is-hover", "fk-strip fk-strip--rows", "fk-strip-label--sm-hide", "fk-suggest", "fk-crumbs", "fk-strip-end", "fk-arow", "fk-tag--signal", "fk-tag--caveat", "fk-tag--accent", "fk-more is-focus", "fk-menu fk-menu--pop", "fk-total", "fk-listfoot", "fk-rest", "fk-card", "fk-find", "fk-find-res", "fk-empty", "fk-relax", "fk-bottom", "fk-primary is-hover"]) expect(markup, name).toContain(name);
    for (let n = 1; n <= 14; n++) expect(markup, `section ${n}`).toContain(`id="kd-sec-${n}"`);
    expect(markup).not.toMatch(/Ascunde din|Încă \d|#\d+ din|toți anii disponibili|Toată perioada|La prima apariție|un singur ofertant/); // kit §4 vocabulary
    expect(markup).toContain("prima înregistrare în datele noastre"); // trusa 6: the first record is «Prima dată»
    expect(markup).not.toMatch(/style="[^"]*#[0-9a-f]{3,8}/i);
    expect(markup).not.toMatch(/[şţŞŢ]/);
  });
});
