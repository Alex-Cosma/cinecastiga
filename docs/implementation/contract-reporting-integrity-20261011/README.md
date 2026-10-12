> **Actualizare 12 octombrie:** ambele decizii au fost confirmate și implementate local. Citește [politica, rezultatele și procedura pregătită](POLICY-20261012.md). Numerele și întrebările de mai jos rămân cronologia din 11 octombrie; nu sunt starea curentă a implementării.

# Integritatea valorilor și republicărilor — 11 octombrie 2026

**Cod și verificări locale; reparație încă NEPUBLICATĂ.** Branch `fix/contract-reporting-integrity-20261011`, necomis. Producția NU a fost modificată. **Secțiunea finală din 23:18 RO are prioritate față de checkpoint-urile intermediare de mai jos.** Utilizatorul a cerut repararea problemelor găsite în cercetarea watchdog și prevenirea lor; ulterior a cerut un handover exhaustiv al proiectului.

## Cauze confirmate

1. Procesarea zilnică reverifică numai cele 8.045 de identități aprobate istoric; nu descoperă grupuri noi.
2. Filtrarea plafoanelor caută `subsecvent` în titlu și numai în aceeași publicație. SEAP are `contractType=2` pentru acord și `3` pentru subsecvent chiar când titlul nu conține aceste cuvinte.
3. Acte adiționale sunt uneori codate ca tip 3; valoarea lor poate fi total actualizat, diferență sau sumă fără impact nou. Un total de 75.900.253,44 nu este un increment de aceeași valoare.
4. Unele publicații vechi nu mai au arhiva brută în baza actuală. Nu pot fi deduplicate numai pe baza sumei.

## Decizie de produs încă în discuție

S-a trimis o întrebare asincronă: separăm TOATE plafoanele de acord-cadru de totalurile contractelor, chiar și când lipsesc subsecventele? **Nu a sosit răspuns în momentul acestui checkpoint.** Implementarea curentă păstrează politica existentă pentru plafoanele fără subsecvente; nu presupune aprobarea unei schimbări generale. Orice total rămas de plafon nu reprezintă plăți.

## Implementare WIP

- Migrație aditivă 0072: `core.contracts.source_contract_type`, `contract_type_raw_id`.
- Parserul păstrează tipul și proveniența la fiecare upsert; reparația incrementală completează istoricul din arhiva exactă fără a rescrie sumele.
- `packages/db/src/contract-reporting.ts`: clasificare comună contract/framework/calloff/amendment/review; addenda neaditive; comparație plafon–subsecvent după anunț oficial + autoritate + lot, peste republicări.
- Aceeași selecție în marts și reconcilierea populației; Radiografia nu mai etichetează toate contractele unui anunț-cadru drept plafon.
- `discover-contract-identities.ts`: descoperire a grupurilor noi, dovezi pentru fiecare membru, selectarea ultimei versiuni numai cu dovadă și ordine verificată; blocare dacă o identitate cu impact financiar nu poate fi dovedită.
- Aprobări noi numai în procesare cu backup verificat, mentenanță, colectare oprită, raw boundary și revizie de control neschimbată. Arhivele și istoricul rămân accesibile.
- Reverificarea ulterioară recunoaște aprobările automate auditate, nu doar vechiul bundle.
- Pagina contractului și metodologia explică actele neaditive; acoperirea numără aceste publicații și tipurile neclare.
- Nu există implementare generală care să lege automat fiecare act adițional de baza sa. Nu extragem sume arbitrar din text. Actele separate rămân neaditive și necesită documente pentru stabilirea efectului; politica pentru versiuni dovedite ale aceluiași contract rămâne ultima versiune verificată o singură dată.

## Repetiție pe date reale

Baza nouă izolată `seap_test_currency_reporting_20261011`: copie read-only a celor trei familii CAN1080811/CAN1170804/CAN1171713; 7 anunțuri, 28 contracte, 28 câștigători, inițial 10 arhive. Apoi recuperate 4 arhive din backup-ul public 30 septembrie:

- SHA256 backup: `ace1825d9428197d0678b46bc4dd1ba3705ae07b3152b36d85feb2ce3ea26bef`.
- Scanate 17.087.659 rânduri, 2 anunțuri țintă (100532825 și 100639950), 4 răspunsuri extrase, 174,698 secunde.
- SHA256 fișier extras: `6d23808f8e43635d4d42d9ccd0c5ab67c62e8e58aac63b62420adc07049c077a`.
- Datele extrase sunt ignorate de Git: `.local/contract-reporting-integrity-20261011/recovered/award-raw.jsonl`.
- S-au arhivat și reparsat NUMAI în baza izolată, cu parserul real; nicio cerere SEAP.
- 10 grupuri verificate și aprobate pe copie; zero `eligible_missing`, `excluded_included`, `allocation_mismatches`.
- EWT: 28.006.010 RON, cele două subsecvente; plafoanele separate/excluse pentru aceste loturi.
- CFR/Oscar: 61.945.000 RON, cele trei subsecvente distincte; plafonul separat/exclus.
- CNAB: actele nu se adună; plafonul original de 72.208.562,72 RON rămâne în politica curentă (nu plăți, nu valoare incrementală, nu total curent verificat). Decizia generală despre plafoane încă deschisă.

## Validare în curs

54 teste pure trecute (identitate 37, descoperire 10, pipeline 7). Teste DB: clasificare 1 + monede 2 trecute. Testele vechi de marts au fost adaptate pentru loturi explicite și eliminarea inferenței la nivel de anunț; 6 trecute după această adaptare. Revalidare și reparație programată: 2 trecute. Noua integrare de descoperire a găsit un insert de audit fără `before`; corectat, **trebuie rerulat**. Typecheck ingestion/web a trecut înaintea ultimelor teste/schimbări; rerulați la final.

## Următorii pași înainte de producție

1. Finalizarea testelor, verificare negativă/idempotentă, politica plafoanelor.
2. Preflight pe întreg inventarul de anunțuri repetate, nu numai cele trei exemple. Export în curs la checkpoint în baza NOUĂ `seap_test_currency_inventory_20261011`: 4.181 numere oficiale / 8.578 publicații; 209.082 contracte, 267.622 relații cu câștigători. Script și jurnal în `.local/contract-reporting-integrity-20261011/`.
3. Verificați reglementarea primei publicări complete: schimbarea populației cere recalcularea semnalelor, nu reutilizarea riscului vechi. Guard/migrare operațională încă de completat.
4. Recuperarea arhivelor în producție trebuie făcută prin `archiveDocumentsSql`, cu checksum și audit, înainte de raw boundary; nu importați vechile raw ID-uri ca și cum ar fi globale. Nu există încă scriptul final de aplicare.
5. Nu faceți push pe main înaintea preflight-ului și a planului de publicare. Push main declanșează deploy.
6. Handover complet cerut explicit: actualizați setul `docs/handover/`, care conține fotografii istorice și unele politici depășite (documente automate, 02:00, etc.). Index actual clar + module/cod/decizii/operare/teste/limite/stare producție vs local, fără secrete.

## Producție observată read-only la aproximativ 22:25 RO

Site live (`maintenance=false`), ultimul run `a12a5e51-1e13-47b1-bfe1-8a8e60dc5e3a`, 11 octombrie, full/ready/complete. `paused=false`, dar există `blocked_reason` de transport; nu s-a intervenit asupra colectării. Setările proxy/limitele/OCR nu au fost schimbate.

## Extinderea verificării — checkpoint 22:50 RO

Copia națională este completă, fără date private: 209.082 contracte, 267.622 relații cu câștigătorii, 9.100 arhive, 8.045 decizii existente / 21.642 membri. Valorile JSON au fost exportate și importate ca linii exacte, fără conversie prin numerele floating-point Python. Primul import, prea voluminos într-o singură comandă, a fost oprit numai în baza nouă de test și refăcut în loturi mici. Fișierele `.exact.jsonl` sunt referința exactă; primele `.json` nu sunt referința numerică.

Tipurile istorice lipsă sunt completate din dovezile deciziilor deja aprobate, apoi toate identitățile sunt reverificate. Titlurile explicit contradictorii cu tipul SEAP devin `review`, fără contribuție aditivă. Cele 8.045 grupuri istorice trec din nou verificarea; nimic nu a fost unit numai pe baza titlului.

**Rezultat important:** 77.246 grupuri candidate noi; 3.793 verificate din surse; 66.706 grupuri cu impact potențial sunt momentan blocate. 66.463 au arhive lipsă; celelalte motive, care se pot suprapune: identitate incompletă 294, neconcordanță arhivă/core 151, procedură lipsă 82, dovadă de modificare lipsă 67, multiplicitate ambiguă 2. Acestea NU sunt 66.706 contracte frauduloase și nici dubluri deja dovedite. Activarea verificării globale acum ar bloca următoarea publicare: **NU publicați înaintea rezolvării sau a unei decizii explicite pentru aceste cazuri**.

Extragerea arhivelor pentru anunțurile implicate în `missing_archive` rulează din backup-ul public din30septembrie. Script: `.local/contract-reporting-integrity-20261011/extract-inventory.py`; rezultat: `inventory-recovered/award-raw.jsonl`. Păstrați manifestul extragerii și checksum-ul. Nicio cerere SEAP. Următorul pas: repetarea verificării cu dovezile recuperate și inventarierea cazurilor care nu pot fi decise automat.

Teste DB: cele6suite țintite au trecut13teste înaintea ultimelor modificări; testul de calendar folosește `completed_at` în fixture, iar baza izolată a primit0062, absentă din schema locală inițială. Ultima rulare pentru descoperire/calendar:2teste trecute. Repetați validarea finală după modificările recente de proveniență/tip. Prima publicare completă după schimbarea politicii este cerută în `packages/db/src/processing.ts`, reflectată și de `processingSchedule`; daily refuză păstrarea riscului cu o metodologie de reporting diferită.

## Checkpoint final al acestei etape — 11 octombrie, 23:18 RO

Handoverul integral cerut este în [docs/handover/20261011](../../handover/20261011/README.md), cu produs/cod, calcule, operare, istoricul deciziilor și continuare. Indexul vechi a fost păstrat integral în `docs/handover/HISTORY-INDEX.md`; `AGENTS.md` și promptul de onboarding indică noul set. Nu s-au șters notele preexistente.

### Dovezi recuperate și preflight final

Din backup-ul public din 30 septembrie au fost extrase **7.201 răspunsuri** pentru 7.320 de ID-uri de anunț candidate, după scanarea celor 17.087.659 rânduri de arhivă. Extracția extinsă a durat 182,528 secunde; ~337 MiB. Payload-ul JSON a fost păstrat textual, fără conversie financiară prin floating point. SHA-256: `76c6eed28df10b7ca45529c6d97e8e57ee0ee9665fa46f67c6e5c93be5a70787`.

Împreună cu prima extracție a celor patru răspunsuri și bundle-ul istoric, evaluarea finală produce:

| Măsură | Rezultat |
|---|---:|
| Grupuri istorice reverificate | 8.045 |
| Grupuri candidate noi | 77.246 |
| Grupuri noi verificate din surse | 75.974 |
| Grupuri neclare cu eligibilitate financiară | 748 |
| Alte grupuri neclare, fără eligibilitate financiară în regula actuală | 524 |
| Grupuri financiare încă fără arhivă | 0 |

Acesta este preflight pe cohorta **anunțurilor oficiale repetate**, nu auditul integral al tuturor achizițiilor și nu aprobarea/publicarea tuturor celor 75.974 de grupuri. `19003257` este limita arhivelor din copia cohortei; nu reprezintă o frontieră de producție înghețată prin orchestrator în această intervenție.

Motivele celor 748 se suprapun: identitate incompletă 294 (211 cu CUI de câștigător absent, 83 cu lot gol), dovadă de modificare lipsă 291, contradicție arhivă/core 172, procedură lipsă 82, versiuni de arhivă contradictorii 18, multiplicitate ambiguă 2, condiții/tip de contract diferite 1. Nu am presupus că aceștia sunt furnizori români cu un CUI de inventat sau că toate cazurile sunt dubluri.

[Lista integrală de revizuire, cu surse](review-candidates.md) și [rezumatul structurat](preflight-summary.json) sunt păstrate în repository. Exemplu de diferență legitimă care cere separare: aceeași dată/număr pot desemna un acord și o comandă, cu tipuri și titluri diferite; nu trebuie unite doar pentru că ancora numerică coincide.

### Verificări efectiv încheiate

- **253 de teste unitare ingestion trecute**, în 25 de suite, inclusiv cele 54 țintite de identitate/descoperire/pipeline. Nu se adună cele 54 încă o dată.
- **13 integrări ingestion trecute** în baza izolată a cazurilor: clasificare, bani, marts, revalidare, operațiunea istorică și noua descoperire/calendar. După adăugarea verificărilor de tip în testul monetar, cele două teste ale lui au fost rerulate și au trecut.
- **16 integrări ale procesării trecute** în baza separată `seap_test_currency_schedule_20261011`; testele trunchiază doar acea bază de fixture.
- **1 integrare web trecută** pe cititorii reali: act adițional cu sumă sursă intactă, plafon distinct, subtotal de 61.945.000 și lipsa comenzilor reprezentată prin `null`, nu zero.
- Build `@seap/db`, typecheck ingestion/web și **build web de producție trecute**. Build-ul web a folosit baza izolată și director separat `.next-contract-reporting`; artefactele generate și modificările de configurare adăugate de Next au fost apoi eliminate, păstrând jurnalul.
- Aprobările pe loturi au regresie pentru rollback integral la un lot ulterior nevalid și pentru selecția dublată între loturi. Titlurile/tipurile contradictorii și pointerii de proveniență învechiți ajung la revizuire; sumele originale rămân neschimbate.
- Nu s-a efectuat un test vizual complet în browser al paginilor schimbate și nici recalcularea/publicarea națională. Cititorul web testat nu este o probă de deploy.

Jurnale private: `db-tests-final.log`, `money-tests-final.log`, `unit-tests-final.log`, `ingestion-tests.log`, `schedule-tests.log`, `web-reporting-tests.log`, `web-build.log`, sub `.local/contract-reporting-integrity-20261011/`.

### Producție, verificare finală numai în citire

La **23:18:14 RO**: checkout `5488af2ce069f6fb2490cd9defb1f120a21b325d`, 72 migrări; `maintenance=false`, `paused=false`, revision 137. Blocajul de transport existent rămâne. Ultimul processing run `a12a5e51-1e13-47b1-bfe1-8a8e60dc5e3a` este full/ready/complete, finalizat la 07:44:27 RO. Nu s-au făcut requesturi SEAP, mutații în producție, deploy, restart sau reluarea colectării.

### Ce împiedică închiderea reparației

1. Două întrebări de politică sunt încă fără răspuns: toate plafoanele separate de total; excluderea temporară explicită a grupurilor incerte versus blocarea întregii publicări. Codul păstrează politica existentă a plafonului fără comandă și blochează publicarea grupurilor incerte.
2. Dovezile recuperate sunt încă într-o zonă izolată `repair_reporting.archives` și în fișiere private. Mecanismul final de instalare și folosire persistentă în revalidările de producție nu este finalizat. Nu introduce vechile raw ID-uri și nu reparsează orbește toate versiunile istorice peste proiecția curentă.
3. Mai sunt necesare aplicarea completă pe copie, reconcilierea statisticilor/semnalelor, probele UI, procedura de rollback și un moment de producție convenit. Cele trei cazuri inițiale sunt probate, dar nu certifică rezolvarea tuturor cazurilor istorice.

**Nu face push pe main acum.** Ar deploy-a o poartă care refuză aceste cazuri, iar următoarea publicare ar rămâne în mentenanță. Nu o dezactiva și nu considera implicit aprobată excluderea datelor incerte. Continuarea exactă, inventarul artefactelor și regulile de lucru sunt în [handoverul de continuare](../../handover/20261011/status-and-continuation.md).
