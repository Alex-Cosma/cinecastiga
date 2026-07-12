# ingestion

Scheduled worker: scrapes e-licitatie.ro (SEAP/SICAP) into the append-only
bronze archive (`raw.raw_documents`), politely and idempotently.

## Setup

```bash
docker compose -f infra/docker-compose.yml up -d --wait   # Postgres + Meilisearch
pnpm install
pnpm --filter @seap/db db:migrate
```

## Env

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `SCRAPE_UA` | yes (for scraping) | — | Honest User-Agent with contact, e.g. `seap-analytics/0.1 (contact: you@example.com)` |
| `DATABASE_URL` | no | local docker DSN | Postgres |
| `SCRAPE_CONCURRENCY` | no | 3 | Max in-flight requests (shared per process) |
| `SCRAPE_MIN_DELAY_MS` | no | 400 | Min delay between request starts |
| `SCRAPE_SAMPLE_DAYS` | no | 30 | Initial window when a family has no watermark |

## Run

```bash
pnpm --filter ingestion dev        # worker: cron jobs (see src/jobs/index.ts)
```

Schedules (server-local time — run the box on Europe/Bucharest): tenders 04:30,
awards 04:40, DAs 05:00 daily; notice state re-scan Mon 06:00; DA corrections
Tue 07:00. All after the nightly SICAP finalization batch (00:00–02:30 local).

Manual/sample scrapes (explicit closed windows, D-1 or older):

```bash
SCRAPE_UA="..." pnpm --filter ingestion scrape --family tenders --start 2026-06-12 --end 2026-07-11
SCRAPE_UA="..." pnpm --filter ingestion scrape --family awards  --start 2026-06-12 --end 2026-07-11
SCRAPE_UA="..." pnpm --filter ingestion scrape --family das     --start 2026-06-12 --end 2026-07-11
```

The 30-day DA sample is ~200k records ≈ ~24h at polite rates — run overnight;
kill/resume is safe (watermarks; re-runs are idempotent via content hashes).

## Tests

```bash
pnpm --filter ingestion test              # unit (no DB, no network)
pnpm --filter ingestion test:integration  # docker Postgres + mock SICAP server
```

No live network in any test — live contact only via the scrape CLI/worker.

## Layout

`src/scrape/` writes `raw` only (archive-before-parse; PII redacted pre-write);
`src/normalize/` (future) reads raw → writes core; `src/aggregate/` (future)
reads core → writes marts. See module READMEs.
