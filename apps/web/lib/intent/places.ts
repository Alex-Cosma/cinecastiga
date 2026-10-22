import catalog from "../reference/population-rpl2021.json";
import { COUNTIES } from "../counties";
import { fold, titleCase } from "./text";
import type { LocalityTip, PlaceEntry } from "./types";

/**
 * The place gazetteer: 41 counties + București, every locality (UAT) of
 * reference.uat and the six București sectors. Display names come from the
 * official RPL 2021 catalog (with diacritics) when the SIRUTA code is there.
 */

/** Folded, punctuation-free key: "Bistrița-Năsăud" → "bistrita nasaud". */
export function placeKey(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    // two bounded legacy spellings, as in peer-population
    .replace(/\btirgu\b/g, "targu")
    .replace(/\brimnicu\b/g, "ramnicu");
}

const COUNTY_BY_KEY = new Map(COUNTIES.map((name) => [placeKey(name), name]));

/** County display name for any folded/registry spelling ("caras severin" → "Caraș-Severin"). */
export function countyDisplay(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = placeKey(name).replace(/^municipiul /, "");
  return COUNTY_BY_KEY.get(key) ?? null;
}

const catalogBySiruta = new Map(catalog.units.map((unit) => [unit.siruta, unit]));

const TIP_BY_CODE: Record<string, LocalityTip> = { "1": "municipiu", "4": "municipiu", "9": "municipiu", "2": "oraș", "3": "comună" };

const PREFIX = /^(municipiul|municipiu|orasul|oras|comuna)\s+/;

export interface UatSource {
  siruta: number;
  name: string;
  tip: string | null;
  county: string | null;
}

function localityName(tip: LocalityTip, bare: string): string {
  if (tip === "municipiu") return `Municipiul ${bare}`;
  if (tip === "oraș") return `Orașul ${bare}`;
  if (tip === "sector") return bare;
  return `Comuna ${bare}`;
}

export function buildPlaces(uats: UatSource[]): PlaceEntry[] {
  const out: PlaceEntry[] = COUNTIES.map((county) => ({
    kind: "county" as const,
    key: placeKey(county),
    county,
    name: county === "București" ? "București" : `Județul ${county}`,
    label: county === "București" ? "București (tot municipiul)" : `Județul ${county}`,
  }));
  for (const uat of uats) {
    const county = countyDisplay(uat.county);
    if (!county) continue;
    const tip = TIP_BY_CODE[String(uat.tip ?? "")] ?? "comună";
    const official = catalogBySiruta.get(uat.siruta);
    const registry = official?.name ?? uat.name;
    const bare = titleCase(registry.replace(/^\s*(MUNICIPIUL|ORAȘ|ORAŞ|ORAS|ORASUL|ORAȘUL|COMUNA)\s+/i, "").trim());
    const name = localityName(tip, bare);
    out.push({
      kind: "locality",
      key: placeKey(bare).replace(PREFIX, ""),
      county,
      siruta: uat.siruta,
      tip,
      name,
      label: county === "București" ? name : `${name} (${county})`,
      population: official?.population ?? null,
    });
  }
  // București sectors are not in reference.uat (owner decision F05).
  for (const unit of catalog.units) {
    const m = unit.kind === "sector" ? /SECTORUL ([1-6])$/.exec(unit.name) : null;
    if (!m) continue;
    out.push({
      kind: "locality",
      key: `sectorul ${m[1]}`,
      county: "București",
      siruta: unit.siruta,
      tip: "sector",
      name: `Sectorul ${m[1]}`,
      label: `Sectorul ${m[1]} (București)`,
      population: unit.population,
    });
  }
  return out;
}

/** Every RPL 2021 unit as a reference.uat row — the gazetteer used by unit tests. */
export function catalogUatSource(): UatSource[] {
  const tip: Record<string, string> = { municipality: "4", city: "2", commune: "3" };
  return catalog.units
    .filter((unit) => unit.kind !== "sector")
    .map((unit) => ({ siruta: unit.siruta, name: unit.name, tip: tip[unit.kind] ?? "3", county: unit.countyKey }));
}
