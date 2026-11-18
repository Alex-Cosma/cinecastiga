import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Esențial (lib/view-mode.ts, owner, 18 November 2026): what the guide's two modes rest on. The ids and marks are read
// by components/mode/esential-ghid.css and MethodologyBehavior; a rename would silently show the whole lane again.
const story = readFileSync(new URL("./MethodologyStory.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
const behavior = readFileSync(new URL("./MethodologyBehavior.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../components/mode/esential-ghid.css", import.meta.url), "utf8");
const exclusions = readFileSync(new URL("./excluderi/page.tsx", import.meta.url), "utf8");

describe("the guide in Esențial", () => {
  it("shows Povestea and Regulile whole, with Complet's line, when a link opens them", () => {
    for (const lane of ["lane-poveste", "lane-reguli"]) {
      expect(story).toMatch(new RegExp(`id="${lane}"[^>]*data-whole=""> <CompletLine className="mt-col" />`));
    }
    expect(story).not.toMatch(/id="lane-scurt"[^>]*data-whole/);
  });

  it("opens „Despre”, the coverage and the request template alone, by the ids the stylesheet names", () => {
    expect(behavior).toContain('const ALONE = new Set(["despre", "acoperire", "req"]);');
    for (const id of ["despre", "acoperire", "req"]) {
      expect(story).toContain(`id="${id}"`);
      expect(css).toContain(`.mt[data-alone="${id}"]`);
    }
    // The three stay reachable from the guide's lane or the footer; „Înapoi la ghid” shows the guide in place.
    expect(story).toContain('<a href="#despre">despre cinecâștigă?</a>');
    expect(story).toContain('<a href="#req">Model de cerere</a>.<span data-only="complet"> Dacă ești ales local');
    expect(story).toContain('data-go="scurt" data-only="esential">← Înapoi la ghid</a>');
  });

  it("says both forms of every swapped text", () => {
    for (const [complet, esential] of [["Trei pași", "Doi pași"], ["Scorul, în patru pași", "Pe scurt, în trei pași"], ["4", "3"]]) {
      expect(story).toContain(`<span data-only="complet">${complet}</span><span data-only="esential">${esential}</span>`);
    }
  });

  it("keeps every state of the exclusions page in Complet", () => {
    expect(exclusions.match(/return <CompletOnly>/g)).toHaveLength(2);
    expect(exclusions).not.toMatch(/return <>/);
  });
});
