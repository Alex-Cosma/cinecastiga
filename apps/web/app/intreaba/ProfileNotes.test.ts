import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ProfileNotice, ProfileSourceNote } from "./ProfileNotes";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// R0: entity_flags and the profile sources are accepted direct acquisitions only
// (apps/ingestion flags/marts.ts, runRows); "inclusiv oferte neacceptate" was false.
describe("historical profile notes", () => {
  it("says above the answer what a profile is, recorded values and not payments", () => {
    const shown = text(renderToStaticMarkup(createElement(ProfileNotice)));
    expect(shown).toContain("Profil istoric: achiziții directe acceptate; valori înregistrate, nu plăți.");
    expect(shown).not.toMatch(/neacceptate|toate sursele/);
  });

  it("says the sources match the profile and keeps the reconciliation", () => {
    const matched = text(renderToStaticMarkup(createElement(ProfileSourceNote, { reconciled: true, profileCount: 1234 })));
    expect(matched).toContain("Doar achiziții directe acceptate, ca profilul.");
    // The numeral rule (G10): "de" from 20 on.
    expect(matched).toContain("coincid cu agregatele celor 1.234 de profiluri selectate");
    expect(text(renderToStaticMarkup(createElement(ProfileSourceNote, { reconciled: true, profileCount: 12 })))).toContain("celor 12 profiluri selectate");
    expect(matched).not.toMatch(/neacceptate|Poți selecta starea/);
    expect(text(renderToStaticMarkup(createElement(ProfileSourceNote, { reconciled: false, profileCount: 3 })))).toContain("diferă");
    expect(text(renderToStaticMarkup(createElement(ProfileSourceNote, { reconciled: null, profileCount: 3 })))).toBe("Doar achiziții directe acceptate, ca profilul.");
  });

  it.each(["./AskPanel.tsx", "./EvidenceDrawer.tsx"])("%s shows these notes, not the old claim", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).not.toContain("neacceptate");
    expect(source).toMatch(/<Profile(Notice|SourceNote)\b/);
  });
});
