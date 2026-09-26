# Documented connections: source and investigation boundary

The relationship explorer reuses complete, immutable `query` captures. No evidence kind, schema migration or new ownership data is introduced.

The browser sends a `connection-evidence-1` receipt with the validated checkpoint, dataset, optional year limits and exactly one or two authority–supplier pairs. Each endpoint carries its stable identity fingerprint. Two pairs must share exactly one middle entity. The server rejects duplicate, unrelated, self-referencing and inconsistent paths, ignores browser names/amounts, and rebuilds a canonical OR of complete pair predicates. It never constructs the cross product of two entity lists.

`connection-evidence.ts` rechecks the checkpoint and entity identities. The ordinary source-row and CSV endpoints accept the receipt and perform the identity checks and source query under the same shared analytic gate and repeatable-read snapshot. A refreshed checkpoint or reused entity ID requires reopening the connection. These checks apply to the displayed rows and export, not just saving.

Investigation saving checks the receipt at queue time and again inside the worker snapshot. The existing SQL-to-SQL capture retains every matching source row, original SEAP/TED links, exact decimal amounts and each consortium supplier allocation once. After copying, the worker counts sources for every declared pair. **If a list filter removes all sources for one leg, or a caller supplies an empty valid-identity pair, the entire capture fails and commits no source rows.** The message asks the reporter to remove filters or save the supported leg separately.

Completed capture metadata includes the server-derived Romanian path title, documented meaning, original pairs, stable identities, checkpoint, dataset/year bounds and exact source count/value for each pair. The title and meaning appear in the case, frozen source view and readable export. The existing ZIP metadata carries the full context and original source records. Bare current-query links are hidden for these captures because ordinary question links lack the identity receipt. Recapturing against a changed checkpoint fails explicitly; the reporter must reopen the relationship to save a new selection.

Common buyers or suppliers establish procurement connections. The interface does not infer ownership, collusion, coordination, a verified payment or an illicit act from those connections.

## Verification

- Four connection-boundary unit tests: exact pair construction/period; indexed base filters for direct and shared-endpoint paths; invalid paths; forged browser context discarded.
- Six dedicated PostgreSQL integration tests: precise two-leg source capture; consortium allocations; actual row/CSV handlers rebuilding forged broad scope; reused IDs at queue/worker/recapture; checkpoint changes and receipt preservation; filtered-away/empty leg rejection with no partial publication.
- Existing six capture unit tests and seven capture PostgreSQL regression scenarios pass, including complete capture beyond the ordinary 100,000-row CSV cap.
- Web typecheck and `git diff --check` pass after integration.

Source-query performance was checked read-only against main data under the same checkpoint/identity guard. Buzău (`2144364`) → RER SUD (`2125746`) returned 12 sources totaling `332110526.86` RON in 12 ms; the path through the same supplier to authority `2136753` returned 13 sources totaling `466335665.81` RON in 10 ms. These are local observations, not a latency guarantee. The builder retains the exact OR pair conditions and also pushes the common endpoint into the compiler's base entity filters (both endpoints for one pair), avoiding materialization of the entire source population. Compiler grounding uses the already verified entities from the current snapshot, so it neither resolves names again nor requires a historical profile row.

The isolated database was created from a schema-only dump. Tests never write main procurement data or send messages. `apps/web/scripts/seed-connections-preview.ts` can seed a dedicated `seap_test_*` database for browser acceptance. It writes its ordinary fixture user's temporary signed session and signing secret to a mode-600 file under `/private/tmp`; never copy that file into artifacts. Root owns stopping the preview, clearing its cookie, deleting the private file and dropping the disposable database after browser verification.

No commit, push or deployment is performed by this work.
