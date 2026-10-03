# DQ-02 — contracte repetate între publicații

Început la 3 octombrie 2026, după pregătirea reparației monetare. **Diagnostic local; nu face parte din operațiunea de producție programată pentru 4 octombrie.**

## Ce am verificat suplimentar

[Interogarea](triage.sql) restrânge întâi domeniul la numerele de anunț repetate, apoi compară instituția, numărul/data/valoarea/moneda contractului, titlul, loturile și setul de câștigători. Verifică separat CPV-ul, multiplicitatea în interiorul aceleiași publicații și arhiva disponibilă. [Rezultat](triage.json), 13,927 secunde, conexiune read-only, work_mem 8 MB, fără paralelizare.

- 8.069 perechi candidate; fiecare conține exact un contract din fiecare dintre două ID-uri de anunț.
- Toate sunt declarate RON; nu am găsit conflicte de CPV între membri sau lipsa listei câștigătorilor.
- Nicio pereche nu are mai mulți membri identici în aceeași publicație; cazurile ambigue de tip „două contracte identice într-un lot” nu apar în acest set.
- 7.312 perechi au ambii membri incluși în statistica originală.
- **Nicio pereche nu are ambele răspunsuri contractuale în arhiva locală.** Existența documentului a fost verificată prin raw_id și endpoint, nu presupusă din prezența ID-ului. Confirmarea semantică a unei republicări rămâne limitată de această lipsă.

Cifra de 7.310.553.827,47 lei din audit este în continuare impact candidat pe snapshotul original. Nu este o reducere aplicată și nu reprezintă prejudiciu. Corecția monetară poate modifica populația eligibilă; diferența finală trebuie măsurată după acea corecție.

## Implementarea propusă pentru următorul pas

1. Registru de candidați, cu amprenta exactă a câmpurilor comparate, ID-urile ambelor publicații și motivul potrivirii. Separat de datele brute; sursele rămân accesibile.
2. Decizie explicită pentru fiecare grup: confirmat același contract / distinct / insuficient documentat. Regula nu se bazează numai pe număr și valoare, nici pe alegerea automată a celui mai nou anunț. Diferențele de dată, monedă, valoare, lot, CPV sau câștigători blochează potrivirea automată; câmpurile esențiale lipsă și multiplicările interne cer revizuire.
3. Pentru grupurile confirmate: identitate canonică stabilă și aliasuri pentru fiecare ID SEAP, o singură contribuție în calcule, toate publicațiile disponibile ca dovezi. Pagina contractului explică gruparea și permite deschiderea fiecărei surse. Nu ștergem rânduri și nu rescriem capturile istorice ale anchetelor.
4. Teste negative pentru contracte subsecvente/loturi distincte care au aceeași sumă și pentru republicări cu valori diferite; idempotență la import, invalidarea unei decizii dacă se schimbă datele relevante.
5. Simulare separată pe copie: fiecare reducere cu ID-uri și motiv, diferențe pe instituție, furnizor, an și CPV; abia apoi recalculare și publicare controlată.

Mai întâi trebuie inspectate relațiile de procedură/anunț din arhiva disponibilă și originea importului vechi. Dacă nu există dovezi pentru echivalență, păstrăm candidatul de verificat; nu transformăm similitudinea într-o certitudine. Nu pornim recrawl SEAP implicit.

## Verificare aprofundată și registru local — 3 octombrie, seara

**Stare:** implementate identificarea conservatoare, registrul cu istoricul observațiilor și simularea. Branch `fix/contract-publication-identity`. Fără commit/push/deploy în această etapă; nicio schimbare a programării monetare din producție. Nu am aplicat încă deduplicarea în marts sau în paginile publice.

### Arhiva recuperată

Limita inițială a fost depășită parțial folosind dumpul public local din 30 septembrie, fără cereri SEAP. Checksum-ul întregului dump corespunde manifestului. Am parcurs cele 17.087.659 de răspunsuri și am extras **315 documente** doar pentru cele 310 ID-uri de anunț candidate. Împreună cu 304 documente din copia locală actuală, verificarea folosește **619 răspunsuri**. [Metadate și checksum](simulation/archive-recovery.json).

Extragerea finală a durat 180,435 secunde, cu filtrarea în container înainte de transferul rezultatelor către gazdă. Prima încercare, care transfera toate rândurile, a fost oprită și înlocuită; nu a restaurat sau modificat baza. Payloadurile brute rămân în `infra/prod/dumps/dq02-evidence-20261003/`, ignorat de Git. În repo rămân metadatele, exemplele și diferențele publice, fără date de contact din payloaduri.

Nu am reintrodus raw_id-urile dumpului în baza curentă: ID-urile interne din arhive diferite nu sunt o identitate globală. Documentele sunt confruntate prin ID-ul anunțului, numărul oficial, procedură, ID-ul contractului și conținut. Dovada păstrează sursa, hash-ul și ID-ul local al documentului.

### Regula verificată

Potrivirea de câmpuri generează numai un candidat. Starea `source_verified` cere doi membri, câte unul din publicații diferite, aceeași instituție, număr/data/valoare RON, titlu, lot, CPV, procedură și set de câștigători. Ambele arhive trebuie să confirme câmpurile contractuale, aceeași procedură SEAP, instituția și furnizorii prin identificatori fiscali validați, precum și clasificarea anunțului publicat. Versiuni arhivate contradictorii, modificări ale condițiilor, câmpuri esențiale lipsă sau mai mulți membri în aceeași publicație blochează verificarea automată.

CUI-ul folosește funcția existentă cu checksum din proiect, inclusiv prefixele RO/R. Etichetele de forma `RO1883902 / J13/60/1991 - ...` separă explicit codul fiscal de numărul registrului comerțului. Nu comparăm instituții după nume și nu tratăm șirul `NULL` drept identificator. Furnizorii străini/fără CUI verificabil cer dovezi suplimentare; nu sunt uniți prin simpla asemănare a numelor.

### Rezultat final, după corecția monetară

- **8.056 perechi candidate**: **8.045 susținute de surse**; **11 cu identificatori insuficienți**, păstrate pentru verificare.
- În **7.300 perechi susținute**, ambele copii contribuie la statisticile contractelor. Simularea numără o singură contribuție și păstrează toate sursele.
- Reducere simulată: **7.100.577.914,82 lei**.
- Total contracte: **936.141.296.594,43 → 929.040.718.679,61 lei**; înregistrări contractuale eligibile: **980.925 → 973.625**.
- Cele 11 perechi neconfirmate nu sunt eliminate. Nouă dintre ele au ambele copii în statistici, cu o expunere candidată suplimentară de 174.447.199,29 lei, care **nu intră în reducerea propusă**.
- Diferența față de 8.069/7.312 din audit este explicată de **13 perechi afectate de corecția monetară**, dintre care trei erau dublu incluse. Cei 35.528.713,36 lei aferenți lor nu se scad din nou. [Reconcilierea suprapunerii](simulation/monetary-overlap.json).

Această reducere este o corecție simulată a statisticii de contracte, nu prejudiciu, plată sau bani recuperați. Nu afirmă statutul juridic al unei publicații „înlocuitoare”. Reprezentantul din simulare este ales determinist dintre membrii eligibili, exclusiv pentru calcul; nu declarăm automat anunțul mai recent drept cel corect.

[Rezumat](simulation/summary.json), [exemple și dovezi](simulation/examples.json), [fiecare eliminare simulată cu ID-ul păstrat](simulation/simulated-removals.json), [diferențe pe instituție/furnizor/an/CPV](simulation/simulated-dimensions.json). Toate cele patru repartizări reconciliază exact aceeași reducere, inclusiv alocările și restul de rotunjire ale consorțiilor.

### Cod și siguranță

- `normalize/contract-identity.ts`: evaluator pur, amprentă deterministă a datelor, surselor și rezultatului; 26 teste pozitive/negative.
- `scripts/audit-contract-identities.ts`: numai localhost și baza `seap_test_currency_*`; actualizează registrul într-o tranzacție, păstrează observațiile vechi, marchează inactivi candidații dispăruți și calculează scenariul în tabele temporare. Nu modifică `core.contracts`, statisticile, semnalele, capturile sau căutarea.
- `marts.contract_identity_candidates` păstrează inventarul curent; `marts.contract_identity_observations` păstrează instantaneele distincte. Un fingerprint schimbat nu poate fi tratat ulterior drept aprobarea vechii observații.
- Migrările 0050/0051 sunt aplicate **doar copiei izolate** (52 în total). Baza locală principală rămâne pe schema anterioară.
- `decision: unreviewed` este explicit în raport: `source_verified` reprezintă verificarea dovezii, **nu o comandă de eliminare și nu o decizie deja publicată**. Niciun consumator al aplicației nu filtrează încă folosind acest registru.

Rulare, după pregătirea copiei monetare și aplicarea migrărilor exclusiv acolo:

```sh
python3 scripts/operations/extract-contract-identity-archive.py
# Exportă arhiva curentă locală cu export-contract-identity-current.sql și psql -X -qAt;
# păstrează rezultatul drept infra/prod/dumps/dq02-evidence-20261003/current-raw.jsonl.
node --env-file=apps/web/.env.local scripts/operations/with-currency-db.mjs seap_test_currency_20261003 node apps/ingestion/node_modules/tsx/dist/cli.mjs apps/ingestion/src/scripts/audit-contract-identities.ts docs/implementation/contract-publication-identity/simulation infra/prod/dumps/dq02-evidence-20261003/award-raw.jsonl infra/prod/dumps/dq02-evidence-20261003/current-raw.jsonl
```

### Ce rămâne pentru corecția efectivă

Registrul și scenariul sunt pregătirea verificabilă. Urmează o regulă de identitate canonică cu decizii versionate, aliasuri pentru toate publicațiile, integrarea în populația statistică/reconcilierea TED și validatoare, plus prezentarea ambelor surse în pagina contractului. Deciziile trebuie invalidate la schimbarea câmpurilor sau a dovezii; perechile fără identificatori suficienți rămân negrupate. Recalcularea/publicarea va fi o operațiune separată, după validarea acestei integrări. Nu adăuga această corecție la reparația monetară deja programată.

## Deduplicare efectivă implementată — 3 octombrie, după aprobarea proprietarului

**Starea actuală înlocuiește mențiunile „numai simulare” de mai sus:** implementarea este terminată și aplicată pe copia izolată `seap_test_currency_20261003`. Baza locală obișnuită și producția nu au fost modificate. Fără commit/push/deploy; branch `fix/contract-publication-identity`. Reparația monetară programată pentru 4 octombrie rămâne separată.

### Ce se schimbă

- Migrarea **0052** adaugă deciziile explicite și membrii lor. Împreună cu registrul/observațiile din 0050/0051, sunt 53 de migrări pe copie. Migrațiile sunt aditive; singure nu aprobă și nu elimină nimic.
- `approveContractIdentities` primește lista exactă de candidați și fingerprinturi, verifică din nou arhivele, confruntă fiecare câmp cu starea curentă și înregistrează decizia cu motiv și dată. Repetarea este idempotentă. Reprezentantul este ales întâi dintre membrii eligibili, apoi după ID; cazul în care numai publicația cu ID mai mare este eligibilă are test separat.
- `canonicalContract` este aceeași condiție în builderul statistic, reconcilierea TED–SEAP și validatorul întregii populații. TED nu mai produce două asocieri SEAP pentru cele două publicații confirmate.
- `identity-quality` rulează după normalizare și verificarea monedelor, înainte de TED, atât zilnic cât și săptămânal. Verificarea este repetată în builderii direcți și înaintea publicării. Date monetare/surse/participanți modificate, altă compoziție a publicațiilor aceluiași anunț, schimbarea eligibilității sau a observației aprobate opresc procesarea pentru reverificare. Nu revocăm în tăcere decizia și nu publicăm din nou totaluri dublate. Admin afișează etapa „Verificăm publicațiile grupate”.
- Contractele, câștigătorii, arhivele și capturile anchetelor nu sunt șterse/rescrise. Ambele URL-uri publice rămân funcționale. Pagina fiecărei publicații arată cele două surse, linkuri SEAP și explicația grupării. Cotele și informația de concurență provin din reprezentantul comun; câmpurile și fișierele publicației deschise rămân ale acelei surse.
- Amprentele dovezilor serializează determinist cheile JSON: ordinea cheilor schimbată de JSONB nu invalidează o dovadă identică. Inventarul a primit fingerprinturi noi pentru acest motiv; observațiile anterioare sunt păstrate. Amprenta stării SQL folosește epoci pentru date, astfel încât schimbarea fusului orar al conexiunii nu invalidează deciziile.

### Rezultatul aplicării reale pe copie

[Raportul aplicării și validării](simulation/applied.json):

- **8.045 decizii aprobate**, toate cele **16.090 publicații-sursă** încă prezente.
- **973.625 contracte eligibile**, **1.102.287 alocări contract–furnizor** după reconstrucția builderului real `runMarts`.
- Total **929.040.718.679,61 lei**, identic cu simularea: **7.300 contribuții repetate** și **7.100.577.914,82 lei** în minus față de populația monetară corectată.
- Verificare completă pe **1.143.947 contracte-sursă**: **0** eligibile fără alocare, **0** excluse dar incluse, **0** neconcordanțe de alocare. Totalurile tuturor profilurilor de instituții și de furnizori reconciliază exact suma de mai sus.
- **11 candidați neconfirmați**, **0** aprobați dintre aceștia.
- Aplicare + refacere statistici + verificare inițială: **142,7 secunde**. Acesta este timpul copiei cu populația contractuală completă, fără populația completă DA/TED; nu este o estimare pentru reprocesarea completă din producție.

### Teste și limite

- 154 teste unitare ingestion și 370 web trecute. Cele 149 de teste DB opționale din comanda generală web au fost omise, nu prezentate drept trecute.
- 12 teste DB pentru statisticile reale și reconciliere TED, inclusiv deduplicare, acord-cadru cu un singur membru eligibil, idempotență, păstrarea surselor, schimbarea valorii/raw_id/furnizorului, publicație nouă și invalidarea registrului.
- Un test DB web separat pe copia publică aplicată: ambele pagini păstrează ID-uri/surse distincte, arată aceleași publicații și aceleași alocări/statistici canonice.
- Build DB și typecheck ingestion/web trecute. Componenta reală de surse verificată la desktop/mobil în ambele teme, inclusiv deschiderea explicației din tastatură și linkurile; capturi locale ignorate în `.impeccable/review/contract-identity/`. Este o previzualizare SSR a componentei cu stilurile/shell-ul reale, nu un test al întregii aplicații pornite pe baza obișnuită.
- Copia izolată nu conține întregul DA/TED/risc; nu am rulat și nu pretind validarea unui checkpoint complet al produsului sau a indexării Meilisearch. Reconcilierea TED este verificată pe fixture, nu pe întregul istoric TED în acest pas.
- Protecția viitoare acoperă deciziile aprobate și modificările publicațiilor lor. **Perechile complet noi nu sunt aprobate automat**; se inventariază și verifică separat. Chiar și o schimbare benignă a `raw_id` solicită reverificare: comportament conservator explicit.

### Continuarea pentru publicare

Nu porni scripturile locale pe producție și nu adăuga acest lot la reparația monetară deja programată. După verificarea acelei reparații și autorizarea publicării DQ-02: backup, mentenanță, transfer verificat al dovezilor publice recuperate în spațiu separat (nu suprascrie `raw_id` din altă bază), inventar nou pe starea live, aprobări explicite ale fingerprinturilor actuale, reconciliere TED → statistici → semnale și derivate → validare completă → indexare → redeschidere. O diferență față de simulare trebuie explicată, nu forțată să se potrivească. Deciziile însele nu trebuie activate în timpul servirii statisticilor vechi.

Pe baza locală obișnuită migrările sunt încă neaplicate; pentru testarea întregii aplicații configurează o copie completă și migrează acea copie. Nu direcționa accidental browserul/dev serverul către fixture-ul parțial și nu pretinde că acesta conține tot produsul.

Comenzi exclusiv pentru copia izolată pregătită (Node 22, DB package construit):

```sh
node --env-file=apps/web/.env.local scripts/operations/with-currency-db.mjs seap_test_currency_20261003 node apps/ingestion/node_modules/tsx/dist/cli.mjs apps/ingestion/src/scripts/apply-contract-identities-local.ts docs/implementation/contract-publication-identity/simulation/applied.json infra/prod/dumps/dq02-evidence-20261003/award-raw.jsonl infra/prod/dumps/dq02-evidence-20261003/current-raw.jsonl
# Numai verificare a rezultatului deja aplicat, fără reconstrucție:
node --env-file=apps/web/.env.local scripts/operations/with-currency-db.mjs seap_test_currency_20261003 node apps/ingestion/node_modules/tsx/dist/cli.mjs apps/ingestion/src/scripts/validate-contract-identities-local.ts docs/implementation/contract-publication-identity/simulation/applied.json
```

## Autorizare pentru aceeași noapte — 4 octombrie 2026, 05:00 RO

Proprietarul a autorizat explicit adăugarea deduplicării la aceeași mentenanță („păi hai să programăm și deduplicarea atunci”). Această decizie înlocuiește instrucțiunile anterioare de a o publica separat. Implementarea programării este în `scheduled-contract-identity.ts`, integrarea în `processing.ts`/pipeline și scriptul operațional datat `scripts/operations/schedule-contract-identity-20261004.sql`.

Ordine: backup verificat → reparație monetară → normalizare și verificarea monedelor → deduplicare → verificarea identităților → TED/statistici/semnale/Radiografie/validare → căutare → redeschidere. O singură recalculare completă. Etapa `identity-repair` este în interiorul refresh-ului, după normalizare, ca amprentele să corespundă stării publicate.

Pachetul de dovezi are 619 arhive, 8.045 grupuri explicit selectate, 5.848.795 bytes comprimați. SHA256 `c3a570b5ad4638778183c77b2e0a7385a3467ae6c22af1e012afd22151621596`, pe server `/srv/seap/repairs/dq02-20261004/approved-bundle.json.gz`, vizibil numai în processor la `/repairs/...` prin mount read-only. Nu intră în Git. Datele sale nu se introduc în `raw.raw_documents`; ID-urile din cele două baze nu sunt amestecate.

**Preflight live read-only trecut la 2026-10-03T18:43:27Z**, boundary17376020: toate cele8.045grupuri corespund datelor actuale din producție; exact7.300contribuții repetate și7.100.577.914,82RON. S-au inclus și versiunile arhivate existente pe server, fără nicio cerere SEAP. Aceeași verificare se repetă după normalizarea nocturnă; nu se forțează o potrivire cu un rezultat vechi.

`app.data_repairs` ține marcajul separat `contract-publication-identity-v1`: scheduled → applied în aceeași tranzacție cu aprobările → completed numai prin redeschiderea verificată. Necesită ziua exactă, rulare full, backup încheiat, maintenance+paused, raw boundary, normalizare încheiată și reparația monetară aplicată în aceeași rulare sau completă. Checksum diferit, date/surse/multiplicitate/impact schimbate opresc tranzacția; status failed persistă și site-ul rămâne în mentenanță. O operațiune applied/failed nu este reluată automat. O zi ratată blochează, nu mută execuția pe duminica următoare. După completed funcția nu mai face nimic.

Test nou de integrare pentru dată/full/backup/prerechizită, checksum, multiplicitate, rollback, applied/completed și lipsa repetării; plus testele existente bani/TED/marts și20testehost. Fișierul `production-schedule.json`, adăugat după deploy și înscrierea efectivă, este confirmarea programării — preflight-ul singur nu o programează.

### Confirmarea programării și deploy-ului

**Programat efectiv la 3 octombrie 2026, 18:50 UTC.** [Stare verificată](production-schedule.json): ambele marcaje `contract-money-v1` și `contract-publication-identity-v1` au status `scheduled` pentru **2026-10-04 05:00 Europe/Bucharest /02:00 UTC**. Nu a fost adăugat alt cron. Runtime `63981c6`, [CI/deploy37145428452](https://github.com/Alex-Cosma/seap-new/actions/runs/37145428452) ambele success,53migrări. Preflight repetat din imaginea processor deployată, cu mountul final, a trecut la18:49:57UTC(boundary17376079). Zero decizii active înainte de mentenanță, site deschis și colectare neschimbată(30–45sec). Health/Explorează/detaliu contract200, admin anonim307. Zero cereri SEAP făcute de această operațiune.

Codul temporar folosit la primul preflight a fost șters de pe server; pachetul de dovezi fixat prin checksum rămâne în `/srv/seap/repairs/dq02-20261004/`. Mâine verifică ambele marcaje completed, checkpoint ready, raportul deduplicării și redeschiderea. Nu presupune execuția reușită doar din această programare. Dacă noaptea se oprește, păstrează mentenanța și verifică etapa/logul/backupul; nu reseta automat un marcaj applied/failed la scheduled.
