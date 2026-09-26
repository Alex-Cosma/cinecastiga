# Administrare — colectarea datelor

Interactive, standalone proposal for the collection workspace inside `/admin`, built before production integration. The existing account administration route is unchanged.

Open **http://localhost:3112/admin/** while the existing mock server is running, or serve `mockups` with `python3 -m http.server 3112 --directory mockups` and open that URL. `index.html` can also be opened directly; fonts use the existing embedded local font stylesheet.

All collection numbers, request log entries, processing states and audit events are illustrative. The browser makes **no SEAP requests**, writes no server settings and does not connect to production. Refresh resets the demonstration. The Conturi link opens existing local application account administration in another tab.

Try:

1. Read the next-request countdown and pause/resume the common queue.
2. Pause a single stream. The simulated next task changes to an enabled stream.
3. Edit minimum/maximum delay or choose a preset. The hourly estimate changes immediately; active policy changes only after **Aplică modificările**. An invalid interval blocks saving. A slower policy extends the remaining pause; a faster one does not shorten it.
4. Enable a daily cap; a cap below the simulated attempts already spent pauses collection. Change the processing time, apply, and inspect the configuration audit below.
5. Filter **Erori**, expand a request, and export the illustrative JSON journal.
6. Use the scenario selector for source429, maintenance, failed processing or stale status. Stale status does not falsely claim the remote collector stopped. Failed processing keeps maintenance enabled.
7. Try the dark theme and mobile layout.

The mock distinguishes raw acquisition from pending processing/publication; known queue from unknown total; verified institutions from verified publication days. Progress denominators reflect the accepted recovery windows (DA July1 onward, participation/awards January1 onward, through September25 in this dated example). Their numerators are simulated. It does not promise an overall completion percentage/date or certify actual data coverage.

Fixed proposed guardrails remain visible in the settings disclosure: one shared request in flight, minimum60sbetween file GET attempts, halt on source403/429/challenge, no automatic retry/PDF crawl. This prototype shows these policies; enforcement belongs to the future backend dispatcher.

Production follow-up: admin-only server authorization; durable versioned settings and identity/time audit; authenticated live status with stale heartbeat detection; fixed raw publication checkpoints; a protected admin/status path that stays accessible during public maintenance; budget/scheduler enforcement independent of open browser tabs. The current browser simulation intentionally pauses its timer in hidden tabs and does not model a real server scheduler.

Validation: `node mockups/admin/check.mjs` uses the existing Chrome CDP on9237 and mock server3112.24 browser checks pass, no JS runtime errors and no external HTTP requests. Captures and report: `docs/implementation/previews/admin-collection/`. Shared application code, production services, DATABASE data and current SEAP request count are unchanged.

Design: inherits `DESIGN.md`; surface contract at `docs/mockups/admin-collection-direction.md`. Screenshot PNGs are browser captures of this authored prototype, not generated artwork or source photographs.
