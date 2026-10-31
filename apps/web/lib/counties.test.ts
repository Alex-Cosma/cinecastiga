import { describe, expect, it } from "vitest";
import { COUNTIES, countyKnown, countyName } from "./counties";
import { countyDisplay } from "./ask/resolved-spec";
import { countyDisplay as peerCounty } from "./ask/peer-groups-shared";
import { countyOfFolded } from "./ask/facet-parts";

/*
 * The one display map of the 42 counties (S6, S3L/F4s-county-spelling): what the data writes, as the pages spell it.
 * The three older helpers read the same map.
 */

describe("a county as the pages spell it", () => {
  it("spells every county of the data with its diacritics, comma below", () => {
    const data = ["Bucuresti", "Municipiul Bucuresti", "BUZAU", "Timis", "Timiş", "Dambovita", "Bistrita-Nasaud", "Caras-Severin", "Satu Mare", "Valcea", "Iasi"];
    expect(data.map(countyName)).toEqual(["București", "București", "Buzău", "Timiș", "Timiș", "Dâmbovița", "Bistrița-Năsăud", "Caraș-Severin", "Satu Mare", "Vâlcea", "Iași"]);
    expect(COUNTIES).toHaveLength(42);
    for (const name of COUNTIES) expect(countyName(name.normalize("NFD").replace(/[̀-ͯ]/g, ""))).toBe(name);
    expect(COUNTIES.join("")).not.toMatch(/[şţŞŢ]/);
  });

  it("keeps what is no county as it came, and nothing as nothing", () => {
    expect([countyName("Străinătate"), countyName("Necunoscut"), countyName(null), countyName(undefined), countyName("")]).toEqual(["Străinătate", "Necunoscut", null, undefined, ""]);
    expect(countyKnown("Necunoscut")).toBeNull();
  });

  it("is the map the older helpers read", () => {
    for (const raw of ["Bucuresti", "Mures", "Arges"]) expect([countyDisplay(raw), peerCounty(raw), countyOfFolded(raw)]).toEqual(Array(3).fill(countyName(raw)));
    expect([countyDisplay("Necunoscut"), peerCounty("Necunoscut"), countyOfFolded("Necunoscut")]).toEqual(["Necunoscut", null, null]);
  });
});
