# cinecâștigă?

Aplicație de explorare a achizițiilor publice din România, disponibilă la <https://cinecastiga.ro>. Fiecare rezultat trebuie să poată fi urmărit până la înregistrările publice SEAP/SICAP și TED care îl compun. Semnalele sunt piste de verificare, nu dovezi; valorile contractelor nu sunt plăți.

## Structură

- `apps/web`: site-ul (Next.js).
- `apps/ingestion`: importul datelor publice, normalizarea, calculele și semnalele.
- `packages/db`: schema PostgreSQL și migrațiile; `packages/domain`, `packages/scraper-clients`: tipuri și clienții surselor publice.
- `infra`: serviciile locale (`infra/docker-compose.yml`) și imaginile de producție.

Produsul și identitatea vizuală: [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md). Reguli pentru asistenți de cod: [AGENTS.md](AGENTS.md).

## Pornire locală

Cerințe: Node 22, pnpm 9.4.0, Docker cu Compose.

```sh
corepack enable && corepack prepare pnpm@9.4.0 --activate
pnpm install --frozen-lockfile
POSTGRES_PORT=127.0.0.1:5432 MEILI_PORT=127.0.0.1:7700 docker compose -f infra/docker-compose.yml up -d --wait
pnpm --filter @seap/db --filter @seap/domain --filter @seap/scraper-clients build
pnpm --filter web dev --port 3000
```

Clone-ul nu conține baza de date. Configurația locală (`apps/web/.env.local`) folosește secrete noi, generate local; nu se copiază nimic din producție. Dezvoltarea obișnuită nu face cereri către surse.

## Contribuții

Lucrează pe un branch propriu: un push pe `main` publică site-ul după CI.

## Licență

[GPL-3.0](LICENSE).
