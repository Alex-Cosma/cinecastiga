import { describe, expect, it } from "vitest";
import { namesQuery } from "./names-query";

describe("the names search of the home box (search probe, 12 November 2026)", () => {
  it("sends a name being typed as it is", () => {
    expect(namesQuery("Apa Nova")).toEqual({ q: "Apa Nova", allWords: false });
    expect(namesQuery("primăria Buzău")).toEqual({ q: "primăria Buzău", allWords: false });
    expect(namesQuery("spitalul judetean de urgenta cluj")).toEqual({ q: "spitalul judetean de urgenta cluj", allWords: false });
    expect(namesQuery("DEDEMAN")).toEqual({ q: "DEDEMAN", allWords: false });
  });

  it("reduces a question to the words a name could hold, and asks for all of them", () => {
    expect(namesQuery("cine face cel mai mulți bani din psihoterapie")).toEqual({ q: "psihoterapie", allWords: true });
    // The name plus the subject must all match: no firm is named so, so no names noise (the interpreter reads the entity).
    expect(namesQuery("cât a cheltuit primăria Cluj pe asfaltare?")).toEqual({ q: "primăria Cluj asfaltare", allWords: true });
    expect(namesQuery("cine câștigă la Spitalul Colțea")).toEqual({ q: "Spitalul Colțea", allWords: true });
  });

  it("drops the generic head of a subject phrase", () => {
    expect(namesQuery("servicii de psihoterapie")).toEqual({ q: "psihoterapie", allWords: true });
    expect(namesQuery("lucrări de asfaltare")).toEqual({ q: "asfaltare", allWords: true });
    // A single generic word is still a name search („Servicii” firms).
    expect(namesQuery("servicii")).toEqual({ q: "servicii", allWords: false });
  });

  it("skips the names search when nothing could be a name", () => {
    expect(namesQuery("cine face cei mai mulți bani?")).toBeNull();
    expect(namesQuery("   ")).toBeNull();
  });
});
