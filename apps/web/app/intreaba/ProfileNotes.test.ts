import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ProfileSourceNote } from "./ProfileNotes";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// R0: entity_flags and the profile sources are accepted direct acquisitions only
// (apps/ingestion flags/marts.ts, runRows); "inclusiv oferte neacceptate" was false.
describe("historical profile notes", () => {
  it("draws no banner above the answer: the line under its sentence says the basis (owner, 2 November 2026)", () => {
    const panel = readFileSync(new URL("./AskPanel.tsx", import.meta.url), "utf8");
    expect(panel).not.toMatch(/ProfileNotice|cq-profile-notice/);
    expect(readFileSync(new URL("./question-results.css", import.meta.url), "utf8")).not.toContain("cq-profile-notice");
  });

  it("says the sources match the profile and keeps the reconciliation", () => {
    const matched = text(renderToStaticMarkup(createElement(ProfileSourceNote, { reconciled: true, profileCount: 1234 })));
    expect(matched).toContain("Doar achiziții directe acceptate, ca profilul.");
    // The numeral rule (G10): "de" from 20 on.
    expect(matched).toContain("coincid cu agregatele celor 1.234 de profiluri selectate");
    expect(text(renderToStaticMarkup(createElement(ProfileSourceNote, { reconciled: true, profileCount: 12 })))).toContain("celor 12 profiluri selectate");
    // One profile is singular, never „celor 1 profil selectate” (owner, 2 November 2026).
    const one = text(renderToStaticMarkup(createElement(ProfileSourceNote, { reconciled: true, profileCount: 1 })));
    expect(one).toContain("coincid cu agregatul profilului selectat.");
    expect(one).not.toContain("celor 1");
    expect(matched).not.toMatch(/neacceptate|Poți selecta starea/);
    expect(text(renderToStaticMarkup(createElement(ProfileSourceNote, { reconciled: false, profileCount: 3 })))).toContain("diferă");
    expect(text(renderToStaticMarkup(createElement(ProfileSourceNote, { reconciled: null, profileCount: 3 })))).toBe("Doar achiziții directe acceptate, ca profilul.");
  });

  it.each(["./AskPanel.tsx", "./EvidenceDrawer.tsx"])("%s never makes the old claim", (file) => {
    expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toContain("neacceptate");
  });

  it("keeps the source note in the drawer", () => {
    expect(readFileSync(new URL("./EvidenceDrawer.tsx", import.meta.url), "utf8")).toMatch(/<ProfileSourceNote\b/);
  });
});
