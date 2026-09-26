# Population comparisons and editable peer groups

26 September 2026. Authorized refinement of Batch 4, following the user's population-first decisions. Local implementation; no commit, push or deployment requested.

## Behavior

Primary local governments now default to the ten closest resident populations in the official INS RPL 2021 catalog. Communes, towns and municipalities share one pool; administrative status does not outrank population. County councils compare directly reported county populations separately. The signed difference is `(peer − focal) / focal × 100`, displayed to two decimals. The page links each identified population to the official workbook and exposes its date and source row.

Only confidently identified primary administrations in the application qualify automatically. Strict name, county, valid CUI, role and geography checks reject subsidiaries, contradictory legacy mappings and ambiguous duplicate authorities. The census supplies population, not an official authority-to-CUI crosswalk. Current read-only audit resolves 2,874 local governments and39 county councils. Sectors and unresolved identities can be selected manually, with population shown as unavailable when it cannot be established.

**Personalizează grupul** opens an inline editor. Search by name or CUI, add an entity, or use **Scoate** beside an existing member. Up to50 other entities can be chosen, including other types, counties or entities without population data. The explicit list is preserved when applying a different year, CPV division or procurement channel. **Revino la sugestii** restores the focal entity's automatic method. Large activity cohorts explicitly start an empty custom group rather than silently copying one page.

Search reserves vertical space while loading and cancels stale requests. Updating a group retains the visible comparison while clearly announcing recalculation and disabling source/save actions until the response arrives. Unapplied year/CPV/channel edits remain drafts; group edits use the already applied criteria. The county selector applies to automatic suggestions and is disabled for an explicit manual list.

Population selection is independent of procurement records. A member without eligible rows remains listed as **Fără înregistrări** and does not enter the median. This never claims zero spending. At least five other members with eligible data are needed to interpret a median; the actual observed denominator is stated.

## Transparency and compatibility

Exact member and full-group source drawers, original SEAP/TED links, CSV and private investigation capture remain available. A v2 receipt binds identities, procurement checkpoint, population catalog, method and the ordered explicit roster. Frozen cases and exports retain populations, differences, census citations and members with no source rows. The server reconstructs scope and totals; browser-provided claims cannot override them.

V1 captures and old checkpoint-pinned URLs without a method retain their original activity-based comparison semantics. Other institutions and suppliers continue to use the disclosed activity method unless a user chooses a manual group. The old `reference.uat.population` values are not overwritten; the new comparison uses a separate reproducible official catalog because audit found legacy2011 values described as2021.

No budget-matching filter or ownership enrichment is included. Census population is dated1December2021 and is not an annual estimate for the chosen procurement period. Conservative identity coverage can omit administrations; the UI qualifies its suggestion accordingly. Amounts are recorded values, not payments, unit prices or findings of wrongdoing.

## Manual check

1. Open `/entitati/2144364/comparatii?rol=autoritate&dataset=all&year=2025&cpv=45` locally.
2. Confirm Buzău shows103,481 residents, census date/source, ten suggested administrations and signed differences. Baia Mare is first at108,759(+5.10%).
3. Open **Personalizează grupul**, search a name or CUI, and choose **Adaugă**. Use **Scoate** to remove a member. The heading now describes a group chosen by you.
4. Change the year without applying, then add/remove a member. The year draft should remain; the comparison still uses its applied year. Apply the filters and confirm the custom roster remains.
5. Copy the link and reopen it. Confirm the same method, members and applied criteria.
6. Open **Vezi sursele** on any member and **Verifică toate sursele** for the group. Inspect exact rows and original procurement links.
7. Signed in, save the comparison to a private investigation. The preserved evidence includes the exact chosen roster, population provenance and available records.
8. Choose **Revino la sugestii**. The nearest-ten group returns. Repeat on mobile and with an entity lacking population; manual selection should remain available.

## Verification and references

Final build and lint/typecheck passed;223 default web tests,40 isolated PostgreSQL scenarios and17 browser checks passed. Nine final captures cover desktop, mobile, dark theme, editor, exact-source drawers and private saved evidence. Independent finish review: **SHIP**, no material fixes. The dedicated reviewer role was unavailable, so a fresh independent agent used the alternate reviewer guide; this substitution was disclosed. Full results: `previews/population-peers/verification.json`. Scoped findings and test receipts:

- `peer-population-audit.md`: official workbook, extraction, national reconciliation and independent mapping audit.
- `peer-population-backend.md`: automatic/manual selection, API limits, legacy compatibility and database tests.
- `peer-population-evidence.md`: receipt and capture guarantees, isolated PostgreSQL regressions.
- `peer-population-design.md`: approved refinement contract.
- `mockups/cinecastiga-population-peers.html`: fictional functional sketch authored before UI integration.

No source, reference, auth or procurement rows in the main database were mutated for this feature. Disposable preview/test databases contain fictional procurement data and are removed after acceptance.

Cleanup complete: the isolated preview was stopped, all population test databases were dropped and the fixture cookie/private credentials were removed. The final local application remains at http://localhost:3110.
