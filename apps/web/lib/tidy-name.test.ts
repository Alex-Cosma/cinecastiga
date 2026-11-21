import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { tidyName, titleName } from "./tidy-name";
import { COUNTIES } from "./counties";
import geo from "./reference/uat-geo.json";
import { localityWords } from "../scripts/map/build-locality-words.mjs";

/* Titles read entity names tidied (owner, 21 November 2026); invented names in the shapes SICAP writes. */
describe("tidyName", () => {
  it("gives institutions their capitals and diacritics back", () => {
    expect(tidyName("COMUNA BATRANA (PRIMARIA COMUNEI BATRANA)")).toBe("Comuna Bătrâna (Primăria Comunei Bătrâna)");
    expect(tidyName("SCOALA GIMNAZIALA NR. 5 BRASOV")).toBe("Școala Gimnazială nr. 5 Brașov");
    expect(tidyName("GRADINITA CU PROGRAM NORMAL NR 23")).toBe("Grădinița cu Program Normal nr. 23");
    expect(tidyName("DIRECTIA GENERALA DE ASISTENTA SOCIALA SI PROTECTIA COPILULUI SECTOR 1"))
      .toBe("Direcția Generală de Asistență Socială și Protecția Copilului Sector 1");
    expect(tidyName("CASA DE CULTURA A SINDICATELOR")).toBe("Casa de Cultură a Sindicatelor");
    expect(tidyName("SCOALA GIMNAZIALA CLASELE I-VIII")).toBe("Școala Gimnazială Clasele I-VIII");
    expect(tidyName("CENTRUL DE TRANSFUZIE SANGUINA SF.GHEORGHE")).toBe("Centrul de Transfuzie Sanguină Sf.Gheorghe");
  });

  it("keeps legal forms, acronyms, initials and the source's own diacritics", () => {
    expect(tidyName("SC EXEMPLU CONSTRUCT SRL")).toBe("SC Exemplu Construct SRL");
    expect(tidyName("S.C. EXEMPLU AMENAJARI S.R.L.")).toBe("S.C. Exemplu Amenajări S.R.L.");
    expect(tidyName("ATU12345678 EXEMPLU GMBH")).toBe("ATU12345678 Exemplu GmbH");
    expect(tidyName("EXEMPLU M & S")).toBe("Exemplu M & S");
    expect(tidyName("POPESCU D. ION - PERSOANĂ FIZICĂ AUTORIZATĂ")).toBe("Popescu D. Ion - Persoană Fizică Autorizată");
    expect(tidyName("DGASPC EXEMPLU")).toBe("DGASPC Exemplu");
    expect(tidyName("CSÓTI LÁSZLÓ ÎNTREPRINDERE INDIVIDUALĂ")).toBe("Csóti László Întreprindere Individuală");
  });

  it("keeps a mixed-case name's case, adding only missing diacritics; an ambiguous locality keeps its letters", () => {
    expect(tidyName("Municipiul Cluj-Napoca")).toBe("Municipiul Cluj-Napoca");
    expect(tidyName("Orasul Cisnadie")).toBe("Orașul Cisnădie");
    expect(tidyName("Comuna Exemplu (Primaria Comunei Exemplu) Judetul Giurgiu si Ilfov")).toBe("Comuna Exemplu (Primăria Comunei Exemplu) Județul Giurgiu și Ilfov");
    expect(tidyName("Orașul Cisnadie")).toBe("Orașul Cisnadie");
    expect(tidyName("Innovaciones Hospitalarias SRL")).toBe("Innovaciones Hospitalarias SRL");
    // „Botesti” is Botești or Boțești: no guess.
    expect(tidyName("COMUNA BOTESTI")).toBe("Comuna Botesti");
    expect(tidyName("")).toBe("");
  });

  it("drops a leading CUI before tidying (titleName)", () => {
    expect(titleName("9813902 EXEMPLU CONSTRUCT")).toBe("Exemplu Construct");
    expect(titleName(null)).toBe("(fără nume)");
  });
});

describe("the localities' words", () => {
  it("are current with the localities and counties (node scripts/map/build-locality-words.mjs)", () => {
    const stored = JSON.parse(readFileSync(new URL("./reference/locality-words.json", import.meta.url), "utf8")).words;
    expect(stored).toEqual(localityWords((geo as unknown as { uats: [number, string][] }).uats.map((u) => u[1]), COUNTIES));
  });
});
