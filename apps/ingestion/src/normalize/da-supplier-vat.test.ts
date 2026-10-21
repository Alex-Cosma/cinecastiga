import { describe, expect, it } from "vitest";
import { entityIdentity, parseVatPrefixedString } from "./foreign.js";
import { canonicalCui } from "./cui.js";
import { parseEntityString } from "./name.js";

// Data audit F18: DA-list supplier strings of the local snapshot of 1 October.
describe("parseVatPrefixedString", () => {
  it("reads the foreign VAT number that leads a DA supplier string", () => {
    expect(parseVatPrefixedString("ATU14260100 ECOLAB GMBH")).toEqual({ country: "AT", idRaw: "ATU14260100", name: "ECOLAB GMBH" });
    expect(parseVatPrefixedString("ATU 18379608 Shimadzu Handelsgesellschaft mbH"))
      .toEqual({ country: "AT", idRaw: "ATU 18379608", name: "Shimadzu Handelsgesellschaft mbH" });
    expect(parseVatPrefixedString("AT U16818807 MULLER MARTINI")?.idRaw).toBe("AT U16818807");
    expect(parseVatPrefixedString("DE811121471 Georg Fischer GmbH")).toEqual({ country: "DE", idRaw: "DE811121471", name: "Georg Fischer GmbH" });
    expect(parseVatPrefixedString("FR 27515156917 CAR ET BUS MAINTENANCE")?.country).toBe("FR");
    expect(parseVatPrefixedString("ESB86728631 AQUACULTURE PARTNERS")?.country).toBe("ES");
    expect(parseVatPrefixedString("NL822512105B01 MEPRO SOURCING B.V.")?.idRaw).toBe("NL822512105B01");
    expect(parseVatPrefixedString("NL 801627011 Malvern Panalytical B.V.")?.country).toBe("NL");
    expect(parseVatPrefixedString("SE556941689301 PinMeTo AB")?.country).toBe("SE");
    expect(parseVatPrefixedString("CHE-105.678.859 scope solutions ag")).toEqual({ country: "CH", idRaw: "CHE-105.678.859", name: "scope solutions ag" });
    expect(parseVatPrefixedString("EL999503170 - Firma")).toEqual({ country: "GR", idRaw: "EL999503170", name: "Firma" });
    expect(parseVatPrefixedString("LV 40003242370 SIA Poliurs")?.country).toBe("LV");
  });
  it("gives the key TED already holds for the same firm", () => {
    const vat = parseVatPrefixedString("ATU 18379608 Shimadzu Handelsgesellschaft mbH")!;
    expect(entityIdentity(vat.country, vat.idRaw)).toEqual({ countryCode: "AT", isForeign: true, mergeIdNorm: "ATU18379608" });
    expect(canonicalCui(vat.idRaw).valid).toBe(false);
  });
  it("leaves names, Romanian ids and malformed numbers alone", () => {
    for (const s of [
      "Ex Libris (Deutschland) GmbH", "Bozankaya Rayli Sistemler A.Ş.", "COPIATORUL ECO",
      "DE 3 Firma", "DE12345678 Firma", "IT 2000 SRL", "ATU1426010 ECOLAB", "ATU14260100",
      "ATU14260100 -", "RO21255449 S.C. INGRID S.R.L.", "29074847 Gradinita PP nr. 4 Lugoj",
      "CHEMICAL COMPANY 123456789", "00041200627 Imeva S.P.A.",
    ]) expect(parseVatPrefixedString(s)).toBeNull();
    // parseEntityString keeps the Romanian CUI it already reads.
    expect(parseEntityString("ATU14260100 ECOLAB GMBH").cuiRaw).toBeNull();
  });
});
