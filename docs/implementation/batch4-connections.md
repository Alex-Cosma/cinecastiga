# Batch 4: documented procurement connections

The focused Batch 4 adds **“Cum sunt legate?”** to company and authority profiles. It follows procurement relationships through one shared partner, with original source records and immutable investigation captures. Fair peer comparisons and new external ownership data remain outside this implementation.

## Reporter journey

1. Open an institution or company profile and choose **Cum sunt legate?**. The partners section also links to the explorer.
2. Select direct acquisitions, procedure contracts or both; optionally bound the years and press **Aplică filtrele**. The applied scope remains visible below the form.
3. Search the complete paginated partner list by name or CUI. Select **Explorează legătura**.
4. Read the recorded value, date range, direct-acquisition count and supplier allocations within distinct contracts. **Vezi sursele** opens the existing exact source drawer, including SEAP/TED links and CSV export.
5. Explore other institutions purchasing from the selected supplier, or other suppliers of the selected institution. The original entity is excluded from this second list. Select **Vezi legătura** to inspect the two-part path.
6. Open either leg independently or the combined source selection. **Salvează în anchetă** preserves both relationships and their source rows in one private evidence item. Existing owner/editor/viewer permissions apply.
7. In the investigation, open the preserved sources or export the evidence bundle. Stored names, path meaning, pairs, filters, original URLs and exact values remain available.

On mobile, selecting a partner opens its detail view; **Înapoi la furnizori / instituții** returns to the list. The current URL retains the selected entities, applied period/dataset and identity receipts, so a copied path can be restored. Changes to the underlying validated data require explicitly restarting exploration; no saved receipt silently changes entity.

## What the evidence establishes

- Shared suppliers or buyers establish procurement connections only. They do not establish ownership, coordination, payments, or wrongdoing.
- The connection selection uses the existing ordinary value-query rules: direct acquisitions with positive stored values up to 2,000,000 RON, and positive supplier allocations from contracts. The 2,000,000 bound is an application data-quality rule, not a legal threshold.
- Consortium records retain their supplier allocations. The interface distinguishes record count, allocation count and distinct contracts. Combined paths never replace allocations with repeated full-contract values.
- Monetary calculations use exact decimal strings/SQL numeric values. Screen amounts round to cents; source details and exports retain stored precision.
- Unknown counterpart identities and records with the same identity at both ends are excluded from valid relationships and disclosed. Filtering by year excludes undated records; without year bounds they remain included and counted.
- The two legs share one validated checkpoint. Source viewing, CSV and evidence capture verify both that checkpoint and the entity identities. Unsupported or stale selections fail explicitly.
- A source-list filter may narrow a saved selection, but every declared leg must retain at least one source. An empty leg makes the capture fail without publishing partial evidence.

## Local manual check

Start at [Buzău connections](http://localhost:3110/entitati/2144364/legaturi?rol=autoritate). This is a snapshot-specific local example, not a permanent entity ID or a finding of misconduct.

1. Select RER SUD. The verified local snapshot shows 12 source rows and **332,110,526.86 RON**.
2. Open those sources; compare the total and follow the original-source links when SEAP/TED is reachable from your device.
3. Close the drawer and choose another institution from **Unde mai apare acest furnizor?**.
4. Verify each leg, then open the combined source selection. Copy the page URL into another tab and confirm the same path reopens.
5. Sign in and save the path into a new or existing investigation. Open the saved evidence and its frozen sources.
6. Return to the explorer, choose contracts only or a narrower year range, and apply the filters. The previous path clears because the scope changed.
7. At phone width, check source access and the explicit return to the partner list. Search a nonexistent name or a year without data to inspect the empty state.

## Verification

Production build, typechecks/lint and 331 ordinary tests pass. 21 PostgreSQL scenarios passed across isolated focused runs (8 relationship reads, 6 bound evidence, 7 existing capture regressions). Thirteen inspected screenshots cover desktop/mobile, light/dark paths, sources, empty/stale states and private capture. Browser checks cover both directions, copied paths, delayed-restore cancellation, search/filters, mobile focus and reduced motion. The exported fixture preserves 4 rows and 358000.0053 RON; ZIP CRC and 10 file SHA-256 checks pass. The independent scoped UI review returned **ship**; design documentation confirmed the incumbent system was preserved.

The temporary preview, session and isolated databases were removed. The main application remains running at localhost:3110. No main procurement data was changed. Full evidence is in `previews/batch4/verification.json`.

## Engineering and operation

No new migration or background worker is introduced. This feature depends on the validated data checkpoint infrastructure from Batch 3. It reads existing procurement data; it does not scrape SEAP, acquire ownership information, or send notifications.

See [data access and tests](batch4-connections-data.md), [capture boundary and tests](batch4-connection-evidence.md), and [surface direction](batch4-connections-design.md). Browser and final verification artifacts live in `previews/batch4/`.

No commit, push or deployment is authorized or performed as part of this batch.
