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

  it("draws each part-1 component, with tokens only", () => {
    const markup = renderToStaticMarkup(createElement(KitDemo));
    for (const name of ["fk-sentence", "fk-phrase--fixed", "fk-present", "fk-invite", "fk-scopeline", "fk-row--select", "fk-chip is-active", "fk-toggle", "fk-chip--only", "fk-chip--exclude", "fk-chip--auto", "fk-chip--legacy", "fk-chip--origin", "fk-chip--parked", "fk-seg", "fk-groups", "fk-pills", "fk-inputs", "fk-opts--check", "fk-opt--rest", "fk-opt--link", "fk-pop"]) expect(markup, name).toContain(name);
    expect(markup).not.toMatch(/style="[^"]*#[0-9a-f]{3,8}/i);
    expect(markup).not.toMatch(/[şţŞŢ]/);
  });
});
