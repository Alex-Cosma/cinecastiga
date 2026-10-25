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
    for (const name of ["qb-sentence", "qb-phrase--fixed", "qb-present", "qb-invite", "qb-scopeline", "qb-row--select", "qb-chip is-active", "qb-toggle", "qb-chip--only", "qb-chip--exclude", "qb-chip--auto", "qb-chip--legacy", "qb-chip--origin", "qb-chip--parked", "qb-seg", "qb-groups", "qb-pills", "qb-inputs", "qb-opts--check", "qb-opt--rest", "qb-opt--link", "qb-pop"]) expect(markup, name).toContain(name);
    // Part 2: bands, period, entity search, strip, row and menu, total, longer list, card, locate, empty state.
    for (const name of ["qb-bands", "qb-band", "qb-years", "qb-year is-partial", "qb-year is-zero", "qb-range-open", "qb-form-error", "qb-search is-focus", "qb-listbox", "qb-res is-hover", "qb-strip qb-strip--rows", "qb-strip-label--sm-hide", "qb-suggest", "qb-crumbs", "qb-strip-end", "qb-arow", "qb-tag--signal", "qb-tag--caveat", "qb-tag--accent", "qb-more is-focus", "qb-menu qb-menu--pop", "qb-total", "qb-listfoot", "qb-rest", "qb-card", "qb-find", "qb-find-res", "qb-empty", "qb-relax", "qb-bottom", "qb-primary is-hover"]) expect(markup, name).toContain(name);
    for (let n = 1; n <= 14; n++) expect(markup, `section ${n}`).toContain(`id="kd-sec-${n}"`);
    expect(markup).not.toMatch(/Ascunde din|Încă \d|#\d+ din|toți anii disponibili|Toată perioada|La prima apariție|un singur ofertant/); // kit §4 vocabulary
    expect(markup).toContain("prima înregistrare în datele noastre"); // trusa 6: the first record is «Prima dată»
    expect(markup).not.toMatch(/style="[^"]*#[0-9a-f]{3,8}/i);
    expect(markup).not.toMatch(/[şţŞŢ]/);
  });
});
