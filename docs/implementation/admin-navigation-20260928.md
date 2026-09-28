# Admin navigation and recovery estimates — 2026-09-28

The approved `mockups/admin-navigation` direction is implemented as an extension of the existing Operate interface. Five real routes (`/admin`, `/admin/procesare`, `/admin/fisiere`, `/admin/jurnal`, `/admin/conturi`) share an authenticated persistent layout, status strip and active navigation. The sticky navigation measures the site header so it remains below it on mobile.

Collection and processing settings appear in their corresponding sections. Staged settings survive navigation, including visiting accounts, and explicit Apply saves the retained draft. Account and journal lists show at most ten rows; the journal retains its selected page across routes. Account actions remain available in stacked mobile rows. Route access and the status API require administrator authentication.

## Progress and product truth

Each stream reports the completed fraction of its known queue, whose size can grow as collection discovers more work. The aggregate estimate instead projects workload separately for institutions, notice days, details and contracts. Completed partitioning counts as work, while failed attempts do not increase progress. The result is not the arithmetic mean of stream percentages.

Estimation requires a completed catalogue and observations from every stream: at least 100 institutions or 20 notice days, at least 10% of each stream's units, and up to three represented months for notices. A smaller batch requires all its units. Timing additionally requires at least 24 hours and 100 completed useful steps. The recent rate uses up to seven calendar days, including pauses and competing file traffic, and is bounded by configured pacing and daily capacity. Workload and rate scenarios allow at least 25% variation; the displayed interval is a planning range, not a statistical confidence interval.

The collector has a fixed batch end date. The interface names that date and describes completion of that batch; it does not claim all subsequent days or all historical SEAP data are current. Deferred details or failed tasks produce a gaps state and suppress completion ETA. Missing samples and observed throughput produce learning states; stale status, stopped streams and missing collector heartbeat suspend the current deadline. Collection and verified publication remain distinct.

This change adds read-only status calculations and UI behavior. It does not change crawler policy, request pacing or database schema.

## Design and evidence

The existing forest/ivory colors, typography, flat groups, thin separators, forms and disclosure patterns remain the visual authority. The mockup is a code-led critique reference; its illustrative numbers and simulated actions do not become production claims. No shipping raster or new shared visual system is introduced. `DESIGN.md` and `.impeccable/design.json` are preserved; the detector's local radius and type-size advisories do not redefine global tokens.

Seven synthetic production-build captures are in `.impeccable/review/admin-navigation-live/`: desktop collection, accounts, processing, journal, mobile collection, mobile accounts and dark mobile accounts. `verification.json` records 24 browser checks, including draft and pagination retention, separate settings, gaps suppressing ETA, mobile overflow/header clearance and anonymous access guards, with no runtime errors, external requests or source traffic. These captures establish UI behavior in an isolated schema-only local database, not production source freshness.

The implementation handoff reports 252 unit tests, two real PostgreSQL integration tests, passing types and production build, and a read-only production EXPLAIN taking 424.711 ms. These results are supplied verification evidence; the independent visual reviewer did not rerun them.

The [finish review](previews/admin-navigation/finish-review.md) records final **ship** after the sole mobile email measure correction. Refreshed light and dark phone captures show long addresses using the row width, with actions and pagination retained. The production preview was rebuilt and the 24 browser checks passed again, according to the implementation handoff. Deployment is pending at this documentation handoff.

## Release verification

Application commit `332e577` is committed and pushed on main. [Actions36397323757](https://github.com/Alex-Cosma/seap-new/actions/runs/36397323757) completed CI and deployment successfully; the server checkout matched the release. Public home and health return200; all five anonymous admin routes redirect to login, and the collection statusAPI returns403. At11:28:40 Europe/Bucharest on28September, controlrevision14 remained unpaused, outside maintenance, unblocked and paced50–70seconds. Collection advanced to1553completed tasks;38163pending and17916deferred remain. This confirms continued operation, not complete source coverage. No source test requests were sent.

Production probes are preserved in `previews/admin-navigation/production-verification.json`. The synthetic captures and browser verification are copied alongside it. Local preview3115 and isolated fixture database were removed; regular development3113 and mockup3112 remain untouched. This evidence-only documentation follow-up skips CI because the runtime release is already verified; it does not change the deployed application.
