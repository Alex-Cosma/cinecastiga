# Pornire locală și colaborare

## Cerințe

- Git, Node 22 LTS, pnpm 9.4.0, Docker cu Compose, Python 3.
- macOS/Linux sau Windows cu WSL 2. Scriptul de restore acceptă doar un context Docker local pe socket Unix; pentru Windows se rulează din WSL.
- Spațiu confortabil: **120 GB liberi** este o rezervă de planificare pentru baza locală de aproximativ 64 GiB, dump comprimat, WAL/indexuri temporare și imagini. Nu este o dimensiune măsurată a arhivei.
- Docker trebuie să aibă suficient spațiu în propriul disc virtual, nu doar pe discul gazdă. 8–12 GB RAM alocate și 2 joburi la restore sunt un punct de plecare; durata depinde de SSD/CPU/RAM.
- Nu este necesar acces SSH la producție pentru dezvoltarea obișnuită.

## 1. Repository și servicii locale

```sh
git clone git@github.com:Alex-Cosma/seap-new.git
cd seap-new
git switch -c work/numele-tau-onboarding
corepack enable
corepack prepare pnpm@9.4.0 --activate
node --version
pnpm install --frozen-lockfile
POSTGRES_PORT=127.0.0.1:5432 MEILI_PORT=127.0.0.1:7700 \
  docker compose -f infra/docker-compose.yml up -d --wait
pnpm --filter @seap/db --filter @seap/domain --filter @seap/scraper-clients build
```

Porturile din această comandă sunt publicate doar pe loopback. Dacă sunt ocupate, schimbă porturile gazdă și toate URL-urile locale corespunzătoare; PostgreSQL rămâne 5432 în container. Nu opri alte proiecte pentru a elibera portul.

Dacă ai primit codul prin `source.tar.gz`, poți lucra din directorul extras pentru prima pornire (sari peste clone/switch). Pentru colaborare cu PR-uri folosește un clone Git separat. Documentația, `AGENTS.md` și scripturile de handover sunt pe remote; folosește versiunea din checkout pentru codul curent. Arhiva de pe stick păstrează documentația de la împachetare și nu trebuie suprapusă peste un clone mai nou.

Acest compose pornește doar PostgreSQL și Meilisearch. Nu porni `ingestion dev`, profilul de colectare din producție sau cronul de noapte pentru onboarding.

## 2. Restore în bază nouă

Copiază întregul bundle primit separat (de exemplu de pe stick) într-un director precum `~/Transfers/handover-local-20260930/`. Clone-ul nu conține baza de date. Instalarea verificată folosește dump-ul cu istoricul migrațiilor; bootstrapul dintr-o bază goală nu este încă standardizat. Apoi:

```sh
python3 scripts/handover/restore-local.py \
  --bundle ~/Transfers/handover-local-20260930 \
  --database seap_collab --jobs 2
```

Scriptul verifică hash-ul și mărimea, creează o bază **nouă**, restaurează structura/datele/indexurile, verifică lipsa datelor private, apoi face ANALYZE. Refuză suprascrierea unei baze existente. La eroare păstrează noua bază pentru diagnostic; nu porni aplicația pe un restore incomplet. Nu folosi `--clean` pe baza ta curentă ca scurtătură.

`seap_collab` nu are conturi. `app.collection_control` este creat proaspăt: paused=true, processing_enabled=false, maintenance=false. Nu există joburi moștenite care să se reia în fundal.

## 3. Configurație web nouă

Din rădăcina repository-ului, generează o configurație locală fără a suprascrie una existentă:

```sh
python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('apps/web/.env.local')
if p.exists():
    raise SystemExit('Fișier existent: inspectează-l local, nu îl suprascrie.')
s='\n'.join([
 'DATABASE_URL=postgres://seap:seap_dev@127.0.0.1:5432/seap_collab',
 'MEILISEARCH_URL=http://127.0.0.1:7700',
 'MEILISEARCH_KEY=seap_dev_master_key',
 'BETTER_AUTH_URL=http://localhost:3000',
 'BETTER_AUTH_SECRET='+secrets.token_urlsafe(48),
 'DOCUMENTS_ENABLED=false',
 'SMTP_HOST=',
 'NEXT_TELEMETRY_DISABLED=1',
 '',
])
p.write_text(s)
p.chmod(0o600)
print('Configurație locală creată; secretul nu a fost afișat.')
PY
```

Cheile `MEILISEARCH_*` sunt cele folosite de aplicație; compose folosește `MEILI_MASTER_KEY`. Valorile de aici sunt exclusiv locale. Dacă schimbi master key-ul Docker, schimbă și `MEILISEARCH_KEY` în web și indexer.

Nu copia `.env` de producție, SMTP-ul real sau `BETTER_AUTH_SECRET` al altui mediu. `SMTP_HOST` gol face OTP-ul vizibil doar în consola serverului local; nu dezactivează singur verificarea 2FA. Pentru login local doar cu email și parolă, setează `LOCAL_DISABLE_2FA=true` în `apps/web/.env.local`. Opțiunea funcționează exclusiv cu `NODE_ENV=development` și URL-uri loopback pentru aplicație și DB; este ignorată în producție, inclusiv la `next start`. Nu modifică flagurile/secretele 2FA ale conturilor și nu marchează emailul ca verificat. `DOCUMENTS_ENABLED=false` păstrează citirea documentelor existente, dar dezactivează achiziția nouă.

## 4. Migrații noi și pregătirea căutării din copia locală

```sh
DATABASE_URL=postgres://seap:seap_dev@127.0.0.1:5432/seap_collab \
  pnpm --filter @seap/db db:migrate

DATABASE_URL=postgres://seap:seap_dev@127.0.0.1:5432/seap_collab \
MEILISEARCH_URL=http://127.0.0.1:7700 \
MEILISEARCH_KEY=seap_dev_master_key \
  pnpm --filter ingestion index-search
```

Această comandă pregătește și indexul PostgreSQL de titluri (`marts.topic_acquisitions`, migrațiile 0039–0040), apoi indexul de entități Meilisearch, fără SEAP. Prima pregătire a titlurilor parcurge arhiva publică și poate dura; pentru a o rula separat există `pnpm --filter ingestion index-topics`. Păstrează URL-urile explicite: utilitarele nu încarcă toate automat `apps/web/.env.local`. Căutarea poate fi goală până se încheie indexarea. Nu sunt necesare recalcularea marts sau risc pentru a folosi snapshot-ul restaurat.

## 5. Cont admin local

Din rădăcină; parola se citește fără a o salva în istoricul shell:

```sh
python3 -c '
import getpass,os,subprocess
email=input("Email local: ").strip()
password=getpass.getpass("Parolă nouă (minimum 10 caractere): ")
if len(password)<10:
    raise SystemExit("Parolă prea scurtă")
env=dict(os.environ,ADMIN_EMAIL=email,ADMIN_PASSWORD=password,
         DATABASE_URL="postgres://seap:seap_dev@127.0.0.1:5432/seap_collab")
subprocess.run(["pnpm","--filter","web","seed:admin"],env=env,check=True)
'
```

Seed-ul este idempotent pentru email și asigură2FA; **nu resetează parola unui cont existent**. Folosește pagina de cont sau mecanismul admin corespunzător pentru schimbare. Nu face manual insert de parole în clar. Cu `LOCAL_DISABLE_2FA=true` valid local, login-ul nu cere cod. În rest, cu SMTP local neconfigurat, citește codul din consola `next dev` după încercarea de login.

## 6. Pornire web

```sh
pnpm --filter web dev --webpack --port 3000
```

Deschide `http://localhost:3000`. Dacă alegi alt port, actualizează `BETTER_AUTH_URL` și repornește serverul. Webpack este un workaround verificat pentru anumite probleme locale de cache Turbopack; build-ul de producție rămâne standard.

Pentru pornirea web nu e necesar un worker de documente. Citirea PDF/OCR existentă este din PostgreSQL. Generarea asset-urilor PDF.js este inclusă în comenzile dev/build; nu muta worker-ul pe CDN.

## 7. Verificare manuală de onboarding

1. `/api/health` → `{"ok":true}`. Nu dovedește singur prezența datelor.
2. Home + căutare: găsește o instituție și un furnizor; verifică indexul dacă nu apar rezultate.
3. `/intreaba`: aplică o întrebare și deschide sursele. Verifică suma, paginarea și un link original.
4. Click pe titlul unui contract din drawer: tab nou, URL local corect, fără `0.0.0.0`.
5. `/domenii`: drill-down pe părinte și detaliu prin↗.
6. Profil → comparații: populație, grup editabil, toți anii/toate domeniile, surse.
7. Login cu contul nou; OTP din consolă dacă nu ai activat excepția locală 2FA. Creează o anchetă locală și salvează o dovadă mică.
8. Deschide un PDF deja arhivat și schimbă pagina; imaginea și OCR trebuie să corespundă.
9. `/admin`: Colectare, Procesare, Fișiere, Jurnal, Feedback și Conturi; contul nou, colectare oprită. Feedbackul privat, cozile și jurnalul de producție sunt intenționat absente.
10. DevTools și consola serverului: fără erori de schemă/migrații. Nicio cerere SEAP nu trebuie declanșată de simpla explorare.

Capturile sunt pornite de rutele web prin `after(() => processCapture(...))`; nu cer un worker SEAP separat. Urmăririle au worker dedicat: `apps/web/scripts/monitoring-worker.ts`, cu opțiunea `--once` pentru o verificare limitată. Acesta nu colectează SEAP și nu trimite email. Verifică `DATABASE_URL` înainte de pornire; digest-urile sunt o comandă separată.

## Teste și verificări pentru modificări

```sh
pnpm --filter web test
pnpm --filter ingestion test
node --test infra/prod/deploy.test.mjs infra/prod/process-nightly.test.mjs
pnpm turbo typecheck lint test build
```

Pentru teste PostgreSQL, citește testul înainte. Folosește o bază izolată `seap_test_*` și variabila cerută de acel test (`TEST_DATABASE_URL` sau altă configurație explicită). Multe integrări sunt sărite fără DB de test: „unit passed” nu înseamnă că integrările au rulat. Nu rula seed-uri/truncate-uri de fixtures pe `seap`, `seap_collab` cu lucru personal sau producție.

Viteza „Întreabă” se măsoară cu `apps/web/scripts/ask-perf.ts` (plan filtre §6.4), doar pe o bază locală (loopback), cu sesiuni `default_transaction_read_only=on`; nu scrie nimic și nu atinge serverul de dezvoltare:

```sh
pnpm --filter web exec tsx scripts/ask-perf.ts --code=<commit> --out=<dir>/perf.json --md=<dir>/perf.md [--compare=<dir>/baseline.json] [--only=catalog:trend,...]
```

Cazurile (`scripts/ask-perf-cases.ts`) sunt implicitele celor 13 întrebări din catalog, cele mai grele cazuri naționale exprimabile azi, selecții restrânse, surse și CSV, construite ca în constructor. Fiecare caz rulează în procesul lui: prima rulare cu cache-urile procesului goale, apoi la cald (mediana a `--warm-runs`, implicit 3), apoi sub `auto_explain` (ANALYZE, BUFFERS; cere drept de superuser local, altfel planul lipsește cu motivul scris). „Prima” înseamnă proces rece, nu disc rece. Pragul la cald: 1 s pentru un răspuns, 2 s pentru cazurile naționale grele, surse și CSV. Cu `--compare`, un caz mai lent decât baza cu peste 25% și peste 100 ms face comanda să iasă cu cod 1; amprenta rezultatului arată și răspunsurile schimbate. `--from=<json> --md=<md>` doar redă un raport existent. Parametrii din URL-ul `--db` devin setări de sesiune: `?plan_cache_mode=force_generic_plan` arată cum răspunde fiecare caz cu planurile generice la care ajunge o conexiune din pool după cinci execuții ale aceleiași instrucțiuni. Rezultatele stau în afara repository-ului. Nu rula măsurătoarea în paralel cu build-uri, teste sau alte interogări grele: timpii ies umflați (raportul notează backend-urile active și load-ul la pornirea fiecărui caz).

Din 24 octombrie `runSpec`, `runRows` și `withMonitoringSnapshot` încep fiecare tranzacție cu `set local plan_cache_mode = force_custom_plan` ([arhitectura](02-architecture.md#scheme-postgresql)), care bate setarea sesiunii. Cu `?plan_cache_mode=force_generic_plan` cazurile rămân deci la timpii planurilor personalizate; un caz mult mai lent în sondă decât în bază înseamnă o interogare cu parametri în afara acestor tranzacții. Prima rulare și cele 3 calde implicite sunt execuțiile 1–4, deci tot planuri personalizate, iar `--compare` nu vede ce face pool-ul după a 5-a execuție; pentru asta rulează cazul cu `--warm-runs=8` pe codul vechi și pe cel nou.

`check-navigation.mjs` folosește strict baza sintetică `seap_test_admin_navigation`, preview separat și date fictive. Nu îl îndrepta spre baza colaboratorului. Scripturile de browser pot cere Playwright și o instalare locală de Chromium; citește precondițiile lor.

Nu rula build și typecheck web concurent când regenerează aceleași `.next/types`. Un build cu `NEXT_DIST_DIR` temporar poate modifica automat include-urile din `tsconfig.json`; curăță doar căile generate ale acelui preview. Nu opri serverele celuilalt dezvoltator cu `pkill node`.

## Migrații noi

Începe de la schema și istoricul restaurate. Modifică schema Drizzle, generează migrația și inspectează SQL-ul/snapshot-ul/journal-ul. Nu accepta automat DROP-uri sau recrearea obiectelor existente din drift istoric. Testează pe o copie locală nouă, verifică compatibilitatea vechiului worker, apoi include migrația și metadatele în PR.

Aplicarea manuală locală a unei migrații aprobate poate folosi `DATABASE_URL=... pnpm --filter @seap/db db:migrate`. În producție folosește migratorul de deploy cu verificarea istoriei și granturilor. Nu rescrie checksum-urile vechi și nu folosi `drizzle push` ca mecanism de sincronizare cu live.

## Lucru în echipă — propunere de convenție

- Fiecare dezvoltator: branch/checkout propriu, bază proprie, cont propriu; PR-uri către main.
- **Orice push pe main poate publica automat.** Nu folosi main ca ramură de experimente. Protecția de branch/aprobările GitHub trebuie verificate separat; această documentație nu afirmă că sunt configurate.
- Include în PR problema, comportamentul final, verificările executate, migrațiile și orice cerință operațională. Nu masca teste sărite.
- Nu combina schimbări de UI cu operațiuni ireversibile asupra sursei. Nu relansa un script one-off pentru că are un nume promițător.
- Un singur responsabil pentru operațiuni pe live la un moment dat. Același lock coordonează deploy/publicare/export, dar comunicarea dintre oameni rămâne necesară.
- După o schimbare semnificativă, actualizează handover-ul/datele verificării. Nu adăuga doar încă o notă „pending” peste un incident rezolvat.

## Probleme frecvente

| Simptom | Verificare |
|---|---|
| Relație/tabel inexistent | Ai restaurat structura completă? DSN-ul indică baza corectă? Nu aplica automat toate migrațiile peste schema deja importată fără istoric. |
| Căutare fără rezultate | Meili rulează, cheia corespunde și indexarea s-a încheiat? |
| OTP nu vine pe email | Local, cu SMTP_HOST gol, este în consola web. |
| Job document rămâne în coadă | Local descărcarea este dezactivată intenționat; lipsa worker-ului/colectarea paused sunt distincte. |
| Admin nu estimează zile | Fără lot activ în copia publică sau fără eșantion reprezentativ; nu fabrica valori. |
| Build eșuează la fonturi | Verifică accesul temporar la Google Fonts; nu modifica identitatea vizuală pentru un eșec de rețea. |
| Date live diferite de local | Snapshot-uri/checkpoint-uri diferite; nu presupune bug înainte de a compara versiunile. |
| Migrare inițială goală eșuează | Onboarding-ul verificat folosește dump complet cu istoricul Drizzle și schemele bootstrapate. |
