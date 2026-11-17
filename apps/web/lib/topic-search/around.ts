/*
 * The places around a place, for the place's word in „Am înțeles” on /cauta (owner, 17 November 2026: opened on
 * `/cauta?q=Cluj`, „județul Cluj” offered only „Caută „Cluj” în toată țara”, „as if the user made a mistake”; chosen:
 * „varianta B”, ready suggestions). For a county: its largest localities and the counties beside it. For a locality:
 * its whole county and the other large localities of that county. Pure: the server reads the rows.
 */
import { COUNTIES, countyKnown } from '../counties';
import { fold, type Place } from './shared';
import { localPlace, type UatRow } from './places';

/**
 * The counties each county borders, computed from the map's own outlines (public/geo/romania.json: outlines that run
 * together for more than 4 px of the 1000 px map; agents-work/cauta-place-menu-20261117/neighbours.mjs), not written
 * from memory. Symmetric; București borders only Ilfov.
 */
export const COUNTY_NEIGHBOURS: Record<string, string[]> = {
  'Alba': ['Arad', 'Bihor', 'Cluj', 'Hunedoara', 'Mureș', 'Sibiu', 'Vâlcea'],
  'Arad': ['Alba', 'Bihor', 'Hunedoara', 'Timiș'],
  'Argeș': ['Brașov', 'Dâmbovița', 'Olt', 'Sibiu', 'Teleorman', 'Vâlcea'],
  'Bacău': ['Covasna', 'Harghita', 'Neamț', 'Vaslui', 'Vrancea'],
  'Bihor': ['Alba', 'Arad', 'Cluj', 'Satu Mare', 'Sălaj'],
  'Bistrița-Năsăud': ['Cluj', 'Maramureș', 'Mureș', 'Suceava'],
  'Botoșani': ['Iași', 'Suceava'],
  'Brașov': ['Argeș', 'Buzău', 'Covasna', 'Dâmbovița', 'Harghita', 'Mureș', 'Prahova', 'Sibiu'],
  'Brăila': ['Buzău', 'Constanța', 'Galați', 'Ialomița', 'Tulcea', 'Vrancea'],
  'București': ['Ilfov'],
  'Buzău': ['Brașov', 'Brăila', 'Covasna', 'Ialomița', 'Prahova', 'Vrancea'],
  'Caraș-Severin': ['Gorj', 'Hunedoara', 'Mehedinți', 'Timiș'],
  'Călărași': ['Constanța', 'Giurgiu', 'Ialomița', 'Ilfov'],
  'Cluj': ['Alba', 'Bihor', 'Bistrița-Năsăud', 'Maramureș', 'Mureș', 'Sălaj'],
  'Constanța': ['Brăila', 'Călărași', 'Ialomița', 'Tulcea'],
  'Covasna': ['Bacău', 'Brașov', 'Buzău', 'Harghita', 'Vrancea'],
  'Dâmbovița': ['Argeș', 'Brașov', 'Giurgiu', 'Ilfov', 'Prahova', 'Teleorman'],
  'Dolj': ['Gorj', 'Mehedinți', 'Olt', 'Vâlcea'],
  'Galați': ['Brăila', 'Tulcea', 'Vaslui', 'Vrancea'],
  'Giurgiu': ['Călărași', 'Dâmbovița', 'Ilfov', 'Teleorman'],
  'Gorj': ['Caraș-Severin', 'Dolj', 'Hunedoara', 'Mehedinți', 'Vâlcea'],
  'Harghita': ['Bacău', 'Brașov', 'Covasna', 'Mureș', 'Neamț', 'Suceava'],
  'Hunedoara': ['Alba', 'Arad', 'Caraș-Severin', 'Gorj', 'Timiș', 'Vâlcea'],
  'Ialomița': ['Brăila', 'Buzău', 'Călărași', 'Constanța', 'Ilfov', 'Prahova'],
  'Iași': ['Botoșani', 'Neamț', 'Suceava', 'Vaslui'],
  'Ilfov': ['București', 'Călărași', 'Dâmbovița', 'Giurgiu', 'Ialomița', 'Prahova'],
  'Maramureș': ['Bistrița-Năsăud', 'Cluj', 'Satu Mare', 'Sălaj', 'Suceava'],
  'Mehedinți': ['Caraș-Severin', 'Dolj', 'Gorj'],
  'Mureș': ['Alba', 'Bistrița-Năsăud', 'Brașov', 'Cluj', 'Harghita', 'Sibiu', 'Suceava'],
  'Neamț': ['Bacău', 'Harghita', 'Iași', 'Suceava', 'Vaslui'],
  'Olt': ['Argeș', 'Dolj', 'Teleorman', 'Vâlcea'],
  'Prahova': ['Brașov', 'Buzău', 'Dâmbovița', 'Ialomița', 'Ilfov'],
  'Satu Mare': ['Bihor', 'Maramureș', 'Sălaj'],
  'Sălaj': ['Bihor', 'Cluj', 'Maramureș', 'Satu Mare'],
  'Sibiu': ['Alba', 'Argeș', 'Brașov', 'Mureș', 'Vâlcea'],
  'Suceava': ['Bistrița-Năsăud', 'Botoșani', 'Harghita', 'Iași', 'Maramureș', 'Mureș', 'Neamț'],
  'Teleorman': ['Argeș', 'Dâmbovița', 'Giurgiu', 'Olt'],
  'Timiș': ['Arad', 'Caraș-Severin', 'Hunedoara'],
  'Tulcea': ['Brăila', 'Constanța', 'Galați'],
  'Vaslui': ['Bacău', 'Galați', 'Iași', 'Neamț', 'Vrancea'],
  'Vâlcea': ['Alba', 'Argeș', 'Dolj', 'Gorj', 'Hunedoara', 'Olt', 'Sibiu'],
  'Vrancea': ['Bacău', 'Brăila', 'Buzău', 'Covasna', 'Galați', 'Vaslui'],
};

/** A county as a /cauta place, as the place search gives it (lib/topic-search/server `countyPlaces`). */
export const countyPlace = (name: string): Place => ({ id: `county:${fold(name)}`, name, detail: name === 'București' ? 'Municipiul București' : 'Județ', kind: 'county' });

/** What lies around a place: the county it is in, the largest localities of that county, the counties beside it. */
export interface PlaceAround {
  /** The county the place is, or is in (display spelling). */
  county: string;
  /** For a locality: its whole county. */
  wider: Place | null;
  /** The largest localities of the county, the place itself left out. */
  inside: Place[];
  /** For a county: the counties it borders, in alphabetical order. */
  neighbours: Place[];
}

/**
 * The places around `placeId` („county:cluj”, „uat:55259”). `rows` are the registry's localities; a locality the rows
 * do not hold gives null. București has no localities to narrow to (its sectors are no /cauta place).
 */
export function placesAround(placeId: string, rows: readonly UatRow[], max = 6): PlaceAround | null {
  const isCounty = placeId.startsWith('county:');
  const own = isCounty ? null : rows.find((r) => `uat:${r.siruta}` === placeId);
  const county = isCounty ? COUNTIES.find((c) => `county:${fold(c)}` === placeId) : countyKnown(own?.county);
  if (!county) return null;
  const inside = county === 'București' ? [] : rows
    .filter((r) => countyKnown(r.county) === county && r !== own)
    .sort((a, b) => (Number(b.population ?? 0) || 0) - (Number(a.population ?? 0) || 0) || Number(a.siruta) - Number(b.siruta))
    .slice(0, max).map(localPlace);
  return {
    county,
    wider: isCounty ? null : countyPlace(county),
    inside,
    neighbours: isCounty ? (COUNTY_NEIGHBOURS[county] ?? []).map(countyPlace) : [],
  };
}
