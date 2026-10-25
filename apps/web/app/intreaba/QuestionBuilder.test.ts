import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QuestionSpec } from "../../lib/ask/question-ui";

// The app's "@/" paths are Next's; the unit tests resolve them to the same modules.
vi.mock("@/lib/ask/spec", () => import("../../lib/ask/spec"));
vi.mock("@/lib/ask/question-ui", () => import("../../lib/ask/question-ui"));
vi.mock("@/lib/ask/filters/restore", () => import("../../lib/ask/filters/restore"));
vi.mock("@/lib/ask/filters/transition", () => import("../../lib/ask/filters/transition"));
vi.mock("@/lib/ask/filters/origin", () => import("../../lib/ask/filters/origin"));
vi.mock("@/lib/ask/filters/blocks", () => import("../../lib/ask/filters/blocks"));
vi.mock("@/lib/ask/filters/context", () => import("../../lib/ask/filters/context"));
vi.mock("@/lib/ask/filters/title", () => import("../../lib/ask/filters/title"));
vi.mock("@/lib/ask/permalink", () => import("../../lib/ask/permalink"));
vi.mock("@/lib/ask/population", () => import("../../lib/ask/population"));
vi.mock("@/lib/ask/local-questions", () => import("../../lib/ask/local-questions"));
vi.mock("@/lib/counties", () => import("../../lib/counties"));
vi.mock("@/lib/format", () => import("../../lib/format"));
vi.mock("@/lib/ask/answer-text", () => import("../../lib/ask/answer-text"));
vi.mock("@/lib/entity-summary", () => import("../../lib/entity-summary"));
vi.mock("@/components/Term", () => import("../../components/Term"));
// No session in a unit test: an anonymous reader, who saves on the device.
vi.mock("@/lib/use-viewer", () => ({ useViewer: () => ({ ready: true, userId: undefined, error: null }) }));

const { default: QuestionBuilder } = await import("./QuestionBuilder");
const { default: SaveQuestionButton } = await import("./SaveQuestionButton");

/*
 * F1b-builder-a: QuestionBuilder renders the registry's question with the
 * kit (plan §2.3), as markup. A link's draft, a refused condition, the
 * builder's "Salvează" and the places of the seven questions.
 */

const html = (initial: QuestionSpec | null, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(QuestionBuilder, { initial, onRun: () => true, running: false, ...extra }));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("QuestionBuilder from the registry", () => {
  it("draws the sentence as phrases, the invitations, the presentation line and «⋯», nothing generic (R3)", () => {
    const markup = html({ block: "table", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2025, yearTo: 2025 } });
    expect(markup).toMatch(/<h2 class="fk-sentence qb-kit-sentence qb-kit-sentence--table">/);
    expect(markup).toContain('aria-label="Ce clasăm: firme"');
    expect(markup).toContain('aria-label="Perioada: 2025"');
    expect(text(markup)).toContain("+ Angajați");
    expect(text(markup)).toContain("Arată primele 10 , după valoarea înregistrată");
    expect(markup).toContain('aria-label="Mai multe pentru Întrebarea"');
    for (const retired of ["Adaugă o condiție", "Mai multe filtre", "Număr minim de înregistrări", "Selecție precisă", "qb-add", "cq-more-filters"]) expect(markup).not.toContain(retired);
    // A run question: applied, the builder's save without "neaplicată".
    expect(text(markup)).toContain("Întrebare aplicată");
    expect(text(markup)).toContain("Salvează întrebarea");
    expect(text(markup)).not.toContain("neaplicată");
  });

  it("opens a link that cannot run with its refused chip, the engine's reason and «Scoate condițiile din link»; «Vezi răspunsul» waits", () => {
    const markup = html({ block: "trend", dim: "supplier", measure: "value", topN: 10, minimumRecords: { role: "supplier", count: 5 }, filters: { yearFrom: 2024, yearTo: 2025 } }, { initialApplied: false });
    expect(text(markup)).toContain("Din link: firme cu cel puțin 5 înregistrări în selecție");
    expect(markup).toContain('class="qb-refused" role="alert"');
    expect(text(markup)).toContain("Scoate condițiile din link");
    expect(markup).toMatch(/<button type="button" class="fk-primary qb-apply" disabled="">Vezi răspunsul/);
    expect(text(markup)).not.toContain("Întrebare aplicată");
  });

  it("says what opening a link changed while it waits: a repaired link is not run without its note (F1b-tests)", async () => {
    const { restoreLink } = await import("../../lib/ask/filters/restore");
    // An old link of a firms' ranking per inhabitant: the builder shows lei, and the note says why the link did not run.
    const restored = restoreLink({ block: "table", dim: "supplier", measure: "value_per_capita", topN: 10, filters: {} });
    if (restored.kind !== "draft") throw new Error("a draft");
    expect(restored.run).toBe(false);
    expect(restored.notes.length).toBeGreaterThan(0);
    const markup = text(html(restored.spec, { initialApplied: false, initialNotes: restored.notes }));
    expect(markup).toContain("Ce se schimbă odată cu întrebarea");
    for (const note of restored.notes) expect(markup).toContain(note);
    expect(markup).not.toContain("Întrebare aplicată");
  });

  it("draws the profile line on a profile and the partners' row on a network", () => {
    expect(html({ block: "scatter", dim: "authority", measure: "value", rankBy: "risk", filters: {} })).toContain('class="fk-scopeline');
    const network = html({ block: "network", dim: "authority", measure: "value", filters: { authorityId: 1, authorityName: "Spitalul X" } });
    expect(network).toContain('aria-label="Furnizorii"');
    expect(text(network)).toContain("+ Angajați");
  });

  it("says which «Salvează» saves what (plan §2.3): the builder's a draft not applied, the answer's the applied question", () => {
    const spec: QuestionSpec = { block: "stat", measure: "value", filters: {} };
    const draft = renderToStaticMarkup(createElement(SaveQuestionButton, { spec, disabled: false, active: null, onSaved: () => {}, unapplied: true }));
    expect(text(draft)).toContain("Salvează · neaplicată");
    expect(draft).toContain("Salvezi întrebarea din propoziție, nu răspunsul afișat.");
    const answer = renderToStaticMarkup(createElement(SaveQuestionButton, { spec, disabled: false, active: null, onSaved: () => {} }));
    expect(text(answer)).toContain("Salvează întrebarea");
    expect(answer).not.toContain("neaplicată");
  });

  it("keeps the parked row's live region mounted, empty until a lens parks something", () => {
    const markup = html({ block: "entity_card", dim: "supplier", measure: "value", rankBy: "value", filters: {} });
    expect(markup).toContain('<span class="fk-sr" role="status" aria-live="polite"></span>');
    expect(markup).not.toContain("fk-parked");
  });
});
