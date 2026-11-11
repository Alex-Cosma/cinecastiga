import { describe, expect, it } from "vitest";
import { PRICE_FAMILIES, classifyPriceLine, measureNote, measureReadings, priceFamilyBySlug, sizesIn } from "./unit-prices.js";

// Real item lines from SEAP direct awards (local archive, 10 November 2026): name, CPV, unit as typed, unit price.
const line = (name: string, unit: string | null, price: number, cpv: string | null = "15000000-8") => classifyPriceLine(name, cpv, unit, price);
const per = (name: string, unit: string | null, price: number, cpv?: string | null) => {
  const c = line(name, unit, price, cpv);
  return c && c.status === "ok" ? Math.round(c.pricePerUnit! * 100) / 100 : c?.status ?? null;
};

describe("unit prices: families", () => {
  it("has unique slugs, a range and a description for every family", () => {
    const slugs = PRICE_FAMILIES.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const f of PRICE_FAMILIES) {
      expect(f.range[0], f.slug).toBeLessThan(f.range[1]);
      expect(f.holds.length, f.slug).toBeGreaterThan(5);
    }
    expect(priceFamilyBySlug("paine")?.label).toBe("Pâine");
    expect(priceFamilyBySlug("nimic")).toBeNull();
  });

  it("places a line by its name, and leaves out what only shares a word", () => {
    expect(line("FRANZELA 600 GR", "bucata", 3.7)?.family).toBe("paine");
    expect(line("Cartofi congelati", "kg", 8)).toBeNull();
    expect(line("Zahar vanilinat 50g", "bucata", 1.39)).toBeNull();
    expect(line("LAPTE PRAF 1000G", "bucata", 62)).toBeNull();
    expect(line("Manusi chirurgicale, latex, fara pudra", "pereche", 1.6, "33141420-0")).toBeNull();
    expect(line("Sare tabletata", "kg", 1.3)).toBeNull();
    // a family naming CPV prefixes needs the item's CPV to agree
    expect(line("Mere", "kg", 4, "45000000-7")).toBeNull();
    expect(line("Mere", "kg", 4, null)?.family).toBe("mere");
  });

  it("leaves out the look-alikes found in 2018–2019 lines", () => {
    expect(line("OU KINDER", "bucata", 2.94)).toBeNull();
    expect(line("Cartofi Stekhause2,5kg", "bucata", 16.97)).toBeNull();
    expect(line("CARTOFI FANTASY 10MM 2.5KG", "bucata", 12.5)).toBeNull();
    expect(line("Manusi cauciuc nitrilic special cat. III marime M", "bucata", 2, "33141420-0")).toBeNull();
    expect(line("Manusi din bumbac impregnate cu nitril KALARA", "perechi", 4, "33141420-0")).toBeNull();
    expect(line("Inalbitor Vanish Gold White/ Pink, 940ml", "flacon", 23.5, "39831000-6")).toBeNull();
    expect(line("ASEVI degresant cu pulverizator, flacon 750 ml", "buc", 14.8, "39831000-6")).toBeNull();
    expect(line("HARTIE PHOTO A4 100 COLI/TOP", "TOP", 10, "30197630-1")).toBeNull();
    expect(line("HARTIE SCRIS A4 60GR 1000 COLI/TOP", "top", 49.5, "30197630-1")).toBeNull();
    expect(line("HARTIE IGIENICA 150 M H CELULOZA", "ROLA", 4.95, "33761000-2")).toBeNull();
    expect(line("PAINE VEL P.FR.TOAST 600 G", "BUC", 9.17)).toBeNull();
    expect(line("SAPUN LICHID DEZINFECTANT- PRESTISEPT (PRESTIMAIN )", "litru", 49.99, "33711900-6")).toBeNull();
    expect(line("Pulpa dez.pui", "kg", 18.5)).toBeNull();
    expect(line("mere rase 680g", "bucata", 9)).toBeNull();
  });

  it("tells firewood per cubic metre from firewood per stacked metre by the unit", () => {
    expect(line("Lemn de foc", "metru cub", 565, "03413000-8")?.family).toBe("lemne-foc-mc");
    expect(line("Lemn de foc fag fasonat în mst", "mst", 241.98, "03413000-8")?.family).toBe("lemne-foc-ster");
    expect(line("Lemn de foc", "bucata", 300, "03413000-8")?.status).toBe("unit_kind");
  });
});

describe("unit prices: packs compared apart", () => {
  const pack = (name: string, unit: string, price: number, cpv = "15000000-8") => {
    const c = classifyPriceLine(name, cpv, unit, price);
    return c ? `${c.pack}:${c.status}${c.status === "ok" ? `:${Math.round(c.pricePerUnit! * 100) / 100}` : ""}` : null;
  };
  it("puts a piece in the pack its size fits, one piece of a multipack", () => {
    expect(pack("APA PLATA BORSEC 0.33L STICLA", "bucata", 2.97)).toBe("mica:ok:9");
    expect(pack("Apa minerala 2L", "bucata", 1.2)).toBe("medie:ok:0.6");
    // a box of six priced as one bottle is no 2 l bottle's price
    expect(pack("APA MINERALA 2L 6BUC/BAX", "bucata", 15)).toBe("medie:out_of_range");
    expect(pack("Unt portionat 10gr", "buc", 0.89)).toBe("portii:ok:89");
    expect(pack("unt jagher 250g", "kg", 13)).toBe("calup:ok:52");
    expect(pack("Telemea de vaca", "kilogram", 36.24)).toBe("vrac:ok:36.24");
    expect(pack("TELEMEA HOCHLAND 350 GR", "bucata", 18.35)).toBe("ambalata:ok:52.43");
  });
  it("keeps apart a line of a split family that names no pack, and leaves other families unsplit", () => {
    expect(pack("Sapun lichid", "litru", 9.5, "33711900-6")).toBe(":no_pack");
    expect(pack("Cascaval calup Dalia 2kg", "kg", 41)).toBe(":ok:41");
  });
});

describe("unit prices: reading the measure", () => {
  it("reads sizes in kg, litres, pieces and sheets, with multipacks", () => {
    expect(sizesIn("PAINE TAVA 0,600 KG").kg).toEqual([0.6]);
    expect(sizesIn("Paine  cu cartof feliat 1500 g").kg).toEqual([1.5]);
    expect(sizesIn("aro Orez Bob Lung 6 x 1 Kg").kg).toEqual([6]);
    expect(sizesIn("Unt 65% cutie 8 buc * 15 g").kg).toEqual([0.12]);
    expect(sizesIn("Lapte semidegresat UHT 1.5% gr. 1000ml VIO").l).toEqual([1]);
    expect(sizesIn("OUA CONSUM 30BUC/COFRAJ").n).toEqual([30]);
    expect(sizesIn("OUA CONSUM 30/cofrag").n).toEqual([30]);
    expect(sizesIn("Hartie xerox A4 80g/m2 500 coli/top").sheets).toEqual([500]);
    // grams per square metre and fat percentages are not sizes
    expect(sizesIn("Hartie copiator A4 80g/mp").kg).toEqual([]);
    expect(sizesIn("LAPTE 3.5%GR").kg).toEqual([]);
  });

  it("trusts the unit written when it is the family's measure", () => {
    expect(per("cartofi 10kg/sac", "kg", 1.92)).toBe(1.92);
    expect(per("Lapte semidegresat UHT 1.5% gr. 1000ml VIO", "litru", 7.93)).toBe(7.93);
    expect(per("Lemn de foc", "metru cub", 565, "03413000-8")).toBe(565);
  });

  it("reads a piece's size from its name", () => {
    expect(per("FRANZELA 600 GR", "bucata", 3.7)).toBe(6.17);
    expect(per("LAPTE UHT POIANA FLORILOR 1.5% 1 L", "bucata", 5)).toBe(5);
    expect(per("Paine alba  1.0 kg", "buc", 6.49)).toBe(6.49);
    expect(per("Unt 65% cutie 8 buc * 15 g", "bucata", 7.25)).toBe(60.42);
  });

  it("reads a pack only when it says how many pieces it holds", () => {
    expect(per("ZAHAR HAJDUSA 1KG 10BUC/TIPLA", "tipla", 34.87)).toBe(3.49);
    expect(per("Faina 1kg", "bax", 24.9)).toBe("no_size");
    expect(per("OUA CONSUM 30BUC/COFRAJ", "cofraj", 24.77)).toBe(0.83);
    expect(per("Oua", "pachet", 264.26)).toBe("no_size");
    // a container sold whole: the size written is the container's
    expect(per("Inalbitor clor Cloret 5litri", "bidon", 18.5, "39831000-6")).toBe(3.7);
    // a unit text with its own size
    expect(per("MANUSI DE EXAMINARE NITRIL ALBASTRU", "cutia / 100 buc", 8.47, "33141420-0")).toBe(0.08);
    expect(per("Sapun lichid  500 ml pompita", "500 ml", 8.99, "33711900-6")).toBe(17.98);
  });

  it("uses the name's size only when the unit gives a price the product cannot have", () => {
    // „unt 250g” priced at 13 lei „per kg” is a 250 g piece
    expect(per("unt jagher 250g", "kg", 13)).toBe(52);
    // a 2 kg block priced per kg stays per kg
    expect(per("Cascaval calup Dalia 2kg", "kg", 41)).toBe(41);
    // a set of 10 rolls priced „per bucată”
    expect(per("HARTIE IGIENICA PERFEX 10 ROLE/SET", "BUC", 7.23, "33761000-2")).toBe(0.72);
    expect(per("HARTIE IGIENICA BAX DE 10 ROLE", "bucata", 4.99, "33761000-2")).toBe(0.5);
    // bread priced per gram is a 300 g loaf
    expect(per("PAINE alba 300 G", "g", 1.66)).toBe(5.53);
  });

  it("keeps apart a line no reading makes plausible, and leaves out what has no size", () => {
    expect(line("OUA", "bucata", 40.82)?.status).toBe("out_of_range");
    expect(line("ZAHAR", "kg", 57.01)?.status).toBe("out_of_range");
    expect(line("LAPTE UHT 3,5%", "buc", 9.95)?.status).toBe("no_size");
    expect(line("Paine 400 g 500 g", "bucata", 3)?.status).toBe("two_sizes");
    expect(line("FRANZELA 600 GR", "bucata", 0)?.status).toBe("no_size");
  });

  it("says how a measure was read", () => {
    const paine = priceFamilyBySlug("paine")!;
    const r = measureReadings(paine, "FRANZELA 600 GR", "bucata");
    expect(Array.isArray(r) && measureNote(paine, r[0]!)).toBe("600 g, din denumire");
    const kg = measureReadings(paine, "Paine", "kg");
    expect(Array.isArray(kg) && measureNote(paine, kg[0]!)).toBe("");
    const ster = priceFamilyBySlug("lemne-foc-ster")!;
    const s = measureReadings(ster, "Lemn foc", "mst");
    expect(Array.isArray(s) && measureNote(ster, s[0]!)).toBe("");
  });
});
