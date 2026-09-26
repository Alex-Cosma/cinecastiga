# Production deploy (cinecastiga.ro)

Single netcup VPS (Debian 13, Docker), user `seap`, everything under `/srv/seap`:

```
/srv/seap/src                    git checkout of this repo (origin = GitHub, read-only deploy key)
/srv/seap/src/infra/prod         compose project: postgres, meilisearch, web, caddy
/srv/seap/src/infra/prod/dumps   restore inputs (pg directory dump + meili dump), gitignored
/srv/seap/src/infra/prod/.env    secrets (never committed)
/srv/seap/backups                nightly dumps of the auth + app schemas
```

Only Caddy publishes ports (80/443); Postgres also listens on the server's
loopback (127.0.0.1:5432) for admin tasks over an SSH tunnel. Meilisearch is
reachable only on the compose network. The web container connects as
`seap_web` (`roles.sql`): read-only on the data schemas, read/write on
`auth` + `app`, 30 s statement timeout.

## Continuous deploy

Every push to `main` runs CI (`.github/workflows/ci.yml`); when it passes, the
`deploy` job SSHes into the server as `seap`. That key's `authorized_keys`
entry forces `infra/prod/deploy.sh`, so CI can only run that script: fast-forward
to `origin/main`, build the `web`, `migrate` and `documents` images, apply pending
Drizzle migrations, refresh application grants, then restart `web` and the
on-demand document worker. The Postgres service, Meilisearch and Caddy are not
restarted. In the new deploy script, a failed build, migration, history check or grant
refresh stops before replacing the running application. Compose also requires
a successful migration before starting web or the document worker, protecting
the first update still invoked by the old web-only deploy script. That first
legacy invocation can stop the previous web container before discovering a
migration failure; normal later deploys perform the explicit migration first. Pending migrations run in one
transaction; there is no destructive automatic rollback of already committed
schema changes if a later container start fails.

The one-off `migrate` container uses the database owner credentials. Web and the
document worker retain the restricted `seap_web` role. Migration history must
match the checked-out release exactly; a restored database must include its
`drizzle.__drizzle_migrations` history and the existing manually bootstrapped
`auth`, `app` and `reference` schemas. The deployment does not guess a baseline,
reset data, alter role passwords or run ingestion. Schema changes must remain
compatible with the previous web/worker version while migration runs.

`DOCUMENTS_ENABLED` defaults to `true`: signed-in users can queue files, with one
global worker and at least60seconds between SEAP file download attempts. The
worker never crawls unrequested files. Set `DOCUMENTS_ENABLED=false` and redeploy
to disable acquisition; the worker then remains idle without database/source
requests. Already archived originals, PDFs, OCR and search remain publicly accessible;
only new acquisition/processing queue operations require a signed-in account.

Migration0034 introduces a shared SEAP request gate, initially **paused**, for both
ingestion and document acquisition. Administrators control it at `/admin`: default
random50–70second spacing, one request in flight, optional daily attempt cap. The
file GET minimum60second gap remains active. A queued document therefore waits
until the shared queue is enabled. This release does not start nationwide recovery
or the daily publisher; the saved05:00 time is configuration only. Read
`docs/implementation/admin-collection.md` before activation. Health checks use
`/api/health`, which remains available during public maintenance.

GitHub serializes deploys and the script also takes a local `flock`; the migrator
has its own database advisory lock. The migrator uses a10second lock wait and
15minute statement timeout. Retry a failed deploy only after addressing the
reported migration/history/permissions error. The new deploy script does not restart web on that
failure. Run the migration step manually, if needed, with:

```bash
docker compose --profile maintenance build migrate
docker compose --profile maintenance run --rm --no-deps migrate
```

Validation: `node --test infra/prod/deploy.test.mjs` checks deployment ordering and
failure stops. `docs/implementation/previews/deployment-migrations.json` records
an isolated PostgreSQL upgrade, rollback, permission and data-preservation test.

Setup once:

1. Server: `ssh-keygen -t ed25519 -N "" -f ~/.ssh/github_deploy`; add the public
   key as a read-only **Deploy key** on the GitHub repo; clone with
   `GIT_SSH_COMMAND='ssh -i ~/.ssh/github_deploy' git clone git@github.com:Alex-Cosma/seap-new.git /srv/seap/src`
   and set `git config core.sshCommand 'ssh -i ~/.ssh/github_deploy'` in the checkout.
2. Mac: `ssh-keygen -t ed25519 -N "" -f ~/.ssh/cinecastiga_ci`. Append to the
   server's `~seap/.ssh/authorized_keys` as one line:
   `command="/srv/seap/src/infra/prod/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... cinecastiga-ci`
3. GitHub repo → Settings → Secrets and variables → Actions: `DEPLOY_HOST`
   (server IPv4) and `DEPLOY_SSH_KEY` (contents of `~/.ssh/cinecastiga_ci`, the
   private key). Create the `production` environment (Settings → Environments)
   so deploys are listed there.

## One-time bring-up

Mac, from the repo root (data is frozen at `DATA_AS_OF`; auth + app tables and
raw documents are excluded, so the server starts with no accounts):

```bash
docker run --rm --network seap_default -e PGPASSWORD=seap_dev \
  -v "$PWD/infra/prod/dumps:/dumps" postgres:16-alpine \
  pg_dump -h postgres -U seap -d seap -Fd -j 4 -Z 3 \
  --exclude-table-data='raw.raw_documents' --exclude-table-data='auth.*' \
  --exclude-table-data='app.*' --exclude-schema=graphile_worker -f /dumps/seap-YYYY-MM-DD
curl -X POST -H "Authorization: Bearer $MEILI_KEY" http://localhost:7700/dumps
docker cp seap-meilisearch-1:/meili_data/dumps/<uid>.dump infra/prod/dumps/meili-YYYY-MM-DD.dump
rsync -az --info=progress2 infra/prod/dumps/ seap@SERVER:/srv/seap/src/infra/prod/dumps/
```

Server, as `seap`, in `/srv/seap/src/infra/prod`:

```bash
cp .env.example .env && nano .env        # secrets: openssl rand -base64 32
docker compose up -d postgres meilisearch
docker compose exec -T postgres pg_restore -U seap -d seap -Fd -j 8 --no-owner /dumps/seap-YYYY-MM-DD
docker compose exec -T postgres psql -U seap -d seap -v pw="$(grep ^SEAP_WEB_PASSWORD .env | cut -d= -f2)" < roles.sql
docker compose exec -T postgres psql -U seap -d seap -c 'analyze'
docker compose stop meilisearch
docker compose run --rm meilisearch meilisearch --import-dump /dumps/meili-YYYY-MM-DD.dump
docker compose build web
docker compose up -d
```

Admin account, from the Mac through an SSH tunnel:

```bash
ssh -N -L 5433:127.0.0.1:5432 seap@SERVER &
cd apps/web && DATABASE_URL=postgres://seap:PG_PASSWORD@127.0.0.1:5433/seap \
  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' pnpm seed:admin
```

DNS: `A cinecastiga.ro -> SERVER_IPV4`, `AAAA -> SERVER_IPV6`, `CNAME www -> cinecastiga.ro`.
Caddy fetches the Let's Encrypt certificate on the first request; keep
Cloudflare in DNS-only mode (grey cloud) until the certificate exists, proxy
afterwards with SSL mode "Full (strict)".

## Data refresh

Data is a snapshot (`DATA_MODE=snapshot`, `DATA_AS_OF` in `.env`). Refresh =
new dumps on the Mac, upload, `pg_restore --clean` on the data schemas only
(never `auth`/`app`), re-import the Meili dump, bump `DATA_AS_OF`,
`docker compose up -d web`.

## Backups

`auth` + `app` are the only state produced on the server; everything else is
reproducible from the Mac. Nightly (cron as `seap`):

```bash
docker compose -f /srv/seap/src/infra/prod/docker-compose.yml exec -T postgres \
  pg_dump -U seap -d seap -Fc -n auth -n app > /srv/seap/backups/state-$(date +%F).dump
```

Keep 14 days; copy off-box (object storage) once launched.

## Cloudflare in front

DNS is proxied (orange cloud), SSL mode Full (strict). The origin answers only
Cloudflare's IP ranges: `cf-ips.sh` (cron, weekly, as `seap`) writes the
ranges into `/srv/seap/caddy/*.caddy`, which the Caddyfile imports (request
filter + trusted proxies for real client IPs), and reloads Caddy on change.
Run it once by hand before the first `docker compose up -d caddy`.
