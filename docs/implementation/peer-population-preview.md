# Population comparison browser acceptance fixture

26 September 2026. This preview uses **real INS RPL2021 locality names and populations with entirely fictional procurement, companies, CUIs and accounts**. Screenshots are interface checks and make no claims about actual spending by these administrations.

New scripts leave the previous activity-based preview scripts unchanged:

- `apps/web/scripts/seed-population-peers-preview.ts`
- `apps/web/scripts/check-population-peers-preview.mjs`

The seeder requires an explicitly supplied `TEST_DATABASE_URL` with database name `seap_test_*` and refuses any database with users, entities or analytic checkpoints already present. Prepare a fresh schema-only clone; never copy production user/session/source rows. It creates an ordinary verified reporter with a private case, an ephemeral session and signing secret written only to a mode-0600 private JSON file.

```sh
TEST_DATABASE_URL=postgres://seap:seap_dev@localhost:5432/seap_test_population_preview_20260926 pnpm --filter web exec tsx scripts/seed-population-peers-preview.ts
```

Default private configuration: `/private/tmp/seap-population-peers-preview.json`. Override with `--output=/private/tmp/another-private-file.json`. Never print this file or commit it. Start the built application at `http://localhost:3111` using this file's `databaseUrl` as `DATABASE_URL`, its `secret` as `BETTER_AUTH_SECRET`, and that origin as `BETTER_AUTH_URL`. Load those values from the file in a launcher; do not print the environment.

With a dedicated Chrome page exposed through CDP on port 9237:

```sh
node apps/web/scripts/check-population-peers-preview.mjs
```

Optional environment variables: `POPULATION_PEER_PREVIEW_CONFIG` overrides the private JSON path; `CDP_URL` overrides `http://127.0.0.1:9237/json`.

The seed contains Buzău and the ten nearest listed INS localities; Târgu Jiu has an authority role but no eligible source records. Florești is available as a manual commune choice outside the suggested ten. An explicitly fictional test institution has no identifiable population. Procurement spans 2024 and 2025 in CPV45, with three precise supplier shares for a fictional consortium award. Initial focal result: 7 rows, `125000.0104` RON; automatic group: 10 others, 9 with eligible observations.

The harness checks:

- Automatic population roster/order, each population difference and official source/catalog metadata.
- Individual SEAP/TED links and an inspectable zero-source member.
- Expanding the editor, searching, adding a member without population and a commune, removing a suggestion.
- Preserving an unapplied year while editing the group, then applying it without changing membership.
- Exact manual roster/checkpoint/catalog persistence in copied URLs and restoring the automatic suggestions.
- All eligible source rows and exact-decimal CSV totals with original links.
- Ordinary private case save with a `peer-evidence-2` manual receipt, complete frozen roster including missing-population and zero-source members, original population SHA-256 and source links.
- Mobile, dark theme, source drawer and reduced motion.

One batched capture matrix, nine images, is written to `docs/implementation/previews/population-peers/`: population desktop; editor desktop; manual desktop; source drawer desktop; private case desktop; manual mobile; dark mobile; source drawer mobile; mobile editor viewport. `browser-checks.json` records incremental progress and final pass/failure. Root performs visual inspection; this script does not conduct any polish cycle. Canonical desktop/mobile copies are also saved under `.impeccable/review/`.

The harness can be repeated against the same isolated fixture: it resets only the seeded private case's existing clips. After acceptance, stop the preview process, drop the dedicated test database and delete the private JSON/launcher. Keep public screenshots/checks, which contain fictional procurement and public population data only.

Acceptance passed: first run16 recorded checks across8screens; final confirmation17checks across9screens after adding the mobile editor view. No browser runtime errors or horizontal page overflow. The full manual comparison preserves11othermembers, including one without records and one without population. Its47source rows reconcile exactly to1153000.0144RON in the drawer, CSV and private v2 capture. Root inspected the complete initial matrix and the affected final confirmation views. Final screenshots replace earlier same-path images. Preview cleanup is recorded in the final verification receipt.

Final cleanup,26September2026: preview3111 stopped, `seap_test_population_preview_20260926` dropped, fixture cookie/private configuration/launcher removed. Main application3110 remains running the final build, with the browser returned to real Buzău and signed out of the fixture.
