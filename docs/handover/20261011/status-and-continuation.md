# Starea exactă și continuarea lucrului

Acesta este un checkpoint de lucru din 11 octombrie 2026, nu un monitor live. Citește ultima secțiune din [raportul intervenției](../../implementation/contract-reporting-integrity-20261011/README.md) pentru rezultatele finale ale comenzilor lansate după redactare.

**Continuare salvată la 12 octombrie:** [planul pentru clarificarea celor 1.272 de grupuri, prioritar cele 740 cu eligibilitate financiară](../continuation-20261012-contract-ambiguities.md). Acesta documentează următoarea analiză; nu declară cazurile rezolvate sau reparația publicată.

**Primul lot executat ulterior:** [raportul actual](../../implementation/contract-reporting-integrity-20261011/AMBIGUITIES-20261012.md) confirmă 275 de grupuri clarificate, 997 rămase / 484 cu eligibilitate financiară, pe copia izolată. Evaluatorul recurent acceptă conversiile dovedite și identificatorii străini confirmați în surse. Au fost recuperate prin citire 864 de detalii publice din arhiva producției pentru analiza următoare; nu sunt requesturi SEAP noi sau modificări live.

## Ce a cerut proprietarul acum

1. Repararea problemelor de date găsite în cercetarea watchdog și prevenirea reapariției.
2. După lucru, un handover complet în Markdown pentru un coleg și modelul său, cu contextul întregului proiect.

Nu a cerut în această etapă schimbarea ritmului, reluarea colectării, o nouă investigație publicată sau ștergerea arhivelor. Există autorizație istorică pentru operațiuni deja încheiate; aceasta nu este o invitație de a le reexecuta.

## Cod și medii

| Mediu | Stare |
|---|---|
| Branch de lucru | `fix/contract-reporting-integrity-20261011`, pornit din `main` la `d16d866` |
| Cod nou | Migrație 0072, clasificare financiară, descoperire de identități, revalidare, integrare în procesare, explicații de sursă și teste; necomis/nepublicat la redactare |
| Ultimul release documentat | `5488af2`, numai caiete de sarcini în download automat; CI/deploy 38157671237 trecute |
| Producție în această intervenție | Numai citire și export delimitat de date publice; zero mutații, zero requesturi SEAP, fără deploy/restart |
| Local `seap` obișnuit | Nemodificat de reparație; schema/datele nu sunt presupuse identice cu producția |
| `seap_test_currency_reporting_20261011` | Cohorta celor trei cazuri, reparată/reconciliată pentru verificare |
| `seap_test_currency_inventory_20261011` | Copia publică a anunțurilor repetate, tipuri proiectate și preflight național; nu publicare completă a datelor |
| `seap_test_currency_schedule_20261011` | Schemă izolată pentru testele care trunchiază starea procesării; fără date de utilizatori |

Producție observată la 23:18:14 RO: `maintenance=false`, `paused=false`, dar un `blocked_reason` de transport. Ultimul run `a12a5e51-1e13-47b1-bfe1-8a8e60dc5e3a`, full/ready/complete. Blocajul de colectare este separat de reparația de calcul și nu a fost reluat aici. Nu afirma că este încă la fel fără o citire actuală.

## Rezultatul reparației, până acum

Problemele inițiale sunt confirmate și reproduse:

- EWT/Sector 3: două plafoane și două comenzi, cu publicații repetate. Pe copie rămân două comenzi distincte, total 28.006.010 lei.
- CFR Călători/Oscar: plafon plus comenzi republicate și o comandă nouă. Pe copie rămân trei comenzi, total 61.945.000 lei.
- CNAB/X Guard: acte adiționale care afișează un total actualizat sau o valoare fără comandă nouă. Nu se adună ca achiziții noi; sursa de 75.900.253,44 lei rămâne vizibilă în detaliu. Nu este încă implementată reconcilierea generală a efectului fiecărui act asupra contractului de bază.

10 grupuri aprobate în baza izolată a cazurilor; reconcilierea populației are zero lipsuri eligibile, incluziuni excluse și diferențe de alocare. Aceasta nu validează singură întreaga țară.

Extinderea preflight-ului include 4.181 numere oficiale repetate, 8.578 publicații, 209.082 contracte și 267.622 relații cu câștigătorii. Toate cele 8.045 grupuri istorice trec verificarea surselor pe această copie. Sunt 77.246 grupuri candidate noi, dintre care **75.974 verificate**, **748 neclare cu posibil impact în totaluri** și alte 524 neclare fără eligibilitate financiară în regula curentă. Aceste categorii nu sunt număr de fraude.

Pentru dovezile lipsă s-a scanat dump-ul public din 30 septembrie, fără SEAP. Recuperarea a redus blocajele de la 66.706 la 748 și a eliminat `missing_archive` din grupurile blocate financiar. Rămân identități incomplete, valori/parteneri diferiți fără dovada modificării, contradicții arhivă/core și două multiplicități ambigue. [Registrul integral](../../implementation/contract-reporting-integrity-20261011/review-candidates.md) și [rezumatul structurat](../../implementation/contract-reporting-integrity-20261011/preflight-summary.json).

## Decizii confirmate de proprietar la 12 octombrie

1. **Toate plafoanele acordurilor-cadru sunt separate de totalurile contractelor**, inclusiv fără subsecvente identificate. Lipsurile înseamnă acoperire incompletă, nu zero cheltuieli.
2. **Grupurile incerte sunt excluse temporar, explicit în acoperire**, cu motive și surse publice. Nu blocăm întreaga publicare numai fiindcă aceste grupuri încă nu au dovadă suficientă. Nu le declarăm dubluri.

Codul aplică acum aceste decizii (`contract-reporting-2`, din 21 octombrie `contract-reporting-3` pentru grafiile titlului „acord-cadru” și `contract-reporting-4` pentru autoritatea înregistrată drept propriul câștigător; `rf-2026.7`). Migrația 0073 adaugă excluderile temporare și arhivele istorice recuperate. Calitatea registrului aprobat rămâne verificată strict; grupurile excluse sunt reverificate și pot reintra numai după dovadă. O excludere care dispare din candidare nu se ridică automat.

**Nu confunda implementarea locală cu aplicarea în producție.** Vezi [continuarea din 12 octombrie](../../implementation/contract-reporting-integrity-20261011/POLICY-20261012.md) pentru rezultate și procedura de publicare. Numerele 748/524 de mai sus sunt preflight-ul din 11 octombrie, înaintea noii reguli despre plafoane.

## Fișierele principale ale intervenției

| Fișier/modul | Rol |
|---|---|
| `packages/db/migrations/0072_flawless_shadow_king.sql` și meta | Două coloane nullable pentru tipul/proveniența contractului |
| `packages/db/src/contract-reporting.ts` | Regula unică de clasificare și contribuție financiară |
| `apps/ingestion/src/normalize/contract-reporting.ts` | Reparare incrementală a tipurilor, inclusiv dovezi istorice deja aprobate |
| `normalize/parsers.ts` | Persistă tipul la fiecare upsert din SEAP |
| `normalize/discover-contract-identities.ts` | Candidează republicări noi și cere surse pentru fiecare membru |
| `normalize/approve-contract-identities.ts` | Aprobări în loturi, dovadă/fingerprint exact, poartă finală, tranzacție a apelantului |
| `normalize/revalidate-contract-identities.ts` | Revalidarea originilor istorice și automate, fără rescrierea arbitrară a identității economice |
| `normalize/marts.ts`, `monitoring/validate.ts`, `flags/radiografie.ts` | Regula aplicată consecvent în calcule și reconciliere |
| `monitoring/refresh.ts`, `packages/db/src/processing.ts` | Versiune de reporting și prima publicare completă după schimbare |
| `apps/web/lib/marts.ts`, paginile contract/anunț/metodologie, coverage | Sume sursă păstrate, roluri și subtotaluri explicate |
| `scripts/rehearse-contract-reporting.ts` în ingestion | Repetiție a celor trei cazuri, blocată pe numele exact al bazei locale izolate |

În acest tabel căile abreviate `normalize/...` și `monitoring/...` sunt sub `apps/ingestion/src/`.

## Artefacte și proveniență

Director privat de lucru: `.local/contract-reporting-integrity-20261011/`, ignorat de Git. Conține exporturi publice delimitate, scripturi de extracție/copiere, jurnale și rapoarte mari. Nu conține un nou dump integral pentru coleg. Nu îl șterge înainte de a transfera dovezile necesare reparației.

- Backup sursă: `infra/prod/dumps/handover-local-20260930/database.dump`, SHA-256 `ace1825d9428197d0678b46bc4dd1ba3705ae07b3152b36d85feb2ce3ea26bef`.
- Bundle istoric: `infra/prod/dumps/dq02-evidence-20261003/approved-bundle.json.gz`, SHA-256 `c3a570b5ad4638778183c77b2e0a7385a3467ae6c22af1e012afd22151621596`.
- Prima extracție, patru răspunsuri: `recovered/award-raw.jsonl`, SHA-256 `6d23808f8e43635d4d42d9ccd0c5ab67c62e8e58aac63b62420adc07049c077a`.
- Extracția extinsă, 7.201 răspunsuri: `inventory-recovered/award-raw.jsonl`, SHA-256 `76c6eed28df10b7ca45529c6d97e8e57ee0ee9665fa46f67c6e5c93be5a70787`.
- Preflight complet: `inventory-recovered-groups.json` (~167 MiB), `inventory-recovered-summary.json`. Raportul mic și lista publică de revizuire sunt păstrate și în documentația repository-ului.
- Importurile cohortei cu extensia `.exact.jsonl` păstrează zecimalele exact. Primele `.json`, trecute prin Python float, nu sunt referința numerică.
- `repair_reporting.archives` există doar în baza izolată a inventarului; este o zonă de dovezi recuperate, nu un tabel migrat în producție și nici arhivă deja reparsată acolo.

La 11 octombrie răspunsurile erau recuperate numai pentru evaluare. **Acea limită a fost rezolvată în implementarea locală din 12 octombrie:** import persistent în `marts.contract_identity_archives`, verificare SHA-256 în tranzacție, citire la revalidare și procedură de instalare documentată în [POLICY-20261012](../../implementation/contract-reporting-integrity-20261011/POLICY-20261012.md). Procedura nu a fost executată în producție. Vechile `raw_id` nu se restaurează peste arhiva curentă și răspunsurile istorice nu se reparsază nediscriminatoriu peste versiuni noi. `repair_reporting.archives` de mai sus este zona istorică de lucru; tabelul `marts` este mecanismul persistent implementat.

## Verificări și comenzi

Au trecut: 253 teste unitare ingestion (incluzând cele 54 țintite); 13 integrări ingestion pe cohorta izolată; 16 teste ale calendarului/procesării pe o bază separată; o integrare a cititorului web pe cazurile reale; build al pachetului DB, typecheck ingestion/web și build web de producție într-un director separat. Cele două teste monetare au fost rerulate după ultima completare și au trecut. Jurnalele sunt enumerate în ultima secțiune a raportului intervenției. Nu numărăm testele sărite ca trecute.

Exemplu pentru suitele izolate, din rădăcina repository-ului, cu Node 22 și mediu local existent:

```sh
node --env-file=apps/web/.env.local scripts/operations/with-currency-db.mjs \
  seap_test_currency_reporting_20261011 \
  node apps/ingestion/node_modules/vitest/vitest.mjs run --root apps/ingestion --maxWorkers=1 \
  src/normalize/contract-reporting.integration.test.ts \
  src/normalize/discover-contract-identities.integration.test.ts \
  src/normalize/contract-money.integration.test.ts \
  src/normalize/marts.integration.test.ts \
  src/normalize/revalidate-contract-identities.integration.test.ts \
  src/normalize/scheduled-contract-identity.integration.test.ts
```

Wrapper-ul refuză o gazdă non-locală și o bază fără prefixul sigur. Baza trebuie să existe cu schema necesară; aceasta nu este o comandă de creare/migrare universală. Testele de processing din `packages/db/test/processing.integration.test.ts` trunchiază tabele de control și trebuie să folosească baza separată de schedule prin `TEST_DATABASE_URL`.

Actualizare 12 octombrie: interfața a fost verificată în browser (33 verificări, desktop/mobil/dark), iar cohorta repetată a fost recalculată și reconciliată pe copie. Nu s-a făcut o publicare/recalculare a întregii producții. Rezultatele actualizate sunt în raportul politicii din 12 octombrie.

## Ordinea continuării

1. Citește [rezultatele și procedura din 12 octombrie](../../implementation/contract-reporting-integrity-20261011/POLICY-20261012.md). Deciziile nu mai sunt în așteptare. Separarea plafoanelor, excluderile și persistența dovezilor sunt implementate; aplicarea în producție rămâne distinctă.
2. Nu uni arbitrar grupurile incerte. După [primul lot de clarificări](../../implementation/contract-reporting-integrity-20261011/AMBIGUITIES-20261012.md), 484 de grupuri din copia verificată au sume altfel eligibile, din 997 neclare în total. Datele originale rămân accesibile; 740/1.272 sunt referința anterioară lotului.
3. Înainte de producție instalează și verifică arhivele recuperate, configurează importul unic `contract-reporting-evidence-v1` și păstrează vechiul bundle. Urmează procedura de backup/frontieră/validare și prima recalculare completă.
4. Nu presupune că rularea pe cohorta repetată este o recalculare completă a întregii baze, a riscului sau a căutării. Verifică întregul pipeline de producție înainte de redeschidere.
5. Păstrează momentul mentenanței și operațiunile live explicite. Nu rezolva un blocaj separat de colectare și nu schimba rate/proxy-uri ca efect secundar.

## Alte limite și lucrări rămase, fără pornire automată

- Documente: recuperarea arhivelor multipart și unele eșecuri de asociere/inventar; formate neidentificate; refresh al atașamentelor apărute ulterior; extinderea familiilor suportate.
- Date: validarea istoriei complete SEAP rămâne distinctă de finalizarea lotului recent; arhive brute lipsă în alte populații; act adițional → efect financiar complet.
- Produs: „Ce bate la ochi” este pe branch separat, nu se reintegrează automat. Publicarea poveștilor necesită documentare și verificare editorială.
- Onboarding: bootstrap-ul reproductibil de la o bază goală; menținerea scripturilor de export la zi când apar noi tabele publice/private.
- E-mail/urmăriri: verifică activarea, SMTP și worker-ele înainte de a promite livrarea digest-urilor.
- Nu reintroduce proiectul de linkuri durabile la semnale ca prioritate: proprietarul a preferat anchete, date și întrebări; capturile existente rămân imuabile.

## Lucru preexistent, păstrat

La început erau deja necomise note în `HANDOFF.md`, `docs/handover/`, documentele identităților, `mockups/signal-citation/`, `.impeccable/`, cercetările watchdog și reviziile de parcurs. Acestea au fost păstrate. Indexul vechi al handoverului a fost mutat integral în `HISTORY-INDEX.md` pentru a nu pune statusuri istorice contradictorii în fața unui coleg nou. Nu folosi `git reset --hard` sau un staging global fără revizuire pentru a „curăța” această predare.
