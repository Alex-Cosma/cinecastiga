**9 October, late evening — publication recovery is HOLD pending contract-version semantics:** [Source findings, tested draft, exact rehearsal and continuation](../implementation/publication-revalidation-20261009/README.md). The owner authorized repair and conditional reopening; deeper review found revised amounts/suppliers as well as identical copies. Draft branch `fix/publication-revalidation-20261009`; not deployed. Production remains in maintenance; the next05:00run is still expected to fail the unresolved identity gate. No source requests, production data mutations, restart or maintenance toggle in this intervention.

# Handover pentru un nou dezvoltator și asistentul lui

**8 octombrie, 13:19 RO — detaliile anunțurilor implementate și colectarea reluată:** cod colector `f518341`, checkout `4cc3b99`, CI/deploy37762220103 trecute. Toate cele33.522inventare de contracte ale atribuirilor sunt acum preluate;51.601detalii anterior amânate au rute pentru toate12tipurile și sunt în colectare.7erori vechi și5inventare complete de loturi recuperate.1.410cereri reușite după reluare;zero sarcini failed/deferred,2retry-uri automate în așteptare. Admin separă contractele de formulare/loturi;≈7s raportare sub sarcină. **Mentenanța publică rămâne; nu am procesat azi. Blocajul separat al deduplicării/publicării nu este rezolvat de acest lot.** Setări păstrate94proxy-uri,200/min,10simultane,35–45s/IP;controlrevision99. [Raport, dovezi și proceduri datate](../implementation/notice-details-20261008/README.md). Nu relansa activările; verifică starea live.

**8 octombrie,08:11RO — colectare reluată, mentenanță publică păstrată:** runtime `a621ee4`, CI/deploy37730728160 reușite,63migrări. După eșecul normalizării de la05:00, colectarea brută poate continua independent de publicare;136 cereri reușite,zero eșuate la verificare. Fără recalculare azi; următoarea încercare completă9octombrie05:00RO. Trei arhive/58contracte au corecții testate, aplicabile la noapte. **Blocaj de publicare încă deschis:** a treia publicație a unor contracte schimbă populația deduplicării; nu ocoli verificarea. [Raport, dovezi și procedură datată](../implementation/recovery-20261008/README.md). Nu relansa activarea datată.

**7 octombrie, 10:18 RO — colectarea reluată după paginare:** runtime `3a5b23d` deploy-at și verificat; ordinea furnizorilor și surplusul variabil de rânduri sunt tratate fără relaxarea reconcilierii finale. Anunțul 100648909: toate cele 1.041 contracte distincte arhivate; 253 cereri reușite după reluare, fără blocaj. CI trecut; pasul automat de deploy eșuat, procedura standard executată apoi cu succes direct pe server. [Raport și dovezi](../implementation/recovery-20261007/README.md#follow-up-recovery-verified--1018-ro). Fără mentenanță/recalculare suplimentară sau schimbări de ritm.

**7 octombrie, 09:22 RO — incidentul de normalizare/paginare închis în producție:** runtime `65cc86d`, CI/deploy `37571381653` trecute. Două identități reparate, patru arhive reprocesate, 585 contracte reconciliate din pagini suprapuse; sursele și istoricul păstrate. Recalculare completă 1 h 53 min, checkpoint 19 ready, toate cele 13 verificări și căutarea trecute. Site redeschis, colectare reluată; calendarul și setările proxy păstrate. [Raport, dovezi și limite](../implementation/recovery-20261007/README.md). Nu relansa procedura datată; baza locală obișnuită nu a fost actualizată.

**7 octombrie — ETA și colectare zilnică publicate:** runtime `6830cb3`, CI/deploy `37534184563` trecute, 62 migrări. Lotul se extinde automat la 03:30 RO până în ziua precedentă. Activarea a adăugat 38.433 sarcini pentru 26 septembrie–5 octombrie; colectarea este reluată, 158 cereri reușite verificate. ETA inițial doar pentru coada cunoscută: 343–572 minute; golurile sunt afișate separat. Setările operatorului păstrate: 200/min, 10 simultane, 35–45s/IP, 94 proxy-uri active. [Detalii și dovezi live](../implementation/recovery-continuous-eta-20261007.md).

**6 octombrie — limita configurabilă este acum 200 cereri/minut:** runtime `5b6e1f6`, CI/deploy `37529872354` reușite, 61 migrări. Interfața, API-ul și baza acceptă 1–200; poți seta 100 din admin după refresh. Setarea efectivă 50/minut și pauza manuală (revision 76) au fost păstrate. [Validare și stare live](../implementation/seap-proxy-pool.md#configurable-ceiling-up-to-200-requestsminute--2026-10-06).

**6 octombrie — verificare finală concurență/proxy-uri:** runtime `e702f79`, CI/deploy `37493119887` reușite. Corectat și blocajul fals la finalizarea concurentă. Live: 100 proxy-uri activate, 35–45 s/IP, plafon 50/minut, maximum 10 simultane; aproximativ 49/minut măsurate. Șase endpoint-uri sunt în cooldown automat, fără oprirea celorlalte. [Raport final, retry-uri și limite](../implementation/seap-proxy-pool.md#final-release-verification-after-the-orphan-race-fix).

**6 octombrie — lot100 și concurență publicate:** runtime `04044df`, CI/deploy `37491212317` reușite,60migrări. Setări autorizate/live:100proxy-uri,35–45s/IP,50cereri/minut,10simultane; admin compact și configurabil. [Stare verificată și retry-uri în așteptare](../implementation/seap-proxy-pool.md#replacement-pool-and-concurrency-verified-in-production). La16:01UTC:120cereri reușite,6timeouturi izolate cu retry automat,48,96porniri/minut,fără blocajglobal.

**6 octombrie — ritm total și per proxy în admin, publicat:** runtime `3fd6991`, CI/deploy `37475040711` reușite. `/admin` arată ritmul măsurat și numărul de proxy-uri activate; `/admin/conexiune` arată ritmul fiecărui endpoint pe ultimele10minute. Estimarea din setări și plafonul sunt distincte. Fără migrații sau modificări de ritm:9proxy-uri,40–60s/IP,15/min,revision54. [Detalii și verificări](../implementation/seap-proxy-pool.md#measured-collection-pace--2026-10-06).

**6 octombrie — izolarea erorilor proxy publicată:** runtime3c67bba,CI/deploy37464862632trecute,57migrări. [Stare verificată](../implementation/seap-proxy-pool.md#independent-failure-release-verified-in-production). Proxy-7 oprit după13/13timeouturi; celelalte9continuă. Toate13sarcinile recuperate;93cereri reușite fără eroare după excludere. Retry-urile5/10minute nu mai opresc proxy-urile sănătoase;40–60s/IP și15/min păstrate.

**6 octombrie — configurație live actualizată:** toate10proxy-urile active,40–60sec/IP,plafon15/min; runtime1056540,56migrări. [Stare și retry în așteptare](../implementation/seap-proxy-pool.md#all-ten-activation-verified--2026-10-06-1110-utc). Eroarea admin cauzată de formatul jurnalului a fost reparată în date și cod. Ultima observație:23cereri reușite/1timeout, reîncercare automată la14:14RO,6octombrie; verifică rezultatul live.

**6 octombrie — proxy/admin publicat:** `e041f4f`, CI/deploy37452332438 trecute,55migrări. [Verificarea producției](../implementation/seap-proxy-pool.md#production-publication-verified--2026-10-06). Tab Conexiune SEAP și asocierea contractului107063311 publicate; poolul și izolarea de rețea rămân inactive. Ritmul30–45s și programul procesării sunt păstrate.

**4 octombrie — ONRC + MF (DQ-03/DQ-05), încheiat în PRODUCȚIE:** [raport final, verificări și limite](../implementation/reference-import-integrity/PRODUCTION.md). Runtime al reparației `2e87571`, CI/deploy `37181807983` trecute, 54 migrări. Rularea manuală `96c15b43-6ad8-4d41-a94d-16b9c160e114` a durat 09:14:45–11:30:31 RO (2 h 15 min 46 s). Recuperate 1.119.170 date ONRC și 5.399.344 profituri MF; checkpoint 15 ready, toate cele 13 verificări și căutarea trecute. Site redeschis, colectare reluată cu cereri reușite; marker `reference-import-v1=completed`. Nu relansa reparația. Importurile viitoare sunt corectate; operațiunea istorică nu se repetă săptămânal. Ritmul 30–45s și calendarul zilnic 05:00 / risc duminică sunt păstrate. Baza locală principală nu a fost modificată.

**3 octombrie — deduplicarea este programată în producție pentru aceeași mentenanță din4 octombrie05:00 RO:** [confirmare deploy și programare](../implementation/contract-publication-identity/README.md#confirmarea-programării-și-deploy-ului). Runtime63981c6,CI/deploy37145428452trecute,53migrări. Ambele operațiuni sunt scheduled: corecție monetară → normalizare → deduplicare → o singură recalculare completă. Preflight live8.045perechi/7.300contribuții repetate/7.100.577.914,82RON; zero decizii activate înainte de noapte. [Snapshot](../implementation/contract-publication-identity/production-schedule.json). Mâine verifică execuția, nu o presupune din programare.

**3 octombrie — publicare corecție monetară și operațiune unică:** [implementare, simulare și procedură](../implementation/contract-currency/README.md#one-time-scheduling--4-october-2026). Autorizată pentru 4 octombrie 05:00 RO, după backup, numai în acea rulare completă. Marcaj persistent `contract-money-v1`; deploy-ul singur nu aplică reparația. Rezultatul execuției trebuie verificat dimineața.


**2 octombrie, copie locală actualizată:** [transferul integral din producție](../implementation/local-production-copy-20261002.md) este încheiat: baza locală are checkpoint 12, identitățile reparate și copia exactă Meilisearch. Artefactele sunt private, distincte de dumpul public pentru coleg. Etichetele CPV sunt publicate în `1d72085`.

**Ultima publicare a datelor verificată,1 octombrie:** [reparația identităților istorice](../implementation/entity-identity-release-20261001.md) este încheiată, site-ul redeschis și colectarea reluată.4.231.642 de asocieri corectate,14.264 de redirecturi, checkpoint11 ready și ambele indexuri refăcute. Nu relansa operațiunea. Codul final `c6763f3` este live, inclusiv corecția inițializării căutării; CI/deploy `36906296990` trecute și24 verificări publice în browser trecute. Baza locală obișnuită și dumpul local anterior nu sunt reparate. [Checkpoint-ul de pregătire](continuation-identity-20261001.md) este istoric.

**Documentație consolidată la 1 octombrie:** [checkpoint final](continuation-20261001.md). Publicarea aplicației și pregătirea pachetului local sunt încheiate; copierea pe stick nu a fost efectuată de agent. Nu există operațiuni din sesiunea precedentă de relansat. Ultima verificare de producție consemnată este din 30 septembrie, seara, nu din noaptea următoare.

**Publicare anterioară, 30 septembrie 2026:** codul aplicației `43c0d4a` și corecția deploy `f474c3e` sunt pe main și în producție, ambele CI/deploy trecute. Tranziția calendarului în producție este validată, site-ul redeschis și colectarea reluată; verifică [raportul lansării](../implementation/release-20260930.md) înaintea oricărei operațiuni. Un nou dump LOCAL complet pentru coleg este exportat și verificat în `infra/prod/dumps/handover-local-20260930`; [starea transferului](TRANSFER-STATUS.md) este autoritatea pentru finalizarea/verificarea lui.

Funcționalitățile recente: [Semnale A](../implementation/signals-redesign.md), [feedback anonim și admin](../implementation/anonymous-feedback.md), [întrebări salvate fără cont](../implementation/local-saved-questions.md), [traseul surselor și exporturilor](../implementation/answer-actions.md), [căutare orientată spre instituție](../implementation/search-intent.md), [calendar și detalii](../implementation/acquisition-details-calendar.md), [limbajul riscului](../implementation/risk-language.md), [lookup complet pentru semnale](../implementation/signal-timeout.md). Opțiunea de login fără 2FA este exclusiv locală/development și necesită configurare proprie; nu este activă în producție.

**Checkpoint-uri istorice:** [implementarea locală](continuation-20260930.md) și [publicarea](continuation-release-20260930.md) păstrează etapele sesiunii; starea finală din raportul lansării are prioritate.

Acesta este punctul de intrare pentru colaborare, nu un plan de rescriere a proiectului. Documentația descrie codul existent și deciziile utilizatorului; stările operaționale au dată și trebuie reverificate înaintea unei intervenții.

## Citește în această ordine

1. [Produs, decizii și comportamente de păstrat](01-product.md).
2. [Arhitectură, date, identități și harta codului](02-architecture.md).
3. [Pornire locală, cont, teste și lucru în echipă](03-development.md).
4. [Transferul complet al datelor publice](04-database-transfer.md).
5. [Producție, colectare, publicare și recuperare](05-operations.md).
6. [Stare curentă, limite și ce urmează](06-status-and-roadmap.md).
7. [Prompt de inițializare pentru modelul colegului](MODEL-START.md).

[PRODUCT.md](../../PRODUCT.md) explică principiile produsului; [DESIGN.md](../../DESIGN.md) documentează interfața existentă. [HANDOFF.md](../../HANDOFF.md) păstrează cronologia amplă. Nu trebuie încărcate toate capturile și toate documentele istorice în contextul modelului: acest dosar oferă trasee către informațiile relevante.

## Starea de plecare

- Repository: `git@github.com:Alex-Cosma/seap-new.git`; aplicație: <https://cinecastiga.ro>.
- Codul reparației și corecției finale verificat în producție: `c6763f3`. Pentru commitul final și verificări citește raportul din1 octombrie; commiturile exclusiv documentare pot exista pe `main` fără deploy.
- CI + deploy al reparației: Actions `36886537522`, apoi `36906296990` pentru corecția finală, confirmate reușite. Publicarea datelor are propriile verificări și raport; un deploy reușit singur nu certifică reparația.
- Lotul recent include Semnale A, feedback anonim cu secțiune admin separată, căutare/Explorează și corectarea calendarului. Funcționalitățile și backlogul sunt în [06-status-and-roadmap.md](06-status-and-roadmap.md).
- Producție:47 migrări, checkpoint11 ready, calendar `rf-2026.6` / `Europe/Bucharest-v1`. Dump local: tot 46 migrări, dar baseline v1 din 19 septembrie, fără reprocesarea calendarului. Manifestul exportului este autoritatea pentru copia transferată.
- Colegul primește **toate datele publice disponibile în copia aleasă**, inclusiv arhiva brută existentă, datele normalizate, statisticile și documentele publice. Nu primește conturi, sesiuni, anchete, urmăriri private sau cozi active.
- **Decizia finală a proprietarului: export din baza LOCALĂ a autorului, transfer pe stick.** Include arhiva brută locală mai mare și cele două documente publice ale pilotului. Nu este identică cu producția. Manifestul local marchează sursa și checkpoint-ul; nu prezenta copia drept ultima publicare live.

## Cum se rezolvă contradicțiile din documente

Există documente scrise înaintea deploy-urilor care spun încă „local”, „pending” sau „nu face deploy”. Sunt evidențe istorice, nu starea curentă și nici interdicții perpetue. Ordinea practică:

1. Instrucțiunea actuală a proprietarului și starea verificată a mediului vizat.
2. Codul și migrațiile commit-ului folosit, plus manifestul snapshot-ului.
3. Acest handover și cele mai recente secțiuni datate din HANDOFF.
4. Documentele detaliate ale funcționalității.
5. Planurile inițiale și README-urile vechi.

Nu deduce că o funcționalitate este activă doar pentru că există cod sau un script. Nu trata o rulare locală drept verificare de producție. Nu reutiliza autorizații pentru intervenții one-off deja finalizate.

## Pachetul de predare

- Repository și acest dosar: cod, decizii, documentație și teste.
- Bundle separat: `database.dump`, `manifest.json`, `SHA256SUMS`, `archive.list`, `export.log`.
- Un cont **local nou**, creat de coleg. Chei și secrete noi, locale.
- Acces GitHub individual; acces SSH individual numai dacă rolul lui îl cere. Nu se copiază cheia SSH, `.env` sau sesiunea browserului autorului.
- Datele mari și secretele nu intră în Git. Există instrucțiuni și scripturi de export/restaurare, cu validări și destinație nouă obligatorie.

**După un clone:** cere separat pachetul public, apoi urmează ghidul local. Fără pachet poți inspecta codul și rula testele care nu cer baza de date; nu poți reproduce explorarea datelor reale. Bootstrapul dintr-o bază goală nu este încă traseul standardizat. Pentru modelul colegului folosește `MODEL-START.md`, chiar dacă instrumentul său nu încarcă automat `AGENTS.md`.

„Complet” înseamnă copia integrală a datelor publice din sursa declarată, nu certificarea că SEAP a fost colectat complet. Golurile și estimările sunt explicate în documentele de mai jos.

- [Managed SEAP proxy pool + durable contract/document association](../implementation/seap-proxy-pool.md): local implementation2026-10-06, admin controls, optional isolated worker network, migration0054 and staged production rollout (not activated).
