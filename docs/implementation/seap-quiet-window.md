# Daily SEAP quiet window

User-approved on 27 September 2026: no new SEAP requests from **02:59 inclusive until 03:30 exclusive, Europe/Bucharest**, every day. This is preventive protection while observing the suspected source maintenance around 03:00, not evidence that SEAP guarantees this schedule.

The shared PostgreSQL-backed request gate checks this policy after acquiring the control-row lock, before creating a request ledger entry or admitting transport. Waiting requests recheck on admission. All collection streams, catalogue requests and every document request (page, metadata, POST and file GET) use the same gate. Recovery/document workers also check before claiming work, avoiding repeated job claims throughout the pause. Work interrupted between requests returns to its existing queue; downloaded originals remain reusable. Already running responses and OCR can finish. Existing HTTP timeout is 45 seconds.

This is not a cron that toggles `paused`. No pause, error, revision, request counter or pacing timestamp is rewritten to simulate the window. At its end, the usual workers can resume automatically, subject to manual/stream pauses, maintenance, source errors, daily budget and existing pacing. Random 50–70 second shared spacing and the minimum 60-second file gap remain unchanged. There is no catch-up burst. Site availability and access to saved PDFs are unaffected. The separate 05:00 publication schedule remains unchanged.

The database clock is authoritative, independent of host/browser timezones. SQL computes each day's boundaries in Europe/Bucharest. At the autumn clock change the window spans both occurrences of 03:00, ending at the later 03:30 (91 elapsed minutes). In spring the missing 03:30 resolves to 04:30 local (31 elapsed minutes). This conservative behavior avoids reopening mid-transition. The admin status carries absolute boundaries and shows the actual resume time; the fixed rule describes ordinary days.

## Verification

- 18 isolated PostgreSQL policy/gate tests: summer/winter boundaries, both DST transitions, foreign session timezone, all five streams plus file flag, unchanged control row and zero ledger/transport calls during pause, automatic resume, retention of manual/stream/error/maintenance stops, admission after pacing crosses the boundary, and an in-flight response finishing normally.
- Existing 14 transport/control integration tests also pass, including serialization, global limits, failure diagnostics, real 45-second timeout and minimum file spacing.
- Browser fixture `apps/web/scripts/admin/check-quiet-window.mjs` supplies synthetic quiet-window metadata over an isolated local database. It never runs collection or processing. Captures distinguish scheduled waiting from manual/error states.

## Morning observation

Inspect `app.collection_requests.started_at` and outcomes around 02:59–03:30 Romanian time: no admitted attempts in the interval, previous request allowed to complete, and the first later attempt successful or any independent stop explained by control state. Check document jobs remain queued rather than failed. The first real overnight observation is pending; automated fixture results are not proof that SEAP will be available after 03:30.

No database migration, extra cron entry or production test request is needed. Deploying the updated collection and document workers activates the gate.
