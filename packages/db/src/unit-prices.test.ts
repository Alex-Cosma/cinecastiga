import { describe, expect, it } from "vitest";
import { LEAD_MIN_AWARDS, LEAD_MIN_BUYERS, LEAD_MIN_EXCESS, LEAD_MIN_RATIO, PARKED_PRICE_FAMILIES, PRICE_FAMILIES, classifyPriceLine, measureNote, measureReadings, packOf, priceFamilyBySlug, sizesIn } from "./unit-prices.js";

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
    expect(line("HARTIE PHOTO A4 100 COLI/TOP", "TOP", 10, "30197630-1")).toBeNull();
    expect(line("HARTIE SCRIS A4 60GR 1000 COLI/TOP", "top", 49.5, "30197630-1")).toBeNull();
    expect(line("PAINE VEL P.FR.TOAST 600 G", "BUC", 9.17)).toBeNull();
    expect(line("SAPUN LICHID DEZINFECTANT- PRESTISEPT (PRESTIMAIN )", "litru", 49.99, "33711900-6")).toBeNull();
    expect(line("Pulpa dez.pui", "kg", 18.5)).toBeNull();
    expect(line("mere rase 680g", "bucata", 9)).toBeNull();
  });

  it("parks the families the audit of 11 November 2026 found not comparable, with their definitions kept", () => {
    const parked = PARKED_PRICE_FAMILIES.map((f) => f.slug);
    expect(parked).toEqual(["inalbitor", "hartie-igienica-3", "hartie-igienica", "manusi-examinare", "lemne-foc-mc", "lemne-foc-ster"]);
    for (const slug of parked) expect(priceFamilyBySlug(slug), slug).toBeNull();
    expect(line("Lemn de foc", "metru cub", 565, "03413000-8")).toBeNull();
    expect(line("Clor 1L", "bucata", 2.1, "39831000-6")).toBeNull();
    expect(line("HARTIE IGIENICA PERFEX 10 ROLE/SET", "BUC", 7.23, "33761000-2")).toBeNull();
    expect(line("Manusi latex examinare 100 buc/cutie", "cutie", 14, "33141420-0")).toBeNull();
    // one pack of a family: branded pump bottles of liquid soap
    expect(line("Sapun lichid 300ML cu pompita PROTEX", "buc", 13.48, "33711900-6")).toBeNull();
    expect(line("Sapun lichid 5L", "bucata", 18, "33711900-6")?.pack).toBe("bidon");
  });

  it("states the lead rule the builder applies", () => {
    expect([LEAD_MIN_RATIO, LEAD_MIN_AWARDS, LEAD_MIN_EXCESS, LEAD_MIN_BUYERS]).toEqual([2, 2, 500, 20]);
  });

  it("leaves out the other products the audit read under the same word", () => {
    const out: [string, string, number, string?][] = [
      ["ZAHAR.RAHAT MENTA 140G", "bucata", 1.88], ["ZAHAR Gold Mocca 4gr / 300buc", "cut", 16.2], ["Zahar farin Dr.Oetker 80gr", "kg", 1.2],
      ["ZAHAR MARGARITAR ZH.BR.200X5G ST.", "bucata", 13.48], ["ZAHAR   AMBALAT  LA  5 GR.", "BUC DE 5 GR.", 0.07],
      ["Piept pui Caroli", "kg", 41.28], ["piept pui cu piele si os", "kg", 12.5], ["Carne pui", "kg", 15],
      ["SARE FINISF 1,500 GR. MASINA DE SPALT VASE", "BUC", 9.17], ["SARE GEMA 25KG, MARAR ,CIMBRU", "PACHET", 281.6], ["sare mare pt dezapezire", "kg", 2.41],
      ["ROSII PASATE CIRIO 720 GR", "BUC", 15.14], ["ROSII CHERI", "kg", 15], ["castraveti 3-6 cm 680 gr", "bucata", 11.93], ["castraveti cornisori fabio", "kg", 8.26],
      ["ardei dulce tocat 200gr univer", "bucata", 5.41], ["ARDEI CAPIA IMPORT", "KG", 7.34], ["Ardei iuti 350g", "buc", 6.78], ["ARDEI ROSU IMPORT", "kg", 25.69],
      ["Fasole rosie 400g", "bucata", 7.61], ["Fasole batuta", "kilogram", 21], ["OREZ BASMATIC 500GR", "BUC", 12.05], ["Pâine fără gluten 0.3 kg", "bucata", 5.35],
      ["Paine ardeleneasca cu seminte 500 grame fabricata manual", "bucata", 4.5], ["Taitei orez 300g", "bucata", 9.63], ["Spaghete Barilla 500g", "Buc", 10.09],
      ["Lamai verzi", "kg", 20], ["CEAPA ARPAGIC STUTTGARTER KG", "kg", 10], ["CARTOFI POMMES NOISETTES", "kg", 8.67], ["Cartofi noi, calitatea I", "kilogram", 5.97],
      ["VARZA NOUA RO", "kg", 4.12], ["Lapte fara lactoza", "litrul", 9.17], ["IAURT OLYMPUS 150GR", "bucata", 5.04], ["IAURT  DANNONE 50GR", "bucata", 1.6],
      ["apa plata 18,9L", "bucata", 15], ["APA PLATA BORSEC 0.33L STICLA", "bucata", 2.97], ["Muschi file de porc - mezel", "kg", 45], ["CARNE PORC SCANDIA 300GR", "bucata", 11.25],
      ["PULPE PUI INTREGI CU SPATE", "kg", 6], ["pulpe pui sup.f.os f.p.tv", "kg", 18.5], ["UNT PRESIDENT 200 GR", "bucata", 22.93], ["Unt Lurpak tartinabil ,caserola 10gx100buc", "kilogram", 33.9],
      ["OUA FIERTE SI VOPSITE IN DIFERITE CULORI", "bucata", 1.5], ["Telemea Capra Huedin 350g", "bucata", 23], ["cascaval ras 500g", "bucata", 20],
      ["Ulei de Floarea Soarelui Presat la Rece Elixir, 1L", "bucata", 18.89],
    ];
    for (const [name, unit, price] of out) expect(line(name, unit, price), name).toBeNull();
    const other: [string, string, number, string][] = [
      ["Detergent lichid profesional pt masini de spalat vase 5 L.", "bucata", 120, "39831200-8"], ["Detergent vase Virto INOX 750 ml", "bucata", 18, "39831200-8"],
      ["HARTIE XEROX A4 90gr/m2 COLOTECH", "TOP", 35, "30197630-1"], ["Hartie autocolanta alba A4", "top", 34.6, "30197630-1"],
      ["HARTIE COPIATOR A4 200GR/MP 250COLI CANON HIGH GRAD", "top", 34.55, "30197630-1"], ["Hartie A4 UPM DIGI Finesse Gloss 170 g/mp, 250 coli/top", "top", 34, "30197630-1"],
      ["Manusi Sensor gri, nylon+nitril palma, sensibilitate tactila, 25 cm", "per", 1.49, "33141420-0"], ["Manusi nitril", "perechi", 2, "33141420-0"],
      ["BENZINA AVGAS 100 LL", "L", 7.48, "09132000-3"], ["SAPUN LICHID DESCOSOFT 1L", "flacon", 29.42, "33711900-6"],
    ];
    for (const [name, unit, price, cpv] of other) expect(line(name, unit, price, cpv), name).toBeNull();
    // what stays
    expect(line("Hartie copiator A4 80g/mp 500 coli/top", "top", 12, "30197630-1")?.status).toBe("ok");
    expect(line("MANUSI DE EXAMINARE DIN NITRIL  -  ANSELL", "bucata", 0.3, "33141420-0")?.status).toBe("ok");
    expect(line("Manusi examinare nitril", "perechi", 0.3, "33141420-0")?.status).toBe("ok");
    expect(line("Manusi unica folosinta nitryl S,M,L 100 bucati/cutie", "cutie", 14, "33141420-0")?.family).toBe("manusi-nitril");
    expect(line("Zahar tos 1 kg", "buc", 2.9)?.status).toBe("ok");
    expect(line("piept pui fara os si piele", "kg", 18)?.status).toBe("ok");
  });
});

describe("unit prices: packs compared apart", () => {
  const pack = (name: string, unit: string, price: number, cpv = "15000000-8") => {
    const c = classifyPriceLine(name, cpv, unit, price);
    return c ? `${c.pack}:${c.status}${c.status === "ok" ? `:${Math.round(c.pricePerUnit! * 100) / 100}` : ""}` : null;
  };
  it("puts a piece in the pack its size fits, one piece of a multipack", () => {
    expect(pack("APA PLATA 0.5L", "bucata", 1.5)).toBe("mica:ok:3");
    expect(pack("Apa minerala 2L", "bucata", 1.2)).toBe("medie:ok:0.6");
    // a 2,75 l bottle is no can of 3 l or more
    expect(pack("Apa minerala 2,75 l", "bucata", 2.2)).toBe("medie:ok:0.8");
    expect(pack("Apa plata 5L", "bucata", 4)).toBe("bidon:ok:0.8");
    // a case of six priced „per bucată”: one bottle or the case, the text cannot say
    expect(pack("APA MINERALA 2L 6BUC/BAX", "bucata", 15)).toBe("medie:ambiguous");
    expect(pack("Unt portionat 10gr", "buc", 0.89)).toBe("portii:ok:89");
    expect(pack("unt jagher 250g", "bucata", 13)).toBe("calup:ok:52");
    expect(pack("Telemea de vaca", "kilogram", 36.24)).toBe("vrac:ok:36.24");
    expect(pack("TELEMEA HOCHLAND 350 GR", "bucata", 18.35)).toBe("ambalata:ok:52.43");
  });
  it("keeps apart a line of a split family that names no pack, and leaves other families unsplit", () => {
    expect(pack("Sapun lichid", "litru", 9.5, "33711900-6")).toBe(":no_pack");
    expect(pack("Sapun lichid 2,5 l", "bucata", 20, "33711900-6")).toBe("litru:ok:8");
    expect(pack("Faina alba 1kg", "bucata", 2.4)).toBe(":ok:2.4");
  });
  it("names no pack for two sizes or for a name that says it is no bulk", () => {
    const unt = priceFamilyBySlug("unt")!;
    expect(packOf(unt, "unt portionat 10gr; 15gr; 20gr;", "kilogram")).toBeNull();
    expect(packOf(unt, "UNT PORTIONAT", "kilogram")).toBeNull();
    expect(packOf(unt, "unt aprox.200g", "kilogram")).toBe("calup");
    expect(packOf(unt, "Unt 82%", "kg")).toBe("vrac");
  });
  it("compares small bags apart from bulk in pasta, cheese, yogurt, dish soap and rubbing alcohol", () => {
    expect(pack("Macaroane 500g", "bucata", 3)).toBe("ambalat:ok:6");
    expect(pack("Paste fainoase", "kg", 5.9)).toBe("vrac:ok:5.9");
    expect(pack("Cascaval Dalia 450g", "bucata", 13)).toBe("ambalat:ok:28.89");
    expect(pack("Iaurt natural 140 gr", "bucata", 1.2)).toBe("pahar:ok:8.57");
    expect(pack("Iaurt 900g", "bucata", 6)).toBe("mare:ok:6.67");
    expect(pack("Detergent vase 5L", "bucata", 18, "39831200-8")).toBe("bidon:ok:3.6");
    expect(pack("Alcool sanitar 200 ml", "bucata", 4, "33631600-8")).toBe("mic:ok:20");
    expect(pack("Alcool sanitar 500ml", "bucata", 4.5, "33631600-8")).toBe("litru:ok:9");
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
    expect(per("Motorina", "litru", 4.85, "09134200-9")).toBe(4.85);
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
    expect(per("Sapun lichid Cloret 5litri", "bidon", 18.5, "33711900-6")).toBe(3.7);
    // a unit text with its own size
    expect(per("MANUSI DE EXAMINARE NITRIL ALBASTRU", "cutia / 100 buc", 8.47, "33141420-0")).toBe(0.08);
    expect(per("Detergent vase 500 ml", "500 ml", 4.5, "39831200-8")).toBe(9);
  });

  it("uses the name's size only when the unit's price is far from anything the product can cost", () => {
    // a box of 100 gloves priced „per bucată”
    expect(per("Manusi nitril 100 buc/cut", "bucata", 20.94, "33141420-0")).toBe(0.21);
    // bread priced per gram is a 300 g loaf
    expect(per("PAINE alba 300 G", "g", 1.66)).toBe(5.53);
    // a near miss of the unit's own price is an odd price, never multiplied by the name's size
    expect(line("cascaval penteleu unicarm 200gr", "kilogram", 11.5)?.status).toBe("out_of_range");
    expect(line("unt jagher 250g", "kg", 13)?.status).toBe("out_of_range");
  });

  it("keeps out a line whose unit and name give two plausible prices", () => {
    // 59,40 lei: a 3 kg bucket (19,80 lei/kg) or a dear kilogram
    expect(line("Telemea de vaca 3 kg", "kilogram", 59.4)?.status).toBe("ambiguous");
    expect(line("Sapun lichid pentru piele normala - NAUTIC - x 5 L", "litru", 18, "33711900-6")?.status).toBe("ambiguous");
    expect(line("SMANTANA 5 KG 12%", "kilogram", 44.56)?.status).toBe("ambiguous");
    expect(line("Cascaval calup Dalia 2kg", "kg", 41)?.status).toBe("ambiguous");
    // the larger container's price falls just under the floor: still undecidable
    expect(line("PORTOCALE PLASA 5 KG", "KG", 9.5)?.status).toBe("ambiguous");
    // the name's reading is far from any price: the unit stands
    expect(per("cartofi 10kg/sac", "kg", 1.92)).toBe(1.92);
    expect(per("sare 25 kg", "kg", 1.1)).toBe(1.1);
  });

  it("never divides a price in another kind of unit by the name's size", () => {
    expect(line("Lapte 1 l", "kg", 4)?.status).toBe("unit_kind");
    expect(line("Paine 500 g", "litru", 2)?.status).toBe("unit_kind");
    expect(line("Orez Deroni Original 1kg cal II", "perechi", 36.88)?.status).toBe("unit_kind");
    expect(line("Zahar 1 kg", "top", 3)?.status).toBe("unit_kind");
  });

  it("reads the sizes the audit found misread", () => {
    expect(sizesIn("HARTIE IGIENICA ALINT 8+2 ROLE").n).toEqual([10]);
    expect(sizesIn("Zewa Deluxe pachet promo 2x20 role").n).toEqual([40]);
    expect(sizesIn("CARTOFI ALBI RO BUC.5KG CI").kg).toEqual([5]);
    expect(sizesIn("unt aprox.200g").kg).toEqual([0.2]);
    expect(sizesIn("apa plata 1/2 litri").l).toEqual([0.5]);
    expect(sizesIn("detergent lichid vase economic manual 4/5l").l).toEqual([]);
    expect(sizesIn("Paine 500 g/buc").kg).toEqual([0.5]);
    expect(sizesIn("Apa plata 2 l/sticla").l).toEqual([2]);
    expect(sizesIn("Hartie copiator A4 80 g/mp").kg).toEqual([]);
    expect(sizesIn("Unt Lurpak caserola 10gx100buc").kg).toEqual([1]);
    expect(sizesIn("DETERGENT VASE 1 L/ DETRGENT VASE EXO 450 ML").l).toEqual([1, 0.45]);
    expect(sizesIn("hartie igienica set 3 straturi").n).toEqual([]);
    expect(sizesIn("PASTE FIDEA CUIBURI 8 OUA 200G").n).toEqual([]);
    expect(sizesIn("OUA 30 oua").eggs).toEqual([30]);
  });

  it("does not guess between a piece and a case, nor multiply a multipack twice", () => {
    expect(line("ULEI Surasul Soarelui 1l / 6buc", "buc", 24.11)?.status).toBe("ambiguous");
    expect(per("PASTE FIDEA CUIBURI 8 OUA 200G", "bucata", 2.95)).toBe(14.75);
    // „10 g x 100 buc” in a box is one kilogram, not a hundred
    expect(per("Unt 82% 10 g x 100 buc", "cutie", 60)).toBe(60);
    expect(per("ZAHAR HAJDUSA 1KG 10BUC/TIPLA", "tipla", 34.87)).toBe(3.49);
    expect(line("Faina 1 kg bax 0 buc", "bax", 20)?.status).toBe("no_size");
    expect(per("OUA CONSUM 30/cofrag", "cofraj", 15)).toBe(0.5);
    // a price pasted into the unit
    expect(line("cartofi", "2.29kilogram", 2.29)?.status).toBe("unit_kind");
  });

  it("keeps apart a line no reading makes plausible, and leaves out what has no size", () => {
    expect(line("OUA", "bucata", 40.82)?.status).toBe("out_of_range");
    expect(line("ZAHAR", "kg", 57.01)?.status).toBe("out_of_range");
    // floors below the real spread: fuel at 4,60 lei/l and oil at 4,30 are compared
    expect(per("Benzina", "litru", 4.6, "09132000-3")).toBe(4.6);
    expect(per("Ulei floarea soarelui", "litru", 4.3)).toBe(4.3);
    expect(per("Zahar", "kg", 2.2)).toBe(2.2);
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
  });
});
