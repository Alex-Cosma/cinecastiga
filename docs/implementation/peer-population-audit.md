# Population reference audit and reproducible catalog

20 September 2026. Main PostgreSQL was inspected read-only. No procurement, auth, reference, or mart rows were changed. This audit supports the user-approved replacement of purchase-count matching with population for local administrations, plus manual peer selection. Whether communes belong in the automatic city cohort is a product decision outside this audit.

## Result

The existing population values must **not** be presented as RPL 2021. For example, `reference.uat` and the Buzău authority mapping contain **115,494**, which is the 2011 figure; the official 2021 total is **103,481**. Other existing values, including Cluj-Napoca 324,576 and Timișoara 319,279, also reflect 2011. The comment in `packages/db/src/schema/marts.ts` calling this population “2021” is not supported by the stored data. No original import script, source year, source URL, or source hash was found for these tables.

An independent versioned 2021 catalog is now available at `apps/web/lib/reference/population-rpl2021.json`. It does not modify the old reference tables or existing per-capita views.

## Official source and reproduction

- Publisher: Institutul Național de Statistică, RPL 2021 definitive results.
- Discovery page: [Rezultate definitive RPL 2021](https://www.recensamantromania.ro/rezultate-rpl-2021/rezultate-definitive/).
- Exact workbook: [Table 1.22](https://www.recensamantromania.ro/wp-content/uploads/2023/05/Tabel-1.22.xlsx).
- Measure: resident population on **1 December 2021**, not population by registered domicile and not an estimate for the procurement year.
- Workbook sheet: `TAB 1.22_RPL2021`; total population in column D.
- Download size: 810,548 bytes; fetched 20 September 2026.
- SHA256: `3f866efe829107bc42f804889197e884c394b8a1e8d4ee58d67c522e5379f983`.

`packages/db/scripts/parse-population-rpl2021.py` uses Python's standard library. It downloads the official workbook, checks the pinned hash, extracts the source rows and verifies geographic totals. A changed workbook fails until the new source has been reviewed.

```sh
python3 packages/db/scripts/parse-population-rpl2021.py --check
```

For an already downloaded workbook:

```sh
python3 packages/db/scripts/parse-population-rpl2021.py --input /path/to/Tabel-1.22.xlsx --check
```

Omitting `--check` writes the versioned JSON. No database connection is used. Verification passed against the downloaded workbook and reproduced the generated JSON exactly.

## Catalog contract

```ts
{
  version: "ins-rpl-2021-table-1.22-v1",
  referenceDate: "2021-12-01",
  measure: "resident_population",
  nationalPopulation: 19053815,
  source: { url, sha256, sheet, table: "1.22", title, totalColumn: "D" },
  units: Array<{
    siruta: number, name: string, county: string, countyKey: string,
    kind: "municipality" | "city" | "commune" | "sector",
    population: number, sourceRow: number
  }>,
  counties: Array<{
    key: string, name: string, kind: "county" | "bucharest",
    population: number, sourceRow: number
  }>
}
```

`countyKey` is accent-insensitive ASCII with hyphens, e.g. `bistrita-nasaud`. `bucuresti` is a special county-equivalent key. Unit kind follows the workbook's administrative names; towns and municipalities can be pooled as the user requested. There are **3,181 UAT totals** (103 municipalities, 216 cities, 2,862 communes), plus **six separately tagged sectors**. All these totals are positive. There are **41 direct county totals plus the București equivalent total**.

UAT totals excluding sectors sum to **19,053,815**, exactly the national figure. Direct county/equivalent totals also sum to 19,053,815. Every county's UAT sum matches its directly reported county total. The six sectors sum to București's **1,716,961**. These are extractor invariants, not inferred data completeness in SEAP.

Constituent villages and town settlements are indented in the source and excluded. Never sum both UAT totals and settlements, or both București and its sectors. County comparison should use the direct county totals, not a sum of mapped procurement authorities. București must not be automatically treated as an ordinary county council; sectors must be explicitly classified before cohort policy is decided.

## Existing database coverage and pitfalls

Read-only measurements from the local main database:

| Check | Result |
| --- | ---: |
| Authority profiles | 33,219 |
| Profiles with any attached population | 5,575 |
| Profiles with positive attached population | 5,567 |
| Existing reference UAT rows | 3,181 |
| Existing authority mappings | 5,575 |
| Distinct mapped codes, including synthetic codes | 3,055 |
| Mapping entities with valid CUI | 3,155 |
| Mapping entities without valid CUI | 2,420 |
| Codes linked to multiple entities | 2,332 |
| Mapping rows without a matching reference UAT | 181 |
| Mapping rows with a different population from their existing UAT | 2 |
| Valid-CUI mappings with positive SIRUTA | 3,057 |
| Of these, codes found in the official 2021 catalog | 3,057 |
| Of these, official county matches registered county | 3,044 |

The 181 missing-reference rows use **synthetic codes**: `-100` for many county councils, `-9` for București and `-1` through `-6` for sectors. They include subordinate sector schools, markets, social services, police and municipal companies. A population mapping is therefore **not proof that the authority is the primary local government**.

Positive-code mistakes also exist. Examples include Sfântu Gheorghe (Covasna) mapped to an Ialomița commune, Cândești administrations from different counties mapped to one code, five Vânători administrations from different counties mapped together, and `Comuna Corabia (Primaria Cobia)` in Dâmbovița mapped to Oraș Corabia, Olt. `SPAS SLANIC MOLDOVA` is mapped to the town but is a social-assistance service. Such matches must not enter automatic local-government cohorts.

Names and CUI identity need checking even after the population dataset is fixed. The apparent duplicate Cluj-Napoca CUI 14920794 lacks a county; the ordinary municipality CUI 4305857 has Cluj. Strict county verification removes the former from automatic matches. Do not choose a purported administration based on higher procurement activity.

## Recommended authority-to-area join

1. Restrict candidates to authority profiles with stable, valid CUI identity and a strict primary-administration name. A school or service located in an area is not its local government.
2. For positive `authority_uat.uat_siruta`, require the official unit name and county to corroborate the association. Treat the old code as a candidate join, not trusted evidence by itself.
3. An exact normalized legal-administration name plus county can recover missing old mappings. Strip only known legal prefixes/suffixes; use a narrowly documented Romanian historic `î`/`â` spelling equivalence where needed. Reject multiple valid CUI candidates for the same served unit rather than guessing.
4. For county councils, derive the served county from a strict `Județul …` / `Consiliul Județean …` / `UAT Județul …` name. **Ilfov council's registered county is București**, so registered county alone is incorrect for the served area. Match the official direct county population.
5. Give București municipality and sectors explicit handling and labels. Never assign all București population to a sector or to every institution in the city.
6. Missing or ambiguous association means unavailable population comparison; do not fall back silently to activity counts. Manual comparisons can display unavailable population clearly if supported by the product contract.

This join is a conservative application inference from procurement identity and official geography. The census does **not** supply an official authority-CUI crosswalk. Preserve and display the mapping method; do not label the authority-CUI association as INS-certified.

For reference, old-map fallback gaps are real: Târgu Jiu entity `2146501` (CUI 4956065, Gorj, `Primaria Municipiului Targu Jiu`) has no old UAT mapping, though it matches official UAT 77812. Pitești entity `2146442` (CUI 4317967, Argeș) similarly lacks a mapping. A valid exact-name/county fallback prevents excluding them merely because the older enrichment missed them.

## Buzău reference example

Buzău UAT 44818 has **103,481** residents (source cell `D4115`). County Buzău has **404,979** residents (`D4114`). Entity `2144364` is the focal municipality; county council entity `2146819` is a separate authority.

These are the ten nearest *geographic administrations* by absolute population difference, without restricting municipality/city status or procurement activity. The focal is excluded. Signed percentage is `(peer population − focal population) / focal population × 100`; ordering is by the absolute difference, with a deterministic SIRUTA tiebreak.

| Administration | Population | Difference | Existing valid-CUI authority | Source row |
| --- | ---: | ---: | --- | ---: |
| Baia Mare | 108,759 | +5.10% | 2146162 | 9940 |
| Râmnicu Vâlcea | 93,151 | −9.98% | 2146327 | 15703 |
| Satu Mare | 91,520 | −11.56% | 2146473 | 12793 |
| Târgu Mureș | 116,033 | +12.13% | 2146721 | 10686 |
| Botoșani | 90,010 | −13.02% | 2145484 | 3294 |
| Suceava | 84,322 | −18.51% | 2146658 | 13689 |
| Drobeta-Turnu Severin | 79,865 | −22.82% | 2146592 | 10264 |
| Piatra-Neamț | 79,679 | −23.00% | 2145662 | 11290 |
| Bistrița | 78,877 | −23.78% | 2145825 | 2982 |
| Târgu Jiu | 73,545 | −28.93% | 2146501 (old map absent) | 7685 |

No city-status boundary affects this particular example because its closest populations happen to be municipalities. Missing source rows for the chosen year/CPV must not cause a farther administration to be silently substituted or turn absent SEAP collection into a claim of zero procurement.

## Snapshot/evidence requirements

Freeze the catalog version, source URL/hash, reference date, each member's population and source row, served unit identity, authority identity, inclusion origin (automatic/manual), additions/removals, ordering rule and selected procurement filters. Recompute financial statistics from the final selected authorities; do not use purchasing volume or value to admit population peers. Preserve no-observed-record peers in the roster with explicit availability, even when no source contracts can be captured for that member. Keep exact source contracts behind every available amount.

## Independent adapter review — 26 September 2026

Reviewed `apps/web/lib/peer-population.ts` independently of its author and executed its real mapping function inside explicit PostgreSQL **read-only transactions**. No reference or procurement data was changed.

After the bounded alias/suffix and authority-role corrections, the adapter resolves **2,874 local administrations and 39 county councils**. This is mapping coverage, not proof of complete procurement collection. The automatic cohort therefore correctly discloses that it uses confidently identified administrations in the application.

All nine independent acceptance checks passed:

1. Real Buzău produces exactly the ten official geographic neighbors listed above, in the same order and with the correct signed population percentages.
2. Ilfov council resolves to **542,704** residents of Ilfov despite its registered București county.
3. București municipality resolves to **1,716,961** residents; sectors stay outside the automatic cohort.
4. Known erroneous cross-county links, SPAS Slănic Moldova, a sector authority, and the Cluj entity without a county are excluded.
5. Bounded repeated `Primăria` suffixes resolve ordinary commune names, including Scrioaștea.
6. Târgu Jiu resolves through declared `exact_name_county` fallback because its old SIRUTA mapping is absent.
7. A conflicting repeated municipality name is rejected.
8. A conflicting explicit county suffix is rejected.
9. Two distinct candidate authority identities for one served area are both rejected.

The two county gaps are deliberate conservative exclusions. Suceava has two valid-CUI, authority-namespace identities with the exact council name: `2146734` / CUI 4244512 and `2136274` / CUI 6728926. The latter has no authority profile or observed transactions but **does** have an authority SICAP namespace. It must not be discarded merely for having less observed procurement. Prahova entity `2146560` is named `CONSILIUL JUDETUL PRAHOVA, DIRECTIA SERVICII SI ACHIZITII PUBLICE`; it needs explicit identity verification before accepting that nonstandard department-like name as the primary council.

No remaining mapping blocker was found after these checks. Broader authoritative CUI-to-administration reconciliation would improve coverage but is separate from this conservative implementation.
