import { describe, expect, it } from "vitest";
import { caietMarkdown, type CaietInput } from "./evidence-caiet";

const entry = (over: Record<string, unknown>) => ({ id: "e", kind: "question", title: "", body: "", alternative: "", status: "open", occurredOn: null, revision: 1, createdAt: "2026-11-07T10:00:00Z", updatedAt: "2026-11-07T10:00:00Z", author: null, ...over });

describe("caiet.md (owner, 7 November 2026)", () => {
  const input: CaietInput = {
    title: "Odobești", description: "Drumuri.", exportedAt: "2026-11-07T11:00:00Z", base: "https://site", investigationId: "inv",
    clips: [{ id: "c1", kind: "da", refId: "123101594", spec: null, snapshot: { title: "DA41271870", valueExact: "80000" }, note: "De ce contează.", createdAt: "2026-11-07T10:16:23Z",
      captureId: "cap", rowCount: 1, totalExact: "80000", capturedAt: "2026-11-07 10:16:23+00", version: 1 }],
    entries: [entry({ id: "q1", title: "Cine câștigă?", alternative: "Singura firmă." }), entry({ id: "t1", kind: "task", title: "Cerere 544", status: "checking" }),
      entry({ id: "ev", kind: "event", title: "Semnarea", occurredOn: "2024-05-14" })] as CaietInput["entries"],
    links: [{ questionId: "q1", clipId: "c1", stance: "supports", note: "Revine." }],
    records: { count: 1, totalExact: "80000", unknownValues: 0, dateFrom: "2026-09-25", dateTo: "2026-09-25" },
    sourceEvents: [{ date: "2026-09-25", title: "DA41271870", label: "Achiziție directă finalizată", href: "/achizitii/123101594", valueExact: "80000", unit: "lei" }],
  };
  const text = caietMarkdown(input);
  it("reads the questions with their evidence and exact values", () => {
    expect(text).toContain("### 1. Cine câștigă?");
    expect(text).toContain("- susține: DA41271870 · 80.000 lei (valoarea achiziției) — Revine.");
    expect(text).toContain("O altă explicație posibilă: Singura firmă.");
  });
  it("lists the evidence with its links and kept version", () => {
    expect(text).toContain("Valoare: 80.000 lei (valoarea achiziției).");
    expect(text).toContain("Păstrat: 1 înregistrare · 80.000 lei · versiunea 1 din 07.11.2026, 12:16. Rândurile: captures/cap/rows.csv.");
    expect(text).toContain("[Pagina](https://site/achizitii/123101594) · [SEAP](https://e-licitatie.ro/pub/direct-acquisition/view/123101594) · [Fișa de probă, privată](https://site/anchete/inv/dovezi/cap)");
    expect(text).toContain("Legată de: întrebarea 1 (susține).");
  });
  it("keeps the timeline in date order, saying where each date comes from", () => {
    const timeline = text.slice(text.indexOf("## Cronologie"), text.indexOf("## De verificat"));
    expect(timeline.indexOf("14.05.2024 · Semnarea (scris în dosar)")).toBeGreaterThan(0);
    expect(timeline.indexOf("25.09.2026 · Achiziție directă finalizată: [DA41271870](https://site/achizitii/123101594) · 80.000 lei (din surse)")).toBeGreaterThan(timeline.indexOf("14.05.2024"));
    expect(text).toContain("- [ ] Cerere 544 (în lucru)");
  });
});
