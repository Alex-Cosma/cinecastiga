# Batch 3 — ongoing private monitoring

Implemented and verified locally, 19 September 2026. No commit, push, deployment or messages to real users. The app is running at http://localhost:3110 with its dedicated monitoring worker.

## Reporter journey

1. Apply a question, inspect a source selection, open an entity, or select an immutable recipe version.
2. Choose **Urmărește modificările**. The setup page spells out the current conditions, including groups, CPV, source-list filters and minimum-record cohorts. The question and source links remain adjacent.
3. Give the watch a recognizable name. Optional preferences choose relevant change types and a minimum record value. Existing historical records form a quiet baseline, not an alert flood.
4. Open **Anchete → Urmăriri → Actualizări**. Each update links to its preserved sources and before/after differences. The watch history also shows unchanged checks and failures.
5. Use **Adaugă în anchetă** to copy both original observations into an editable case. Optionally create a verification task. Copies do not recalculate the live question; subsequent source refreshes cannot rewrite the evidence.
6. Mark an update **Am verificat**, pause/resume a watch, or change notification preferences. Criteria are immutable; a different selection gets a separate watch.

Functional prototype, authored before product UI integration: `mockups/cinecastiga-monitoring.html`. All prototype records are explicitly fictional.

## Transparency and semantics

- All 13 existing query views use their actual query/source compilers. Historical profile views retain their existing constraints instead of silently discarding transaction filters.
- Queries and drawer subgroups/search/state/stream remain distinct and exact. The receipt separates base filters, additional grouped rules, and restrictions from the source list; OR date groups are never reduced to an invented date range. Recipe versions are pinned. Source identities are bound and checked after rebuilds.
- For a watch narrowed in the source drawer, the parent result is retained as context only. Changes outside the selected sources do not trigger a result-change alert. Methodology changes remain explicit.
- Complete source populations are preserved SQL-to-SQL, up to an explicit **200,000-row watch limit**. Broader selections fail with an explanation; they are never silently sampled.
- Decimal source amounts remain strings and exact SQL numerics; unknown amounts remain unknown.
- “First observed in this selection” does not claim the source record was first imported then. Older procurement dates, recent dates, absent dates, source corrections and records leaving the selection have distinct explanations.
- A record leaving the selection does not prove cancellation. Result/profile changes and methodology changes remain separate from source changes.
- Private evidence includes original SEAP/TED links. External web documents are not archived by this batch.
- Frozen case copies include before/after records, change metadata, original run/checkpoint/results and exact totals in the existing ZIP export. Re-capture of a monitoring change is refused; save a later update as another item.

## Reliability and operation

See `batch3-refresh-checkpoints.md` for the coordinated refresh gate and baseline validation. All supported analytic write CLIs invalidate readiness; raw scraping alone does not publish a checkpoint.

- `pnpm --filter web monitoring:check`: bounded one-shot evaluation on the latest ready checkpoint.
- `pnpm --filter web monitoring:worker`: standalone process, polls every 60 seconds, checks pending watches sequentially, resumes from persisted state after restart. It does not collect data or send email.
- `pnpm --filter web monitoring:worker --once`: a single worker tick for release verification.
- A unique watch/checkpoint run prevents duplicate publication. Failed attempts retain the last good observation and a visible error. Paused watches keep their history.
- Initial checks can run after the creation response; the standalone worker recovers unfinished first checks.
- Optional email delivery has a separate explicit command/schedule. See `monitoring-email-digests.md`. SMTP and verified email are required for opt-in; no emails are sent during local testing.
- Ordinary account onboarding now proves email ownership through the existing login code; already signed-in accounts can confirm inline at an invitation. See `auth-email-verification.md`.

Migrations: `0031_monitoring.sql`, `0032_monitoring_digests.sql`. Additive application/auth workflow changes do not require re-ingestion of procurement data.

## Manual check on the local application

1. Sign in at http://localhost:3110 with your ordinary account. Open **Anchete → Urmăriri**.
2. Open an institution or apply a question in **Construiește**. The current Buzău institution is `/entitati/2144364`. Choose **Urmărește modificările**.
3. Check **Ce vei urmări**. For a source-list selection, inspect the source type, years, search and other restrictions as well as the question's grouped rules. Name the watch, optionally open its preferences, then choose **Începe urmărirea**.
4. Wait for its reference version or choose **Verifică datele disponibile**. The existing records should be available under **Vezi sursele**, without appearing as new alerts. The Buzău unfiltered value question currently has 694 records totaling exactly 1,553,407,378.67 RON.
5. Try **Pune pe pauză**, **Reia urmărirea**, and the preferences disclosure. A repeated check on the same validated data version does not generate duplicate updates.
6. New changes require a later validated analytic version. They appear in **Actualizări** with before/after fields and original source links. **Adaugă în anchetă** preserves both observations; the optional checkbox creates a verification task. **Am verificat** removes the update from the default unread view.
7. In the investigation, open **Sursele înainte** and **Sursele după**, then export the dossier to inspect the retained records and source URLs.

The last two steps were exercised with explicitly fictional fixtures in a disposable database, including source corrections, older records observed later, unknown dates and selection exits. Those fixtures and their accounts are now removed. Do not alter real procurement records to manufacture an update. The prototype and screenshots remain available for inspecting the demonstrated changed-data states.

## Verification

[Final verification](previews/batch3/verification.json) records build, runtime, cleanup and test results:

- `pnpm turbo build`, followed by `pnpm turbo typecheck lint test`: passed. **323 default tests**: web 196, ingestion 85, domain 26, scraper 16.
- **29 new PostgreSQL scenarios**: refresh gate 8, actual auth flow 5, mocked email digests 6, monitoring 10. The final monitoring backlog/health scenario was run separately after the nine-scenario suite.
- **14 Batch 2 database regressions** rerun successfully: evidence 7, workspace 5, grouped populations 1, recipes 1. Total database scenarios across the separate runs: **43**.
- All 13 query views, using 14 spec variants, establish quiet monitoring baselines. Exact decimal changes, permissions, frozen case evidence, failed refreshes, reused entity IDs, profile/methodology changes, selected-source isolation and oversized selections were exercised.
- A real-data Buzău baseline matched all 694 records and the exact total above. The temporary application-only watch/account was removed; procurement records were unchanged.
- ZIP verification passed CRC, SHA-256, exact before/after sums, original correction metadata and source URLs. Monitoring evidence refuses live recapture.
- Desktop, mobile and dark setup were checked. The nine final correction captures report no runtime exceptions or whole-page overflow. The independent [finish review](previews/batch3/finish-review.md) records **ship** for its bounded corrections.

The existing-data checkpoint `a888f7f9-f39f-4b23-9c1e-0ffefe46270d` passed ten full validation checks; see [refresh evidence](previews/batch3/refresh-checks.json). Its stored collection and procurement dates remain unchanged. Validation does not imply a new collection.

The preview server on 3111 was stopped, `seap_test_batch3_20260919` was dropped, and temporary browser credentials/invitation files were removed. The main app on 3110 and monitoring worker remain running locally. Logs are `/private/tmp/seap-batch3-web.log` and `/private/tmp/seap-batch3-worker.log`.

## Deployment prerequisites

A web-only deployment is insufficient. Apply the additive migrations, preserve application/auth history, establish a validated analytic checkpoint and supervise `pnpm --filter web monitoring:worker` alongside the application. The coordinated refresh and worker contracts are documented in [refresh checkpoints](batch3-refresh-checkpoints.md). Direct analytic SQL outside that gate is unsupported.

Email digests are implemented but local delivery and scheduling remain off. Production opt-in requires verified recipients, SMTP and a trusted HTTPS site origin; schedule the explicit digest send command separately after configuration. Delivery failures and uncertain SMTP outcomes remain visible; see [email digests](monitoring-email-digests.md). No ingestion, collection, email cron or production deployment was started during this batch.
