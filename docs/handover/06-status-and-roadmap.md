# Stare, limite și direcții — istoric și referințe

**Actualizare 11 octombrie:** pentru starea curentă citește [continuarea consolidată](20261011/status-and-continuation.md). Paragrafele de mai jos sunt fotografii istorice; extinderea zilnică, pool-ul de documente și reparațiile ulterioare sunt deja documentate separat.

**Ultima verificare de producție:1 octombrie,seara.** Codul final `c6763f3` este live, CI/deploy trecute,47 migrări, checkpoint11 ready, identitățile istorice reparate, ambele căutări reconstruite și24 probe în browser trecute. Site redeschis și colectare activă, buget40–60s, program05:00RO/risc duminică păstrat. [Raportul verificat](../implementation/entity-identity-release-20261001.md) are prioritate față de fotografiile istorice. Copia locală obișnuită și dumpul anterior rămân nereparate.

## Fotografie istorică — 28 septembrie

28 septembrie 2026, verificări read-only între 11:28–11:50 ora României; starea se poate schimba ulterior.

| Element | Observație |
|---|---|
| Aplicație |Commit 332 e 577 în producție; documentație ulterioarăb 857 e 51 pe main|
| CI/deploy |Actions 36397323757 reușit|
| Colectare |Activă, fără maintenance/source block; revision 14,50–70 secunde|
| Lot |`recovery-2026-09-25`, end_day 2026-09-25, collecting|
| Sarcini la 11:32 RO |1556 complete,38160 pending,17916 deferred,1 running|
| Publicare 28 septembrie |`daily`, ready/complete,05:00:02,869→05:56:22,531 RO, **56 m 19,662 s** durata orchestratului|
| Ultimul checkpoint |Version 5, coordinated/ready, finalizat 05:56:01,221 RO|
| Checkpoint anterior |Version 4, coordinated/ready,27 septembrie 19:17:55,677 RO|
| Retry timeout |Niciun rând în tabel la verificare; nu afirmăm că noua politică a fost observată pe un timeout real|
| Documente în producție |0 metadata/0 PDF/0 pagini la verificare; mecanismul există, arhiva locală a pilotului este separată|

Sarcinile sunt unități tehnice, nu număr de contracte. `deferred` nu înseamnă descărcat. Estimările de zile nu pot ascunde aceste goluri.

## Admin și estimările recente

Implementate: `/admin`, `/admin/procesare`, `/admin/fisiere`, `/admin/jurnal`, `/admin/feedback`, `/admin/conturi`; layout persistat, rezumat comun, focus/navigare coerente, stări de încărcare/eroare, drafturi de setări păstrate și paginare 10 rânduri. Feedbackul anonim a fost adăugat în lotul din 30 septembrie.

Progresul pe flux este fracția din coada **cunoscută**, care se poate mări după paginare/partiționare. Progresul general estimează separat instituții și zile de anunțuri, liste, detalii și pagini de contracte, ponderat după lucru; nu face media celor trei procente.

Praguri: catalog complet; cel puțin 100 instituțiiDA sau 20 zile de anunțuri și 10%din unitățile fiecărui flux, cu până la 3 luni reprezentate (ori toate unitățile/lunile când lotul e mai mic). Ritmul necesită 24 ore și 100 pași utili; folosește până la 7 zile calendaristice, incluzând pauzele/competiția pentru trafic. Intervalul este scenariu de planificare, nu interval de încredere statistică.

Eșecurile și reîncercările nu avansează progresul. Partiționarea finalizată este lucru util, dar nu un contract colectat. Eșantion insuficient, lipsă heartbeat, date vechi, pauze, erori sau detalii deferred sunt prezentate explicit. ETA este pentru **lotul cu dată fixă**, nu „la zi” după acea dată. Extinderea continuă a lotului este muncă viitoare, nu activată de acest UI.

Verificările navigării admin din 28 septembrie: 252 teste unitare web, 2 integrări PG, 24 verificări browser autentificat, types/build. Capturile folosesc date sintetice și nu sunt dovadă de acoperire SEAP. Vezi [admin-navigation](../implementation/admin-navigation-20260928.md); verificările lotului ulterior sunt în raportul lansării și documentele funcționalităților.

## Ce este livrat

- Descoperire, builder cu 13 tipuri, surse exacte, atlasCPV, terminologie TED corectată, AI neimplementat dezactivat.
- Integritate/proveniență TED și repararea istoriei nenormalizate în producție.
- Anchete private cu roluri, dovezi înghețate, exporturi, rețete și urmăriri.
- Rețele/legături din achiziții, comparații după activitate și după populație, grup manual, toți anii/toate domeniile.
- Documente la cerere, coadă, PDF/P 7 S, OCR, căutare în text, citate verificabile, reader sincronizat.
- Migrații la deploy, shared gate SEAP, recuperare durabilă, diagnoză, pauză 02:59–03:30, timeout 5/10 minute.
- Publicare 05:00 zilnic și risc duminică, mentenanță fail-closed, backup/restore validat pe copii.
- Admin unificat și estimări prudente ale recuperării.

„Cod livrat” nu presupune toate opțiunile operaționale activate: de exemplu email digest-urile au mecanism separat și necesită configurare/worker/mail; nu promite livrare email fără verificare.

## Limite/riscuri cunoscute

1. **Acoperire:** recuperarea are goluri și un capăt fix. EForms nepreluate nu trebuie convertite arbitrar în completed pentru a obține 100%.
2. **Arhive divergente:** producția nu conține întregul raw istoric de pe Mac. Pachetul ales pentru coleg este LOCAL și păstrează acea arhivă mai mare; nu afirmă paritate cu publicarea live.
3. **PDF-uri:** preluarea verificată suportă anumite familii, în specialSCN/type 17. Nu toate contractele au asociere sigură/anunț suportat. Metadatele de descărcare depind de sesiune și se reobțin.
4. **Surse vs arhivă:** CSV live poate avea plafon/scop explicit; captura SQL integrală are mecanism separat. Cititorul trebuie să știe ce exportă.
5. **TED:** tipuri de sume/monede/proveniență incomplete sunt păstrate ca necunoscute, nu normalizate prin presupuneri. Asocierile nu sunt echivalențe perfecte.
6. **Populație:** comparațiile și „lei pe locuitor” din Întreabă folosesc populația rezidentă INS RPL 2021 (1 decembrie 2021, catalog `ins-rpl-2021-table-1.22-v1`), nu populație curentă. Doar primăriile și consiliile județene identificate strict primesc populație; instituțiile subordonate și asocierile incerte sunt excluse, nu forțate. Din 21 octombrie (decizia proprietarului, F05) cele șase primării de sector intră în „lei pe locuitor” și în selectorul de localitate, fiecare cu populația RPL 2021 a propriului sector; Primăria Municipiului București păstrează populația întregului oraș. Comparația automată după populație lasă în continuare sectoarele în afara grupului. Vechea populație din `reference.uat`/`marts.entity_profile` (valori din 2011, fără sursă) nu se afișează. Comparația manuală rămâne posibilă.
7. **Proprietate firme:** date despre reprezentanți și relații de achiziții nu constituie istoric complet de acționariat/beneficiari reali.
8. **Performanță:** selecțiile naționale/sortările/căutările pot atinge timeout-uri SQL; nu ridica arbitrar limitele sau introduce sampling ascuns.
9. **Onboarding schema:** bootstrapul istoric face necesar dump-ul cu istorie; procedura de laDB goală merită standardizată separat.
10. **Securitate/concurență:** verifică permisiunile server-side la orice operațiune pe anchete și la publicarea capturilor; nu te baza doar pe butoane ascunse.
11. **Documentație:** vechile README-uri includ instrucțiuni pre-shared-gate. Sunt arhivate ca istoric și trebuie interpretate după acest dosar.
12. **Programare:** un scheduler heartbeat arată că se verifică programul; nu înseamnă că fiecare etapă de publicare a trecut. Site-ul rămâne în mentenanță la eroare.
13. **CUI-ul altei firme pe înregistrări istorice (F27):** 54 de perechi pe 49 de entități au fost atașate până pe 7 octombrie după ID SICAP, deși codul fiscal din sursă era CUI-ul altei firme. Atribuirea pe înregistrare nu se poate reface (raw-ul de dinainte de 26 septembrie 2026 nu a fost păstrat). Expunerea pe clase, cele 9 perechi acceptate și rezultatul re-preluării farma din 21 octombrie (23 de conflicte, 112.850,90 lei, lăsate la distribuitor din decizia proprietarului) sunt în [date și calcule](20261011/data-and-calculations.md).

## Direcții discutate, fără autorizație implicită de implementare

Ordinea se decide cu proprietarul; acestea nu sunt sarcini începute automat pentru coleg.

### Urmărirea auditului de încredere — 30 septembrie 2026

[Auditul Reddit](../reviews/reddit-skeptic-20260929/report.md) rămâne referința pentru constatări. Detaliile/calendarul, limbajul riscului, timeoutul `/semnale` și loturile de mai jos au fost publicate în30septembrie. Tranziția calendarului a trecut, site-ul este redeschis și colectarea reluată; [raportul lansării](../implementation/release-20260930.md) are verificările exacte. Copia locală păstrează propriul baseline nereprocesat.

- **Publicat: redesign `/semnale`, varianta A aprobată.** Toate cele 13 tipuri, selector căutabil, 10 rezultate/pagină, totaluri complete, explicații inline, surse reale în dialog stabil și CRI separat. 51 teste și 42 verificări browser, TypeScript/build trecute. [Implementare și limite](../implementation/signals-redesign.md).
- **Publicat: intenția căutării.** Pentru „Primăria Cluj”, o potrivire puternică de instituție trebuie să fie vizibilă înaintea contractelor cu potriviri textuale. Acces separat la profil și achizițiile instituției, fără schimbarea tacită a căutării; categorii ușor de descoperit pe mobil. [Implementare și verificări](../implementation/search-intent.md).
- **Publicat: traseul de verificare.** Un acces principal la surse, exporturi grupate și explicația calculului lângă rezultat; stările documentelor invită numai la acțiuni disponibile. [Implementare](../implementation/answer-actions.md).
- **Publicat: prima experiență Explorează.** Drawer cu loading vizibil/schelet, întrebarea implicită pe toți anii disponibili prin agregatele existente, text desktop ajustat la30px ca semnul întrebării să rămână pe rând. Clasamentele precalculate pe ani rămân doar o propunere. [Checkpoint de reluare](continuation-20260930.md).
- **Publicat: feedback anonim.** Proprietarul a ales să nu afișeze niciun nume public. Formular fără cont/nume/e-mail, cu pagină publică atașată; mesaje private pentru administratori în `/admin/feedback`, paginare10 și ștergere individuală confirmată. [Implementare](../implementation/anonymous-feedback.md). Nu mai solicita identitatea operatorului pentru acest flux.
- **Comis și împins pe main, 1 octombrie: acoperire compactă (`d51fb29`).** Homepage are „Ce date includ aceste cifre?” lângă totaluri, cu textul lung mutat în interior. Explorează integrează perioadele în „Datele și calculul”, în locul explicației pliabile existente. Citire doar la deschidere, surse adaptate întrebării aplicate, fără procente de completitudine. [Implementare și verificări](../implementation/compact-coverage.md). Push confirmat împreună cu `b293eea`; finalizarea deployului nu a fost verificată aici.
- **Comis și împins pe main, 1 octombrie: două corecții mici (`b293eea`).** Linkurile numărătorilor homepage deschid măsura „număr”; metodologia descrie „Copiază întrebarea”, fără promisiunea unui buton „citează” absent. [Continuarea auditului](../implementation/reddit-small-fixes-20261001.md). Push confirmat; confirmarea deployului rămâne separată.
- **Abandonat la cererea proprietarului: citarea publică a semnalelor.** [Mockupul](../../mockups/signal-citation/README.md) rămâne doar explorare, fără integrare/backend planificat. Distribuirea se concentrează pe anchete, date și interogări. Nu publica implicit anchetele private și nu relua propunerea ca sarcină restantă a auditului.

### Reverificare prin parcursuri — 1 octombrie 2026

[Raportul celor cinci parcursuri](../reviews/user-journeys-20261001/report.md) documentează observații noi, nu remedieri deja autorizate:

- Clarificarea profilurilor omonime din Cluj; verificare de proveniență înainte de orice asociere.
- Explicarea accesului pe invitație la Anchete și o eventuală cale de solicitare.
- Continuarea din căutare în constructor fără pierderea neexplicată a contextului; fără echivalențe tacite text–CPV sau UAT–județ.
- Titluri disponibile și valori complet lizibile în tabelul profilului,10 rânduri/pagină păstrate.
- Copierea căutării mai accesibilă pe mobil și reducerea secțiunilor goale redundante.

### Direcții generale

- Închiderea golurilor de colectare, suport eForms și mecanism explicit de ajungere continuă la zi, fără a compromite bugetul comun.
- Istoric extern al acționariatului/beneficiarilor reali, numai cu surse, date și acoperire demonstrabile.
- Extinderea căutării în documente, adnotări/comparații de caiete de sarcini și eventual un mic pachet public de dovezi ales explicit.
- Ciclul de viață al proiectelor: amendamente, livrare, plăți documentate, urmărirea documentelor lipsă.
- Prețuri unitare comparabile cu cantități/unități/specificații/TVA/datǎ/context de livrare.
- Anexe publice de dovezi: preview, selecție, redacții, aprobare, versiuni și corecturi.
- Descoperire între anchete și urmărirea solicitărilor de informații.
- Bugetul ca filtru suplimentar pentru comparații între administrații.
- Bootstrap curat, pachete de date de dezvoltare repetabile și testare mai simplă pentru mai mulți colaboratori.

## Identități istorice reparate,1 octombrie

[Publicarea live](../implementation/entity-identity-release-20261001.md) este încheiată:4.231.642 de asocieri corectate,14.264 de redirecturi, conservarea datelor verificată. Recalcularea completă, ambele căutări și24 de probe în browser au trecut; site-ul este redeschis, colectarea reluată. Capturile existente nu se rescriu. Cazurile ambigue și CUI14920794 rămân separate. Baza locală obișnuită și dumpul anterior sunt încă nereparate: migrația singură nu corectează datele. Nu relansa operațiunea. [Diagnosticul](../reviews/entity-identities-20261001/report.md) și [implementarea](../implementation/entity-identity-repair.md) păstrează explicația CUI/ID SICAP și validările.

## Index de documente detaliate

| Temă | Documente |
|---|---|
| Cercetare inițială watchdog |`docs/research/2026-09-14-investigative-workflows.md`, `INVESTIGATIVE-AUDIT-PROMPT.md`|
| Integritate |`docs/implementation/batch1-data-integrity.md`, `ted-repair.md`|
| Anchete și capturi |`batch2-investigation-workspace.md`, `batch2-frozen-evidence.md`|
| Monitorizare |`batch3-monitoring.md`, `batch3-refresh-checkpoints.md`, `monitoring-email-digests.md`|
| Legături |`batch4-connections.md`, `batch4-connections-data.md`, `batch4-connection-evidence.md`|
| Comparații |`batch4-peers.md`, apoi `peer-population.md`, `peer-population-backend.md`, `peer-all-filters.md`|
| Documente |`batch5-document-pilot.md`, `batch5-documents-discovery.md`, `batch5-documents-implementation.md`|
| Colectare |`seap-production-resume-plan.md`, `collection-recovery-runbook.md`, `collection-failure-diagnostics.md`|
| Noapte/retry |`scheduled-processing.md`, `seap-quiet-window.md`, `seap-timeout-retries.md`|
| TED live/benchmark |`ted-production-recovery-20260927.md`, `recalculation-benchmark-20260927.md`|
| Admin |`admin-collection.md`, `admin-document-queue-20260927.md`, `admin-navigation-20260928.md`|
| Istoric operațional consolidat |`continuation-20260927.md` și topul `HANDOFF.md`|

Numele scurte din tabel sunt sub `docs/implementation/`. Citește finalul documentului pentru follow-up-uri și corelează datele; nu repeta afirmațiile „undeployed” de la început dacă o secțiune ulterioară confirmă deploy-ul.
