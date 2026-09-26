# Isolated peer-comparison acceptance

20 September 2026. Fixture preparation and final browser behavior checks complete. No production data, real accounts or email are used.

## Reproducible fixture

`apps/web/scripts/seed-peers-preview.ts` requires an explicit `TEST_DATABASE_URL` whose database name begins `seap_test_`. It also refuses a populated user/entity/checkpoint database. Prepare an empty schema-only clone of the application's current schema, then run the script with that URL supplied privately in the environment. Do not copy source rows, users or sessions from the real database.

The fixture contains 25 fictional communes (one focal authority and 24 peers), eight fictional suppliers, construction acquisitions in 2024 and 2025, and four peers registered in Buzău. The focal 2025 selection has seven source rows totaling **125000.0104 RON**. A three-winner consortium retains exact allocations **0.0033 / 0.0033 / 0.0034**, original SEAP-format identifiers and a TED-format link. These identifiers are synthetic; the fixture does not claim the external pages contain its invented records.

The seeder creates an ordinary verified test user and private investigation. Its ephemeral session, signing secret and database URL are written only to `/private/tmp/seap-peers-preview.json`, mode 0600. Never copy that file into a tracked artifact or print its contents. The disposable database is `seap_test_batch4_peers_preview_20260920`.

Start the final application build on port 3111 with the private configuration's `databaseUrl` and `secret` supplied as `DATABASE_URL` and `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL=http://localhost:3111`. Do not run a rebuild from the acceptance harness.

## Acceptance scope

The browser harness checks desktop/mobile, light/dark, full-cohort versus paginated medians, explicit filter application, copied-URL restoration, individual and complete source selections, original source links, supplier comparisons, small-cohort suppression, private case save and frozen evidence. With the final preview running and a dedicated Chrome tab exposed on CDP port 9237, run from the repository root:

```sh
node apps/web/scripts/check-peers-preview.mjs
```

The harness validates the private configuration before using it and writes incremental results after each check. Output belongs in `previews/batch4-peers/`; canonical desktop/mobile captures also go to `.impeccable/review/`. A complete cohort includes 103 source rows totaling **3149000.02 RON**, regardless of which 20-member page is visible.

## Acceptance results

The first browser round passed 19 recorded behavior/screen checks with no runtime exceptions or horizontal overflow. It verified the ordinary private session, 24 distinct members across 20+4 pages, an unchanged **126000.0004 RON** peer median, copied URL restoration, original SEAP/TED links, exact full-group sources, a complete 103-row private capture, frozen-source navigation, supplier mode, explicit year/county application and small-group suppression. API/capture totals retain **3149000.0200**, the same exact value as 3149000.02; the harness compares decimal strings after removing only trailing fractional zeroes.

The initial screenshots exposed an inherited global `main { display:flex }` rule on the nested comparison container, producing excessively tall rows despite no horizontal overflow. Root corrected the container and comparison-bar animation in one bounded change. The final harness ran against that rebuilt preview and replaced the diagnostic screenshots.

**Final confirmation: all 23 recorded behavior/screen checks passed**, with no browser runtime exceptions or horizontal page overflow. The additional checks verify complete CSV export (103 rows, exact summed decimal **3149000.02**, original SEAP/TED links) and applying the DA-only 2024 filter (four exact focal sources). The isolated case is reset before each harness run, so its final screenshot contains one freshly captured complete comparison. All cleanup is restricted to that fixture case; no real case is touched.

Desktop captures use a 1440px viewport; mobile uses 390px, with light and dark themes. Source dialogs and the frozen-source overview have readable viewport captures in addition to the complete frozen-source page. Canonical authority screenshots are `.impeccable/review/peer-desktop.png` and `.impeccable/review/peer-mobile.png`. The harness also creates supplier, small-cohort, case and frozen-source images under `previews/batch4-peers/`. Visual finish review remains root's separate acceptance step.

Current artifacts: [final browser checks](previews/batch4-peers/browser-checks.json). The fixture and preview remain available for visual review. Stop the isolated app, remove its browser cookie/private files and drop only this disposable database after acceptance; cleanup is now complete (see the final cleanup record below).

## Final cleanup

20 September 2026: final rebuilt confirmation passed23checks and retained12screenshots. The independent full review accepted the extension, and the bounded verdict resolved both subsequent copy corrections. Preview3111 was stopped, the explicit `seap_test_batch4_peers_preview_20260920` database dropped, its browser cookie removed, and private configuration/launcher files deleted. No peer fixture database remains. The main app stays running at3110, with the real Buzău comparison open and the fixture user signed out. Re-run the guarded seeder in a new schema-only isolated database before reusing the harness.
