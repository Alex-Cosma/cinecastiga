import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Coverage } from "../lib/coverage";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const { default: CollectionHistory } = await import("./CollectionHistory");

const run = (source: string, over: Partial<Coverage["collections"][number]> = {}): Coverage["collections"][number] => ({
  source, last_success: "2026-07-17 23:58:03", latest_status: "completed", latest_started: "2026-07-17 13:20:20",
  window_from: "2020-01-01 00:00:00", window_to: "2020-12-31 23:59:59", reported: null, fetched: 494650, deviation: null, ...over,
});
const collections = [run("elicitatie:das"), run("ted:can-standard", { window_from: "2018-01-01 00:00:00", window_to: "2018-01-31 23:59:59", fetched: 0, reported: 0, deviation: 0 }), run("ted:fforms", { last_success: "2026-07-20 16:57:09", latest_status: "running" })];
const collector: Coverage["collector"] = {
  batch: { id: "recovery-2026-09-25", endDay: "2026-09-25", status: "collecting", followLatest: false },
  streams: [
    { stream: "da", lastSuccessAt: "2026-10-02T07:11:13+03:00", inBatch: true, open: true, gaps: false },
    { stream: "awards", lastSuccessAt: "2026-10-02T07:10:17+03:00", inBatch: true, open: true, gaps: true },
  ],
};
const render = (data: Pick<Coverage, "collector" | "collections">) => renderToStaticMarkup(createElement(CollectionHistory, data));
const outsideArchive = (html: string) => html.split("<details>")[0]!;

// Audit F17 and its review: the collector dates SEAP; TED, whose collector stream is off,
// keeps its windowed imports as the current record instead of an archive saying they are stale.
describe("public collection panel", () => {
  it("dates SEAP from the collector and keeps TED's windowed imports as TED's current record", () => {
    const html = render({ collector, collections }), main = outsideArchive(html);
    expect(main).toContain("SEAP · achiziții directe</h4><p>Colectare continuă. Ultima colectare reușită: <strong>02.10.2026</strong>");
    expect(main).toContain("SEAP · atribuiri și contracte");
    expect(main).toContain("Lotul curent cuprinde publicațiile până la 25.09.2026: în curs, cu sarcini amânate sau eșuate.");
    expect(main).toContain("TED · eForms");
    expect(main).toContain("TED · formulare istorice");
    expect(main).toContain("Colectarea continuă nu a colectat încă această sursă.");
    expect(main).toContain("Ultimul import reușit: <strong>20.07.2026</strong>. Ultimul import început: 17.07.2026, neîncheiat.");
    expect(main).toContain("Fereastra ultimului import început: 01.01.2018 — 31.01.2018. Înregistrări preluate: 0");
    // Only the superseded SEAP import goes to the archive, with its 2020 window decoded in Bucharest days.
    const archive = html.slice(main.length);
    expect(archive).toContain("Importuri anterioare pe ferestre");
    expect(archive).toContain("SEAP · achiziții directe");
    expect(archive).toContain("01.01.2020 — 31.12.2020");
    expect(archive).not.toContain("TED");
    expect(html).not.toContain("nu arată vechimea datelor actuale");
  });
  it("gives the batch end only to streams that are in the batch", () => {
    const html = render({ collector: { ...collector, streams: [{ stream: "ted", lastSuccessAt: "2026-10-05T10:00:00+03:00", inBatch: false, open: false, gaps: false }] }, collections });
    expect(html).toContain("TED · anunțuri de atribuire");
    expect(html).not.toContain("Lotul curent");
    // TED collected by the collector: its imports move to the archive; SEAP imports stay current.
    expect(outsideArchive(html)).toContain("SEAP · achiziții directe</h4><p class=\"note\">Importuri pe ferestre.");
    expect(html.slice(outsideArchive(html).length)).toContain("TED · eForms");
  });
  it("shows every windowed import as current when the collector never ran", () => {
    const html = render({ collector: { batch: null, streams: [] }, collections });
    expect(html).not.toContain("<details>");
    expect(html.match(/Colectarea continuă nu a colectat încă această sursă/g)).toHaveLength(3);
    expect(render({ collector: { batch: null, streams: [] }, collections: [] })).toContain("Nu există un jurnal de colectare");
  });
});
