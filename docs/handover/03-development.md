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

Textul stocat al căutării din sertarele „Întreabă” (S6) nu e în dump: fără el sertarele caută pe nume, corect, dar „33600000” sau „s.r.l. bucuresti” pe toată țara durează secunde. Îl face, după `@seap/db build`, `PGOPTIONS='-c maintenance_work_mem=2GB' DATABASE_URL=… pnpm --filter ingestion source-search` (~9 min și ~7 GB pe copia întreagă; `maintenance_work_mem` local e 64 MB, de aici setarea producției). Scrie doar `marts.source_search*`.

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

Pentru teste PostgreSQL, citește testul înainte. Folosește o bază izolată `seap_test_*` și variabila cerută de acel test (`TEST_DATABASE_URL` sau altă configurație explicită). Unele integrări din ingestie deschid `createDb()` fără URL (de exemplu `marts.integration.test.ts`, `coverage.integration.test.ts`, `contract-reporting.integration.test.ts`): citesc `DATABASE_URL`, iar fără ea baza locală `seap`, unde își fac fixture-ul (DDL într-o tranzacție anulată). Când rulezi integrările pe o copie, pune și `DATABASE_URL` pe aceeași bază `seap_test_*`. Multe integrări sunt sărite fără DB de test: „unit passed” nu înseamnă că integrările au rulat. Nu rula seed-uri/truncate-uri de fixtures pe `seap`, `seap_collab` cu lucru personal sau producție.

O bază `seap_test_*` făcută cu `pg_dump --schema-only` din copia locală nu are rândurile pe care le scriu migrațiile: rândul lui `marts.contract_identity_source_state` (0083; fără el memoria amprentelor identităților nu se folosește, iar testul ei din `refresh.integration.test.ts` pică) și `app.collection_control` (fără el un preview răspunde 503). Copiază-le cu `pg_dump --data-only --table=…` din copia locală, doar citind din ea. `refresh.integration.test.ts` cere exact baza `seap_test_processing`; `lib/signals.integration.test.ts` (web, `TEST_SIGNAL_DATABASE_URL`) își șterge schemele `core` și `marts`, deci cere o bază nouă `seap_test_signals` sau `seap_test_audit_*`.

Fixture-urile motorului „Întreabă” (`lib/ask/test-fixture.ts`, și `rollups.integration.test.ts` din 25 octombrie) citesc și tabelele din afara `marts` (`core.entities`, `core.cpv_codes`, `reference.*`, lista `ENGINE_GLOBAL_TABLES`) din copii goale, în tranzacția lor anulată. Trec deci la fel pe o copie doar cu schema și pe o bază `seap_test_*` în care alt test a lăsat date (de exemplu catalogul CPV al fixture-ului „de aur”, care altfel numea feliile defalcării live, nu și pe cele din rollup-uri).

Viteza „Întreabă” se măsoară cu `apps/web/scripts/ask-perf.ts` (plan filtre §6.4), doar pe o bază locală (loopback), cu sesiuni `default_transaction_read_only=on`; nu scrie nimic și nu atinge serverul de dezvoltare:

```sh
pnpm --filter web exec tsx scripts/ask-perf.ts --code=<commit> --out=<dir>/perf.json --md=<dir>/perf.md [--compare=<dir>/baseline.json] [--only=catalog:trend,...]
```

Cazurile (`scripts/ask-perf-cases.ts`) sunt implicitele celor 13 întrebări din catalog, cele mai grele cazuri naționale exprimabile azi, selecții restrânse, surse și CSV, construite ca în constructor. Fiecare caz rulează în procesul lui: prima rulare cu cache-urile procesului goale, apoi la cald (mediana a `--warm-runs`, implicit 3), apoi sub `auto_explain` (ANALYZE, BUFFERS; cere drept de superuser local, altfel planul lipsește cu motivul scris). „Prima” înseamnă proces rece, nu disc rece. Pragul la cald: 1 s pentru un răspuns, 2 s pentru cazurile naționale grele, surse și CSV. Cu `--compare`, un caz mai lent decât baza cu peste 25% și peste 100 ms face comanda să iasă cu cod 1; amprenta rezultatului arată și răspunsurile schimbate. Un caz care nu mai pune întrebarea din bază (alt spec după `questionKey` sau altă selecție a sertarului) nu se compară: e listat separat, iar comanda iese tot cu 1. Cazurile cu eroare în bază sunt listate separat, cu timpul de acum. `--from=<json> --md=<md>` doar redă un raport existent. Parametrii din URL-ul `--db` devin setări de sesiune: `?plan_cache_mode=force_generic_plan` arată cum răspunde fiecare caz cu planurile generice la care ajunge o conexiune din pool după cinci execuții ale aceleiași instrucțiuni. Rezultatele stau în afara repository-ului. Nu rula măsurătoarea în paralel cu build-uri, teste sau alte interogări grele: timpii ies umflați (raportul notează backend-urile active și load-ul la pornirea fiecărui caz).

Din 24 octombrie `runSpec`, `runRows` și `withMonitoringSnapshot` încep fiecare tranzacție cu `set local plan_cache_mode = force_custom_plan` ([arhitectura](02-architecture.md#scheme-postgresql)), care bate setarea sesiunii. Cu `?plan_cache_mode=force_generic_plan` cazurile rămân deci la timpii planurilor personalizate; un caz mult mai lent în sondă decât în bază înseamnă o interogare cu parametri în afara acestor tranzacții. Prima rulare și cele 3 calde implicite sunt execuțiile 1–4, deci tot planuri personalizate, iar `--compare` nu vede ce face pool-ul după a 5-a execuție; pentru asta rulează cazul cu `--warm-runs=8` pe codul vechi și pe cel nou.

Baza locală din Docker nu are setările producției (`infra/prod/docker-compose.yml`). Cu `random_page_cost=4` local, după un `vacuum (analyze)` proaspăt, rețeaua și traseul banilor pentru o firmă mare (SELGROS, ~466k înregistrări) citesc tot `da_transactions` în loc de indexul firmei: 1,1 s în loc de 0,4 s (24 octombrie). Cu `?random_page_cost=1.1` în URL-ul `--db`, ca în producție, aceleași cazuri iau 0,21–0,25 s; compară cu baza tot cu această setare înainte să tratezi o astfel de diferență ca regresie. `/dev/shm` al containerului local are 64 MB, deci `vacuum` cu `maintenance_work_mem='2GB'` cade cu „could not resize shared memory segment”; local rulează `vacuum (analyze, parallel 0) marts.da_transactions` (producția are `shm_size: 2g`).

Linkurile vechi spre „Întreabă” au rezultate „de aur” (plan filtre §6.2). Pe fixture (bază `seap_test_*`, rollback, date fictive), testul trebuie să rămână verde după orice schimbare a motorului; o schimbare intenționată regenerează fișierul și se explică în commit:

```sh
TEST_DATABASE_URL=postgres://…/seap_test_<nume> pnpm --filter web exec vitest run lib/ask/golden-legacy.integration.test.ts
GOLDEN_UPDATE=1 TEST_DATABASE_URL=postgres://…/seap_test_<nume> pnpm --filter web exec vitest run lib/ask/golden-legacy.integration.test.ts
```

Pe copia locală (loopback, sesiuni read-only, fiecare cerere în tranzacția ei, `plan_cache_mode=force_custom_plan`; CSV-ul doar sub `--csv-max` înregistrări), rezultatele rămân în afara repository-ului:

```sh
pnpm --filter web exec tsx scripts/ask-golden.ts --code=<commit> --out=<dir>/golden-local.json [--compare=<dir>/golden-before.json] [--only=catalog:stat,...]
```

Un link nou spre „Întreabă” intră în `lib/ask/site-links.ts` (sau în constructorul comun al paginii), în `lib/ask/fixtures/site-links-inventory.ts` și în corpus (`lib/ask/fixtures/legacy-corpus.ts`); `site-links.test.ts` pică altfel.

Tipul instituției (D1) e o listă de id-uri citită o dată pe construirea marts (`lib/ask/authority-kind.ts`, `readAuthorityKinds`): un test de integrare care inserează sau șterge rânduri în `marts.entity_profile` fără `truncate` cheamă `forgetAuthorityKinds()` înainte de prima întrebare, altfel citește clasificarea veche a procesului.

O livrare care mărește o versiune de răspuns (`ANSWER_VERSIONS`, `KEY_VERSIONS`) se testează pe urmăriri ca în `lib/monitoring-kind.integration.test.ts`: verificarea de referință rulează cu livrarea dinainte (versiunea scoasă din tabel și, dacă se schimbă și calculul, codul vechi prin `vi.mock`), apoi verificarea de după livrare și încă una. Se cere o singură alertă, doar pe urmăririle care au cheia sau blocul, și nicio alertă pe celelalte.

O condiție nouă a unei întrebări se scrie o singură dată, în `lib/ask/predicates.ts`, în funcția nivelului pe care îl declară registrul (`rowPredicates`, `groupPredicates`, `profilePredicates`), cu textul ei în `displayPredicates`; răspunsul, sursele, CSV-ul și capturile o iau de acolo. `predicates.test.ts` pică dacă o cheie schimbă alt nivel decât cel declarat sau dacă SQL-ul afișat o omite. Tipul instituției se schimbă doar în `lib/ask/authority-kind.ts`.

Cuvintele ei se scriu tot o singură dată, în `lib/ask/filters/describe.ts` (`DESCRIBE`): cipul, pastila, rezumatul salvatei, rândul urmăririi, caveat-ul, nota surselor și cuvintele pentru „Din link” și linia de total. Orice număr cu substantiv trece prin `countWords` (`lib/ask/answer-text.ts`), și în componentele răspunsului, ale constructorului, ale interpretorului și ale urmăririlor. `filters/describe.test.ts` pică dacă o cheie a motorului nu are cuvinte, dacă un număr de la 20 în sus nu are „de” sau dacă un loc folosește un cuvânt retras de trusă (§4); `lib/ask/numerals-source.test.ts` pică la un număr scris de mână lângă substantiv în `app/intreaba`, `lib/ask`, `lib/intent` sau `app/urmariri`, iar `lib/ask/vocabulary-source.test.ts` la un cuvânt retras scris într-o sursă (comentariile nu contează). Un control nou al răspunsului are 44 × 44 px sub 600 px (`explore-compact.css`, sertarul în `evidence-drawer.css`) și text mic de cel puțin 4,5:1 în ambele teme; `app/intreaba/answer-a11y.test.ts` fixează regulile. Contrastul și țintele se măsoară în browser pe toate cele 13 întrebări (un script de măsurare, ținut în afara repo-ului, compune fondul fiecărui text și citește dimensiunile controalelor).

Propoziția unei întrebări se scrie în `lib/ask/filters/sentence.ts`, din cuvintele comune (`filters/words.ts`, `KIND_WORDS`/`KIND_ONE` din `question-ui.ts`), nu din texte proprii; un cuvânt nou pentru o condiție intră acolo și îl folosește și `describe.ts`. `filters/sentence.test.ts` fixează propozițiile linkurilor vechi și pică dacă o frază spune altceva decât `describeConditions` sau folosește un cuvânt retras de trusă (§4).

Ce oferă o întrebare se schimbă doar în `lib/ask/filters/blocks.ts` (`BLOCK_FILTERS`), iar o fereastră compusă în `filters/pickers.ts`; o editare a ciornei trece prin `filters/transition.ts` (`chooseValue`, `chooseQuestion`), care spune ce scoate sau pune deoparte. `filters/registry.test.ts` încearcă fiecare alegere și fiecare pereche de alegeri și pică dacă una e refuzată de motor, dacă ascunde o condiție sau dacă scoate una fără notă; o alegere care nu se poate aplica se dezactivează cu motivul în `choiceState`, nu se oferă ca să fie refuzată (R1).

Un link spre alt răspuns din „Întreabă” („›”) se construiește cu `retarget(spec, block)` (`lib/ask/filters/retarget.ts`), nu prin spread cu alt `block`; `filters/retarget.test.ts` caută în cod și pică altfel. O livrare care schimbă intenționat ce răspunde același spec își mărește versiunea în `lib/ask/answer-core.ts`: pe bloc în `ANSWER_VERSIONS`, pe cheie în `KEY_VERSIONS` (căile, blocurile și eticheta). Urmăririle acelui bloc sau ale acelei chei primesc o singură alertă de metodologie, iar diferența din fișierul „de aur” se explică prin versiune.

Verificarea „Întreabă” în browser (plan filtre §6.3) rulează pe un preview separat, nu pe serverul de dezvoltare comun de pe 3000: `NEXT_DIST_DIR=.next-preview pnpm --filter web exec next build`, apoi `NEXT_DIST_DIR=.next-preview NODE_ENV=production pnpm exec next start -p 3100` din `apps/web` (ignorat de git; build-ul adaugă `.next-preview/types` în `tsconfig.json`, cale care se scoate înainte de commit). Verificările de citire merg pe copia locală cu toate sesiunile doar în citire: postgres.js trimite parametrii URL-ului ca setări de sesiune, deci `DATABASE_URL=postgres://…/seap?default_transaction_read_only=on`. Fluxurile care scriu (salvare în cont, urmărire, captură) merg pe un al doilea preview (3101) peste o bază `seap_test_*` nouă: schema copiei locale (`pg_dump --schema-only`) cu istoricul `drizzle.__drizzle_migrations` (migrațiile de la zero nu creează schemele `app` și `auth`), fixture-ul „de aur” (`seedGoldenFixture`, cu `session_replication_role = replica` pentru că nu are documentele brute), rollup-urile (`buildAskRollups`), un checkpoint `ready` în `app.monitoring_refreshes` (fără el `/api/ask` răspunde ca în mentenanță), rândul 1 din `app.collection_control` (`paused`, fără mentenanță) și un cont nou de tip watchdog cu parolă aleatoare; fără SMTP, codul 2FA apare în jurnalul serverului. Scripturile (Playwright cu `playwright-core` și Chrome-ul sistemului) și capturile stau în afara repo-ului. Ce verifică: depășirea orizontală (și textul care iese din cutia lui: `html, body` taie pe x, deci `scrollWidth` singur nu ajunge), nimic tăiat, ținte de 44 px sub 600 px, (?) la atingere și la Enter în ecran, ferestrele în ecran și focusul întors, drumurile de tastatură, cuvintele retrase, fontul, erorile de pagină, cipurile fiecărui link din corpus față de `restoreLink` + `builderView`, și fluxurile care scriu.

Trendul (F2) adaugă: fiecare buton de grupă și „Toate · Prima dată” fără nicio cerere `/api/ask` (URL, titlu, pastile, constructorul în pas cu butonul, în ambele sensuri), radiogrupul de la tastatură (săgeți, Home/End, grupele goale sărite), sertarul fiecărei grupe cu antetul „Grupa „…”: N firme · X din Y”, CSV-ul afișat al unei grupe (`grupa`; lângă o firmă, din F4, sediul ei, coloana `sediu`), calea 409 făcută de server (lunile din cererea `/api/ask/rows` schimbate în browser: o singură reîncărcare, apoi eroarea în sertar), „Urmărește grupa” dezactivată peste 5.000 de membri (pe copia locală, doar în citire, cu sesiunea simulată în browser) și, pe baza `seap_test_*`, o urmărire de grupă cu membri fixați, apoi un checkpoint nou (înregistrări noi, rollup-uri reconstruite, rând `ready`) și „Verifică datele disponibile”: actualizarea compară grupa și notează mișcarea, iar urmărirea pe „Toate” arată „Totalurile grupei · Toate” cu „Număr în grupă”. Fluxurile cititorului autentificat (acțiunile răspunsului, fereastra „Salvează în anchetă”) se verifică și între 601 și 850 px, unde nu ajunge matricea 320/360/390/1280. Pentru `next start` cu `NODE_ENV=production` folosește `./node_modules/.bin/next`, nu `pnpm exec`: pnpm a cerut acolo reinstalarea modulelor.

F3 și F4 (partea S4-tests) adaugă: fiecare (?) are o cutie poziționată în pagină peste care se deschide (altfel definiția apare deasupra paginii; verificarea se face fără clic pe tot corpusul, apoi la atingere și la Enter), sursele și cele două CSV-uri ale fiecărui răspuns nou egale cu răspunsul (prin HTTP pe copia locală: înregistrări, lei, rândurile CSV-ului și suma `valoare_ron`; în browser: antetul sertarului și CSV-ul lui), numerele ferestrelor cerute doar la deschidere (răspunsul nu le așteaptă; o fereastră închisă își anulează cererea) și alertele de metodologie pe urmăriri: pe baza `seap_test_*`, punctul de plecare al unei urmăriri create din răspuns se rescrie (doar în baza de test) cum îl scria versiunea dinainte (fără `seat-2` sau `table:employees-2`), apoi un checkpoint nou și „Verifică datele disponibile”: exact o alertă „Metodologie modificată” cu nota versiunii, niciuna pe clasamentul instituțiilor, nimic la verificarea următoare. Scriptul de pornire a preview-ului citește secretul cu o cale absolută (după `cd apps/web` o cale relativă nu mai există, iar better-auth refuză secretul implicit).

F5, D2 și precalculul (partea S5-tests) adaugă: pe copia locală, în citire, tabelul cu „Firme noi” în cele trei sensuri, „Principalul lor client public” și „O firmă ia peste jumătate” (cifrele răspunsului, sertarul egal cu grupa listată, CSV-ul sertarului egal cu sertarul, „Rezultatul afișat · CSV” egal cu rândurile de pe ecran, „Unde e o firmă?” și „Vezi în tot clasamentul ›”), harta (lentila, `local_admin`, pe locuitor, cardul județului, sediul) și trendul național cu sertarul „Toate” și căutarea lui; pe baza `seap_test_*`, salvarea, urmărirea și captura pe întrebările F5, cu exact o alertă de metodologie acolo unde s-a mișcat o versiune. Două precondiții ale bazei de test: fixture-ul „de aur” nu are sediile firmelor, iar `seat-2` se atașează doar când `marts.entity_profile.seat_source` are valori (sonda din `lib/ask/mart-columns.ts`), deci înainte de verificările de metodologie se completează sediul în baza de test (`update marts.entity_profile set seat_county = county, seat_source = 'seap' where county is not null`) și se repornește preview-ul (sonda se ține 10 minute); iar rândul din `app.monitoring_refreshes` cu `status = 'ready'` și `app.collection_control` se copiază din copia locală, altfel `/api/ask` răspunde ca în mentenanță. Verificarea din browser de pe copia locală cere o stare de date: aceasta nu are luni complete confirmate (`completeUntil` gol), deci un trend cu `months: "auto"` care ajunge în anul în curs așteaptă în constructor („2026: luni neconfirmate”) și nu are „Întrebare aplicată”; sertarele naționale se măsoară cu `ask-perf` (cazurile `sources:table-suppliers-first-2025`, `csv:table-suppliers-first-2025`, `sources:breakdown-division-45-2025`), nu din timpul paginii, iar prima cerere după o repornire a serverului citește de pe disc (CSV-ul național de 100.000 de rânduri 22 s la rece, 3,1 s la cald). Sub 600 px, butonul „Șterge filtrele listei” al sertarului are 44 px.

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
| OTP nu vine pe email | Local, cu SMTP_HOST gol, este în consola web (`next dev` sau un preview cu `BETTER_AUTH_URL` loopback; altfel serverul de producție refuză trimiterea). |
| Job document rămâne în coadă | Local descărcarea este dezactivată intenționat; lipsa worker-ului/colectarea paused sunt distincte. |
| Admin nu estimează zile | Fără lot activ în copia publică sau fără eșantion reprezentativ; nu fabrica valori. |
| Build eșuează la fonturi | Verifică accesul temporar la Google Fonts; nu modifica identitatea vizuală pentru un eșec de rețea. |
| Date live diferite de local | Snapshot-uri/checkpoint-uri diferite; nu presupune bug înainte de a compara versiunile. |
| Migrare inițială goală eșuează | Onboarding-ul verificat folosește dump complet cu istoricul Drizzle și schemele bootstrapate. |
