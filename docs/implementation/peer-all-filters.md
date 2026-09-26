# All years and all CPV domains in comparisons

26 September 2026. User requested **Toți anii** in the comparison year selector, then **Toate domeniile** in the CPV selector and confirmation that division45 includes its descendants.

Both selectors now offer an explicit `all` value. Omitted parameters still mean the existing suggested closed year/dominant division; `all` never silently becomes a suggestion. Numeric years and two-digit division codes remain supported, including old links and V1 evidence.

- `year=all` removes the date restriction; otherwise the selected calendar year remains exact.
- `cpv=all` removes the CPV restriction; a selected division continues to match the code prefix, so45 includes451…,452…,453…,454… and every other45-prefix subdomain.
- All years includes undated eligible rows. All domains includes rows with missing or unusable CPV. Both behaviors are disclosed next to results and in methodology. Other eligibility, identity, role, checkpoint and source restrictions still apply.
- Population groups remain the same ten across filters. Manual identity-bound lists remain unchanged. Activity-based cohorts recalculate over the chosen scope as before.
- Applied labels, source titles, copied URLs, saved investigation context and readable exports use Romanian labels, never `CPV all` or a fake year.
- V2 receipts accept these explicit values. V1 receipts reject them and retain their historical numeric-year/single-division shape. Source specifications omit only the corresponding predicate, and server-reconstructed scope ignores forged browser restrictions.

Implementation extends `peers-shared.ts`, both peer calculation paths, evidence validation/binding and the existing comparison/case/export labels. The CPV selector now explains that a chosen domain includes all descendants. No new design language, global tokens or database migration.

Validation: production build/typecheck passed;227 default web tests passed.47 focused tests passed in an isolated schema-only PostgreSQL database (15 unit and32 integration). New cases reconcile multiple years, undated and missing-CPV records, descendant contract code45453000-7, exact decimal source totals, CSV, manual/automatic membership, frozen capture/recapture and human-readable exports. Historical annual cases remain covered. Browser acceptance and two viewport artifacts are under `previews/peer-all-filters/`; the harness is `apps/web/scripts/check-peer-all-filters.mjs` and only reads main data.

No main database writes, commit, push or deployment. Test database `seap_test_peer_all_years` is disposable and removed after acceptance.

Main read-only reconciliation: Buzău, all years/all domains,694eligible rows totaling1553407378.67RON, identical in the comparison and exact source response. Browser URL restoration and manual membership retention passed; no page overflow or runtime exceptions. Initial inspection shortened the disclosure to a single paragraph while preserving both missing-data meanings. No global design files were changed. The isolated test database has been dropped.

Final confirmation: both desktop/mobile captures and all5browser checks passed after shortening the disclosure; the main local app runs the final build. No additional polish/rebuild pending.
