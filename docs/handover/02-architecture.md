# Arhitectură și harta codului

## Stack și pachete

Versiunile efective se iau din `pnpm-lock.yaml`; valorile de mai jos sunt cele declarate la predare.

| Componentă | Rol |
|---|---|
| Node 22+, pnpm 9.4.0, Turborepo | Workspace TypeScript; pachete compilate în `dist` |
| `apps/web` | Next 16.2.10, React 19.2, App Router, interfață și API-uri |
| `apps/ingestion` | Colectare, normalizare, asocieri, agregări, validare, publicare, indexare |
| `packages/db` | Drizzle 0.45, postgres.js 3.4, scheme, migrații, politici comune de colectare/publicare |
| `packages/domain` | Tipuri și funcții ale domeniului |
| `packages/scraper-clients` | Clienți pentru sursele externe |
| PostgreSQL 16 | Sursa de adevăr pentru date, dovezi, autentificare și cozi |
| Meilisearch 1.16 | Index derivat pentru căutarea entităților |
| Better Auth 1.6 | Conturi create de admin, parolă și OTP obligatoriu pe email |
| PDF.js 6.3.289 | Randarea locală și sincronizată a paginii PDF |
| Playwright/Chromium, OpenSSL, Poppler, Tesseract | Preluarea documentelor și extragerea textului în worker |

```mermaid
flowchart LR
  S[SEAP / TED / date de referință] --> G[Control comun al cererilor]
  G --> R[raw: arhivă brută]
  R --> N[normalizare și asocieri]
  N --> C[core: entități și achiziții]
  C --> M[marts: statistici și populații de surse]
  M --> V[validare și checkpoint publicat]
  V --> W[Next.js + API]
  C --> I[Meilisearch]
  I --> W
  W --> A[app/auth: anchete, capturi, urmăriri]
  G --> D[documente publice, PDF și OCR în app]
  D --> W
```

Arhivarea este înaintea parsării. Transformările trebuie să se poată relua din răspunsul existent, fără o nouă colectare. O parte a istoricului normalizat a fost importată fără întreaga arhivă brută pe producție: nu presupune că orice rebuild total este posibil din producție fără inspecție.

## Scheme PostgreSQL

| Schemă | Conținut și tratament |
|---|---|
| `raw` | `raw_documents`, `ca_notice_ted`; răspunsuri brute, identitate și hash pentru deduplicare |
| `core` | Entități, ID-uri SICAP, achiziții directe, anunțuri, contracte, câștigători, TED, asocieri, flag-uri, praguri, watermark-uri, carantină |
| `marts` | Tabele statistice, profiluri, tranzacții pentru surse, Radiografie, TED, mostre de semnale |
| `reference` | CPV/sinonime, UAT, asocieri autoritate–UAT, bilanțuri MF, ONRC/reprezentanți |
| `auth` | Utilizatori, parole hash, sesiuni, verificări, material2FA — nu se distribuie |
| `app` | Dovezi/anchete/urmăriri private, rețete, control/cozi/audit; și documentele publice partajate |
| `drizzle` | Istoric migrații — trebuie păstrat cu snapshot-ul |
| `graphile_worker` | Infrastructură istorică de joburi; nu este coada de producție curentă pentru recuperare |
| `repair_20260927` | Copie tehnică temporară a arhivei TED; exclusă din transferul către coleg |

Nu clasifica întreaga schemă `app` drept publică și nici întreaga schemă drept dispensabilă: PDF-urile sunt în `app.document_blobs`, iar proveniența analitică în `app.monitoring_refreshes`.

Extensii necesare: `pg_trgm`, `unaccent`, `fuzzystrmatch`, plus `plpgsql`. Dump-ul logic păstrează definițiile lor. Nu se copiază volumul fizic PostgreSQL între arhitecturi Apple Silicon/Intel/Linux.

## Identități și precizie — capcane reale

- CUI-ul fiscal și ID-ul de participant SICAP sunt identificatori diferiți, chiar
  când ambele sunt numere valide. Prefixul autorității în arhiva DA 2020 este CUI;
  vechea interpretare ca SICAP a produs fragmentări și atribuiri către instituții
  greșite. [Audit și reparație documentată](../implementation/entity-identity-repair.md).
- `core.entity_redirects` păstrează legături verificate vechi→canonice, fără lanțuri
  sau cicluri. Rândurile entităților vechi rămân pentru referințe; întrebările vii
  rezolvă ID-urile canonice, capturile înghețate nu sunt rescrise. Numele identic nu
  justifică unirea unor CUI-uri diferite. Migrarea 0046 creează mecanismul, nu execută
  automat reparația datelor istorice.
- `core.contracts.id` este ID intern; `ca_notice_contract_id` este identitatea externă folosită de pagina contractului. `marts.contract_transactions.contract_id` este **intern**.
- Bridge: `apps/web/app/contracte/i/[cid]/route.ts`; răspunsul are Location relativ. În drawer se păstrează tabul original.
- ID-urile `core.flags` și `marts.lot_patterns` se pot regenera. O captură durabilă leagă un descriptor și hash/versiune, nu doar un număr reutilizabil.
- Totalurile contractelor atribuite unui consorțiu pot reprezenta alocări estimate egal între membri când nu există valori individuale. Nu dubla suma însumând contractul integral pentru fiecare câștigător.
- Cantitățile, monedele, intervalele și plafoanele TED nu devin automat valori RON scalare. Proveniența câmpului și tipul sumei sunt păstrate.
- Modurile `profiles` și `transactions` au populații diferite. Pentru linkuri vechi se conservă semantica istorică.
- Un nume afișat lângă un ID nu schimbă identitatea întrebării. Rezolvarea tardivă a etichetei nu trebuie să marcheze un formular ca modificat.
- Comparațiile și dovezile leagă și checkpoint-ul datelor; compararea a două momente diferite fără indicare explicită este greșită.

## Harta principalelor module

Toate căile sunt relative la rădăcină.

| Subiect | Unde începi |
|---|---|
| Layout, fonturi, teme | `apps/web/app/layout.tsx`, `globals.css`, `approved.css`, `lib/site.ts` |
| Întrebări | `apps/web/lib/ask/spec.ts`, `compile.ts`, `population.ts`, `population-sql.ts`, `resolved-spec.ts`, `source-spec.ts`, `evidence.ts`, `permalink.ts` |
| Drawer și surse | `apps/web/app/intreaba/EvidenceDrawer.tsx`; `lib/source-evidence.ts`, `signal-evidence.ts`, `radiografie-evidence.ts` |
| Dovezi imuabile | `lib/evidence-capture-input.ts`, `evidence-captures.ts`, `evidence-captures-shared.ts`, `evidence-bundle.ts`, `evidence-zip.ts` |
| Anchete și permisiuni | `lib/investigation-access.ts`, `investigation-workspace.ts`, `workspace-api.ts`; `app/anchete/` |
| Rețete | `lib/recipes.ts`, `app/api/recipes/`, `app/intreaba/RecipeShelf.tsx` |
| Urmăriri | `lib/monitoring*.ts`, `app/urmariri/`, `app/api/urmariri/`, `scripts/monitoring-worker.ts` |
| Digest email | `lib/monitoring-digests.ts`, `scripts/monitoring-digests.ts` |
| Legături | `lib/connections*.ts`, `connection-evidence*.ts`, `app/entitati/[id]/legaturi/` |
| Comparații | `lib/peers*.ts`, `peer-population.ts`, `app/api/peers/`, `app/entitati/[id]/comparatii/` |
| Populație RPL2021 | `apps/web/lib/reference/population-rpl2021.json`; `packages/db/scripts/parse-population-rpl2021.py` |
| Fișiere | `apps/web/lib/documents/{store,seap,worker,process,rate-limit,shared}.ts`; `apps/web/scripts/documents/worker.ts` |
| Admin | `app/admin/layout.tsx`, `AdminNavigation.tsx`, `CollectionDashboard.tsx`, `RecoveryOverview.tsx`, `DocumentQueue.tsx`; `lib/admin/` |
| Estimare recuperare | `lib/admin/recovery-status.ts`, `recovery-forecast.ts` și testele lor |
| Autentificare | `apps/web/lib/auth.ts`, `mail.ts`, `scripts/seed-admin.ts`; `packages/db/src/schema/auth.ts` |
| Colectare durabilă | `apps/ingestion/src/scripts/collection.ts`, `src/collection/` |
| Poarta comună SEAP | `packages/db/src/collection.ts`, `collection-policy.ts`, `collection-quiet-window.ts`, `collection-retry.ts`, `collection-diagnostics.ts` |
| Publicare și validare | `apps/ingestion/src/monitoring/{refresh,pipeline,validate,coverage,cli}.ts`; `packages/db/src/processing.ts` |
| Parsare/asociere TED | `apps/ingestion/src/normalize/{ted,ted-fforms,ted-load,ted-replay,reconcile,ted-mart}.ts` |
| Flux de colectare TED (oprit până la `ted-enable`): pachetul zilnic OJ S, verificat cu căutarea TED | `apps/ingestion/src/collection/{ted,ted-activation,advance}.ts`, `src/scrape/ted/{collection-client,package}.ts`; ținte în `packages/db/src/collection-policy.ts` |
| Index de căutare | `apps/ingestion/src/search/index-entities.ts`, `src/scripts/index-search.ts`; `apps/web/lib/search.ts` |
| Deploy și scheduler | `infra/prod/deploy.sh`, `process-nightly.sh`, Dockerfiles, compose; `.github/workflows/ci.yml` |
| Migrații | `packages/db/migrations/`, `src/schema/`, `scripts/deploy-migrate.mjs`, `migration-history.mjs` |

Pentru o cale redenumită folosește `rg --files`, nu presupune că această hartă înlocuiește codul.

## Capturi și exporturi

Captura se reconstruiește pe server din identitatea selecției; un browser nu poate inventa totalul, lista de membri sau sursele. Copiere SQL-to-SQL într-un snapshot repeatable-read, valori zecimale exacte, versiuni imuabile și acces verificat din nou la publicare. Selecțiile nominale foarte mari au limite explicite; nu se trunchiază în tăcere. Exportul live CSV și captura integrală au mecanisme/limite distincte.

ZIP64 permite pachete mari cu CSV/NDJSON, metodologie, istoric și manifest SHA-256. Nu afirmăm că un ZIP conține toate binarele externe dacă oferă doar referințele lor.

## Documente — mecanismul real

Pentru familiile suportate se rezolvă anunțul prin identitate și autoritate, apoi se citește lista. Nu orice familie de anunțuri are încă implementată preluarea. Pilotul verificat folosește SCN/type 17, de exemplu `https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/100231768`. URL-ul de fișier nu este identitate durabilă.

Worker-ul folosește o sesiune Chromium nouă, metadata proaspete, POST de verificare urmat de GET în aceeași sesiune, cu Referer-ul familiei corecte. Un GET izolat cu hash vechi poate eșua deși browserul utilizatorului descarcă fișierul. Nu copia Cookie/Authorization/chei din DevTools în cod sau documente. Doar cererile allowlistate ies din browser; resursele și redirecturile nepermise sunt blocate.

Actualizare 11 octombrie: vechile limite de 50 MiB/150 pagini au fost înlocuite cu transport/stocare în bucăți și procesare OCR reluabilă. PDF/CMS, Word/Excel, ZIP/RAR/7z sunt tratate de toolchain; multipart rămâne deschis. Originalele și PDF-urile derivate sunt separate, cu SHA-256. Supervisor-ul exclusiv permite până la 10 lane-uri de rețea și 4 de procesare; nu mai este un singur job global. [Mecanism și limite actuale](20261011/operations.md), [formate](../implementation/document-formats-20261011.md).

## Căutarea `/cauta` — două cereri

Actualizare 22 octombrie 2026. Pagina face două cereri pentru aceeași selecție (subiect, loc, perioadă, tip, potrivire):

- `/api/topic-search` — titluri (`marts.topic_acquisitions`), instituții și firme, locul ales, data indexului și acoperirea titlurilor. Nu atinge documentele; răspunde de regulă sub o secundă.
- `/api/topic-search/documents` — pasajele din documentele pregătite și acoperirea lor („X din Y fișiere”). Pagina o cere în paralel, o afișează separat („Căutăm și în documentele procedurilor…”) și nu blochează restul. O eroare rămâne în secțiunea Documente, cu „Reîncearcă documentele”. Schimbarea tabului sau a paginii de achiziții nu o repetă (`documentScope` în `lib/topic-search/shared.ts`).

Textul paginilor este indexat în `app.document_page_search` (`to_tsvector('simple', unaccent(text))`, GIN), aceeași expresie ca la titluri. `unaccent()` nu este IMMUTABLE, deci nu poate susține o coloană generată sau un index pe expresie; vectorul este scris de un trigger pe `app.document_pages` (migrația 0079). Astfel sunt indexate și paginile scrise de un worker vechi sau de orice alt scriitor; o pagină peste limita tsvector (1 MB de lexeme) rămâne citibilă, dar nu apare în căutare. Ștergerea paginii șterge și vectorul (cascadă).

Legătura document → procedură rămâne cea de dinainte: anunțul documentului → `core.notices` → `procedureId` din payload-ul brut **și** același cumpărător → contractul din `topic_acquisitions` care respectă filtrele. Niciodată după titlu sau nume de fișier. Se calculează o singură dată pe cerere și pe anunț (nu de trei ori și nu pe fiecare fișier), într-o singură interogare. Nu este materializată: un document procesat acum este căutabil imediat, fără să aștepte procesarea de noapte. Dacă numărul de anunțuri cu documente crește mult, materializarea legăturii în build-ul nocturn rămâne opțiunea următoare, cu prețul acestei întârzieri.

Pe pagină, o căutare nouă nu mai arată rezultatele căutării anterioare: zona păstrează înălțimea cu rânduri-schelet până sosesc rezultatele selecției curente. La schimbarea doar a tabului sau a paginii, numerele din taburi rămân, pentru că aparțin aceleiași selecții. În „Unde cauți?”, după ce modifici textul, prima potrivire este evidențiată și Enter o alege; numele locului deja aplicat nu contează ca text scris (multe localități au același nume în județe diferite), iar un Enter apăsat înainte de sosirea sugestiilor nu alege singur când primele potriviri au același nume.

### Căutarea de pe prima pagină și „Am înțeles” (22 octombrie 2026)

Caseta de căutare (prima pagină și dialogul din antet, `app/DiscoverySearch.tsx`) cere în paralel, cu un singur debounce și cu anularea cererilor vechi: `/api/intent` (interpretorul cu reguli), `/api/suggest` (subiecte CPV și sinonime, localități, persoane; pentru textul întreg și separat pentru ultimul cuvânt, ca „iluminat buz” să propună Buzău) și `/api/search` (instituții și firme din Meilisearch). Gruparea și ordinea sunt în `lib/search-suggestions.ts` (pur, testat): „Cel mai probabil cauți” (propoziția interpretorului, neschimbată, doar la încredere mare/medie; o lectură ambiguă apare ca alegere, nu ca răspuns), Subiecte, Locuri (cu celelalte cuvinte: „iluminat · Județul Buzău” → `/cauta?q=iluminat&place=county:buzau`), Instituții, Firme, Persoane (doar când textul pare un nume), apoi „Caută „…” în titluri și documente” (`literal=1`, fără interpretare). Un subiect găsit doar pe un fragment de cuvânt din catalog („construct” → „Construcţie de canale”) e o lectură slabă: firmele vin primele. Dacă `/api/intent` cade, celelalte grupuri rămân. Enter fără un rând ales cu săgețile deschide `/cauta?q=…` (decizia proprietarului 2).

`/cauta` cere întâi `GET /api/topic-search/interpretation` (aceiași parametri; interpretorul rulează pe server, cache 10 minute, limită 3 s) și abia apoi titlurile și documentele, cu selecția aplicată (`lib/topic-search/interpretation.ts`): locul și perioada numite în cuvinte devin filtre doar dacă URL-ul nu are deja filtre, interpretorul a ales o singură lectură și rămân alte cuvinte de căutat („iluminat buzau” caută „iluminat” cu filtrul Județul Buzău; „primaria buzau” rămâne căutare după nume). O localitate ambiguă nu se aplică: variantele apar ca butoane. Sectoarele Bucureștiului nu au filtru în `/cauta` și rămân cuvinte. Un subiect găsit pe un fragment de cuvânt din catalog nu e tratat ca subiect nici aici; un sinonim flexionat se caută în forma de bază („medicamentele buzau” → „medicamente” în Buzău). Firme sau persoane cu același nume trimit la alegerea din Întreabă. Dacă interpretarea eșuează sau întârzie, se caută cuvintele exact cum au fost scrise. Rezultatul apare ca „Am înțeles: Subiect · Loc · Perioada”, cu cipuri care se pot scoate sau schimba (orașul în loc de județ, tot județul, alt subiect, „caută exact ce ai scris”). Modificarea unui filtru transformă locul/perioada din cuvinte în filtre explicite.

„Pe scurt” (doar cu subiect și fără ambiguitate) rulează prin `/api/ask` două specificații construite de interpretor (`specFor`): totalul (`stat`) și primii trei câștigători (`table`, `topN: 3`), cu propozițiile lor exacte și domeniile CPV incluse; nu există SQL nou de bani. Locul din Ask are semantica lui: o localitate înseamnă primăria (vezi `uatScopeCaveat`), în timp ce filtrul de localitate din titluri include instituțiile asociate localității; propoziția spune care e cazul. Potrivirea puternică de nume („Cauți această instituție?”) rămâne sus când nu e subiect și coboară sub titluri când e. Cu 0 titluri, pagina propune: tot județul, toată țara, toți anii, întrebarea în Întreabă, documentele și subiecte apropiate.

**Vocabular (migrația 0080).** `reference.cpv_synonym` vine din `packages/db/seeds/cpv-synonyms.sql` (rulat manual, truncate + insert). Migrația `0080_cpv_synonym_beginner_terms` adaugă 82 de rânduri (insert … on conflict do nothing, nimic șters), iar seed-ul are același bloc, deci un re-seed reproduce starea. Exemple: „iluminat” = lămpi (31500000) **plus** iluminat stradal (34993000, 34928500), instalare (45316000, include semnalizarea) și întreținere (50232000, include semafoarele); „iluminat public”, „iluminat festiv”, „crăciun”, „sărbători”, „gropi”, „trotuare”, „deszăpezire”, „rechizite”, „laptop”, „tablete”, „transport elevi”, „renovare”, „reabilitare”, „termoizolare”, „parcuri”, „spații verzi”, „locuri de joacă”, „publicitate”, „evenimente”, „festival”, „artificii”, „cărți”, „manuale”, „imprimante”, „camere video”; „apă” primește distribuția de apă și conductele. Pe datele locale, „iluminat” în județul Buzău trece de la 6,9 mil. lei (1.852 înregistrări, doar lămpi) la 114,4 mil. lei (2.553). Nu am adăugat „lucrări de instalații electrice” (45310000): titlurile de iluminat sunt des clasificate acolo, dar clasa e prea largă; titlurile le găsesc oricum.

**Motorul (`lib/ask/ground.ts`).** Un termen care are rânduri proprii în `cpv_synonym` înseamnă exact acele rânduri (toate). Înainte, motorul lua cele mai lungi 4 rânduri care conțin termenul sau sunt conținute în el, ca șir de litere: „apa” aducea și „aparatura medicala” (33100000) și apa minerală, iar un termen cu multe rânduri putea fi tăiat de termeni mai lungi. Fără rânduri proprii, rămâne regula veche (acum cu ordine deterministă), apoi trigramele din catalog. Răspunsurile salvate cu `cpvTerm: "apa"` se schimbă în consecință (corecție). Cuvinte care rămân greșit înțelese și nu se repară prin sinonime (sunt cuvinte de loc sau de instituție, de reparat în interpretor): „strada” → Iluminat stradal, „primărie/primării” → Siliconi primari, „direcția” → coloane de direcție, „lucrări” → termenul generic 45000000.

## Migrații și restaurare

Schema curentă include obiecte `auth`, `app`, `reference` bootstrapate istoric și apoi reflectate în snapshot-uri Drizzle. Migrarea de la o bază complet goală **nu este procedura verificată de onboarding**. Folosește dump-ul care include structura și istoricul exact; nu sintetiza manual baseline-uri.

`0005` are un checksum istoric compatibil tratat explicit după verificarea structurii `national_stats`. Nu rescrie istoria migrațiilor ca să elimini avertismentul. Migrațiile noi trebuie să păstreze compatibilitatea cu worker-ul încă pornit pe vechea versiune. Proiecțiile `SELECT *` în prepared statements au produs deja un incident la adăugarea coloanelor; folosește coloane explicite în controlul de lungă durată.

## Registrul semnalelor și Radiografie

Cele 13 tipuri de întrebări nu sunt același lucru cu cele 13 familii de semnale. Registrul de calcul este `apps/ingestion/src/flags/methodology.ts` (versiune declarată `rf-2026.6` la consolidarea din 11 octombrie); prezentarea web este în `apps/web/lib/flags.ts`. Schimbarea unei reguli necesită metodologie/versionare, surse, teste și validarea consecințelor asupra checkpoint-urilor, nu doar schimbarea unui label.

| Cod | Denumire în interfață |
|---|---|
| `da_split` | Fracționare sub prag |
| `da_concentration` | Concentrare pe un furnizor |
| `da_dependence` | Dependență de o autoritate |
| `da_rapid` | Finalizare fulger |
| `da_round` | Valoare aproape de prag |
| `da_year_end` | Vârf de final de an |
| `award_no_competition` | Negociere fără publicare prealabilă |
| `award_single_bid` | O singură ofertă raportată în TED |
| `award_concentration` | Concentrare pe un câștigător |
| `award_dependence` | Furnizor captiv unei autorități |
| `fin_tiny_staff` | Firmă minusculă, bani publici mari |
| `fin_public_reliance` | Dependență de bani publici |
| `net_shared_admin` | Firme surori la aceeași autoritate |

Definițiile, ferestrele temporale, clasificarea după tip/data de referință și excluderile sunt în cod/teste; nu aplica automat pragul actual întregului istoric. Valoarea estimată, valoarea de închidere, plafoanele și plățile au semantici diferite. „O singură ofertă” necesită un număr raportat și asociere confirmată; egalitatea prețului minim/maxim sau numărul membrilor unui consorțiu nu demonstrează acest lucru.

Radiografie este un pipeline distinct (`apps/ingestion/src/flags/radiografie.ts`, cititor `apps/web/lib/radiografie.ts`): concentrare, dependență, fracționare și tipare între loturi/parteneri (`rotatie`, `impartire`, `maturare`, `consortiu`). Fiecare observație trebuie să ducă la grupul exact de înregistrări. Radiografie se actualizează zilnic; faptul că flag-urile/CRI sunt săptămânale nu înseamnă că toate observațiile analitice sunt săptămânale.
