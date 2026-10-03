# Handover pentru un nou dezvoltator și asistentul lui

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
