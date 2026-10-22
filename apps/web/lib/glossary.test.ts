import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GLOSSARY, GUIDE_IDEAS, glossaryEntry, type GlossaryId } from "./glossary";
import Term from "../components/Term";

describe("beginner glossary", () => {
  it("has a title and a plain one-to-three sentence text for every term", () => {
    for (const [id, entry] of Object.entries(GLOSSARY)) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(entry.title.length).toBeGreaterThan(2);
      expect(entry.text.trim()).toBe(entry.text);
      expect(entry.text.endsWith(".")).toBe(true);
      const sentences = entry.text.split(/(?<=\.)\s+(?=[A-ZĂÂÎȘȚ„])/).length;
      expect(sentences, id).toBeLessThanOrEqual(3);
    }
  });

  it("lists the five guide ideas in order, then the consortium rule", () => {
    expect(GUIDE_IDEAS).toEqual(["achizitie-directa", "contract-procedura", "valoare-inregistrata", "semnal", "cpv", "consortiu"]);
    for (const id of GUIDE_IDEAS) expect(glossaryEntry(id)).toBe(GLOSSARY[id]);
  });

  it("keeps the binding product wording: values are not payments, signals are not accusations", () => {
    expect(GLOSSARY["valoare-inregistrata"].text).toContain("nu dovedește că banii au fost plătiți");
    expect(GLOSSARY.semnal.text).toContain("nu o acuzație");
    expect(GLOSSARY.semnal.text).toContain("nu dovedește o ilegalitate");
    expect(GLOSSARY["contract-procedura"].text).toContain("nu garantează că au existat mai mulți ofertanți");
  });

  it("states the consortium rule exactly as the methodology does", () => {
    expect(GLOSSARY.consortiu.text).toContain("În lipsa cotelor reale, valoarea unui consorțiu este împărțită egal între membri. Cotele însumate refac valoarea contractului; nu dovedesc venitul încasat de fiecare firmă.");
  });
});

describe("<Term>", () => {
  const render = (id: GlossaryId, label?: string) => renderToStaticMarkup(createElement(Term, { id }, label));

  it("renders the word as a real button tied to a closed definition from the dictionary", () => {
    const html = render("achizitie-directa", "achiziții directe acceptate");
    expect(html).toMatch(/^<span class="term"><button type="button" class="term-trigger" aria-expanded="false" aria-controls="([^"]+)">achiziții directe acceptate/);
    const controls = /aria-controls="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`<span id="${controls}" class="term-def" role="note" hidden="">`);
    expect(html).toContain(GLOSSARY["achizitie-directa"].text);
    expect(html).toContain("(ce înseamnă)");
    expect(html).not.toMatch(/onmouse|title=/i);
  });

  it("falls back to the glossary title when no label is given", () => {
    expect(render("semnal")).toContain(">Semnal<span class=\"term-mark\"");
  });
});
