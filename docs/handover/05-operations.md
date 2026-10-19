# Operare în producție

Acest document transmite mecanisme și decizii, nu autorizație permanentă de administrare. Dezvoltarea locală nu cere acces live. Verificările citire-only sunt distincte de reluarea colectării, migrare, rebuild sau restore.

**Pentru politica și starea actualizate la 11 octombrie citește [operarea consolidată](20261011/operations.md).** Documentul de față păstrează și incidente istorice. Consolidarea inițială: 1 octombrie 2026. Ultima verificare de producție consemnată este din 30 septembrie, seara: [raport final](../implementation/release-20260930.md). Tranziția calendarului este încheiată; nu se repetă la următorul deploy obișnuit. Pentru starea din momentul intervenției citește controlul și rulările din baza mediului vizat.

## Mediu și acces

- Domeniu: `https://cinecastiga.ro`.
- VPS Debian 13/Docker, SSH `cinecastiga`.
- Checkout: `/srv/seap/src`; compose: `/srv/seap/src/infra/prod`.
- Secrete: `infra/prod/.env` pe server, niciodată în Git/handover.
- Containere: `cinecastiga-web-1`, `cinecastiga-postgres-1`, `cinecastiga-meilisearch-1`, `cinecastiga-caddy-1`, `cinecastiga-documents-1`, `cinecastiga-collection-1`.
- DB/user owner: `seap`; rol web/worker documente: `seap_web`, granturi limitate.
- Publice:80/443 prin Caddy și Cloudflare. PostgreSQL server disponibil pe loopback pentru administrare prin SSH; nu îl expune public.
- Backups: `/srv/seap/backups`, inclusiv `processing/<UUID>/`. Bundle-ul public de onboarding este separat și nu înlocuiește backup-urile private.
- Colegul își generează cheia individuală dacă primește acces. Cheia CI are forced command pentru deploy; nu este cheia de lucru a dezvoltatorului.

Verificări simple, fără efecte de colectare:

```sh
ssh -o BatchMode=yes cinecastiga \
  'cd /srv/seap/src && git rev-parse HEAD && docker ps --format "{{.Names}} {{.Status}}"'
curl -fsS https://cinecastiga.ro/api/health
```

Cloudflare poate trata diferit User-Agent-urile: o cerere Python fără antete a primit 403 într-o verificare, în timp ce curl și aplicația au răspuns 200. Distinge refuzul de la edge de răspunsul originului înainte de a diagnostica un incident.

## Deploy

`.github/workflows/ci.yml`: push pe main → instalareNode 22/pnpm → teste host → `pnpm turbo typecheck lint test build` → job deploy prin SSH.

`infra/prod/deploy.sh`:

1. Ia `flock` pe `.git/deploy.lock`, comun cu procesarea programată.
2. Actualizează checkout-ul la origin/main; workspace-ul serverului nu este loc de modificări nesalvate.
3. Construiește imaginile web/migrate/documents/processor și collection dacă profilul este deja activ.
4. Aplică migrațiile cu istoric verificat și granturi. Eroarea oprește înaintea înlocuirii aplicației.
5. Pregătește indexul titlurilor dacă nu există încă (`index-topics --if-missing`), fără preluări SEAP. Aplicația veche servește în continuare; eroarea oprește deploy-ul înainte de restart. Indexul existent nu este reconstruit la fiecare deploy; procesarea nocturnă îl actualizează.
6. Validează configurația Caddy din checkout, nu doar fișierul deja montat. Dacă montarea unui fișier unic păstrează inode-ul vechi după Git, recreează Caddy cu volumele/certificatele existente; altfel doar reîncarcă configurația. Apoi repornește serviciile necesare; PostgreSQL și Meilisearch rămân pornite.
7. Raportează commit-ul deploy-at. Imaginea neschimbată a collectorului poate rămâne pornită dacă Docker nu are motiv să o recreeze.

Un push reușit nu dovedește deploy. Verifică ambele joburi Actions, hash-ul serverului, health, o pagină publică, autentificarea/admin și worker-ii. O schimbare exclusiv documentară poate folosi `[skip ci]`; nu folosi asta pentru cod sau migrații.

### Povești „Ce bate la ochi” în lucru

Fișierele JSON ale poveștilor nepublicate stau numai pe server, în `/srv/seap/stories/` (proprietar `seap`, citite de containerul web ca `/stories`, read-only). Deploy-ul nu le atinge și nu sunt în Git. O poveste nouă sau corectată se copiază acolo (`scp poveste.json seap@server:/srv/seap/stories/`) și apare la următoarea cerere a unui admin; un fișier nevalid este omis și apare în `docker compose logs web` ca `Editorial preview … skipped`. Ștergerea fișierului retrage povestea. Directorul trebuie să existe înainte de pornirea containerului web; altfel Docker îl creează gol, ca root.

Schema veche trebuie să poată servi versiunea veche în timpul migrării. Nu există rollback destructiv automat al migrațiilor deja comise. Nu rezolva o eroare de istoric prin resetarea migrațiilor sau ștergerea tabelelor.

## Colectare SEAP — politica efectivă

- Fluxuri: achiziții directe, anunțuri de participare, atribuiri; catalog auxiliar.
- Recuperare: DAde la 1 iulie 2026, anunțuri/atribuiri de la 1 ianuarie 2026, deduplicare. Vechile loguri nu demonstrau acoperirea completă până la 31 iulie, de aceea s-au ales ferestre suprapuse.
- Lotul `recovery-2026-09-25` își păstrează identificatorul istoric; după activarea `follow_latest`, ținta se extinde zilnic până ieri, de la 02:00 RO (actualizare publicată pe 10 octombrie). Sarcinile existente nu sunt rescrise. [Extindere și ETA](../implementation/recovery-continuous-eta-20261007.md); verifică starea live și confirmarea activării înainte de intervenții.
- Buget comun pentru colector și documente: în modul direct rămâne o cerere în curs și intervalul din `collection_control`; prin proxy, intervalul pe IP, plafonul total și concurența sunt în `collection_proxy_control`. Limitele acceptate sunt 1–200 porniri/minut și 1–10 cereri simultane, maximum una pe IP. Decizia proprietarului din6octombrie:100proxy-uri noi,35–45s/IP,50/min,10simultane. [Rollout și stare verificată](../implementation/seap-proxy-pool.md#concurrent-requests-and-replacement100-endpoint-pool--2026-10-06). Citește setările live înainte de orice intervenție; valorile istorice nu sunt instrucțiuni de resetare.
- Regula manuală/serială de minimum 60 secunde între GET-uri nu se aplică identic pool-ului automat autorizat. Acesta folosește bugetul comun, interval per IP și concurență controlată; vezi ghidul consolidat.
- Colectarea automată de documente este implementată, cu control separat în admin. Politica strictă actuală: numai caiete de sarcini identificate; utilizatorul autentificat poate cere manual și alte fișiere.
- Pauză zilnică de admitere a cererilor **02:59 inclusiv–03:30 exclusiv**, Europe/Bucharest. Nu schimbă manual paused și nu șterge erori.
- Cererile deja admise pot termina; OCR poate continua. La 03:30 reluarea este condiționată de celelalte blocaje/bugete.
- DST: abordare conservatoare pentru ora repetată/lipsă; vezi testele `collection-quiet-window`.

Poarta comună este în PostgreSQL: tranzacție pe control pentru admitere, lock comun de drenare și lock-uri exclusive pe cerere/IP, ținute pe sesiuni rezervate. PID-ul și proprietatea cererii sunt verificate; o înregistrare în curs fără lock este tratată ca întrerupere. Nu poate fi înlocuită cu un `sleep` în fiecare worker: două sleep-uri independente dublează traficul.

### Timeout și diagnostic

Deadline transport 45 secunde. Pentru timeout confirmat pe o sarcină a recuperării:

1. Prima eroare → așteaptă 5 minute.
2. A doua eroare → așteaptă 10 minute de la acea eroare.
3. A treia → oprire pentru operator.

Sunt 3 încercări totale, aceeași identitate/query. Bugetul persistă în `app.collection_retries` și supraviețuiește restartului. Numai finalizarea validării/arhivării/checkpoint-ului rezolvă sarcina. Documentele din sesiunea browser nu au această reluare automată.

**„Eroare de sistem” cu HTTP 400 (19 octombrie 2026).** SEAP întoarce propriile erori de bază de date (`EnlistTransaction`, „data reader is closed”, erori de mapare) ca 400 cu un corp care începe cu „Eroare de sistem <cod>”. Pe 16–17 octombrie au fost ~1.200, ~1,7% din detaliile de atribuire `RFQ_PUBLIC_CANotice`, mai multe când descărcarea istorică merge pe multe benzi. Înainte rămâneau lipsă izolată definitivă. Acum primesc aceleași 2 reîncercări (5, apoi 10 minute), indiferent de proxy, fără să penalizeze proxy-ul (`seapSystemError`, `scheduleCollectionTimeout(...,'source')`). Epuizate, anunțul rămâne lipsă izolată, ca înainte, fără blocaj global. Un 400 fără acest corp (de exemplu formularele eForms „Missing Authorization header”) rămâne definitiv.

403/429/challenge, răspuns invalid, eroare SQL, conexiune pierdută fără deadline-ul confirmat sau anulare nu sunt tratate automat ca timeout. Păstrează diagnosticele, statusul, parametrii siguri, faza, durata și excepția sanitizată. Nu stoca parole/tokenuri/cookies în jurnal.

**Izolarea erorilor de transport (13 octombrie 2026).** 403/429/challenge și cererile rămase fără rezultat opresc în continuare toată colectarea. În rest:

- Documente: o eroare de proxy pe care browserul nu o poate clasifica (`TRANSPORT_FAILED`, fără răspuns SEAP) e atribuită proxy-ului. Circuitul per proxy o izolează: pauză 5/10 minute, oprire după 3 erori consecutive. Jobul automat se reia cu bugetul lui.
- Escaladare: dacă **3 proxy-uri diferite** dau asemenea erori neclasificate în **10 minute**, cauza e probabil sursa. Atunci se oprește fluxul `documents` (intrare `stream-auto-paused` în audit, cu motivul).
- Orice altă eroare de transport nescoped din fluxul de documente oprește **doar** fluxul `documents` (`paused_streams`), nu anunțurile/DA. Reluarea se face din controlul fluxurilor, după verificarea jurnalului.
- Fluxurile de ingestie (`da`, `tenders`, `awards`, `catalogue`) păstrează oprirea globală pentru erorile nescoped.

Motiv: între 11 și 12 octombrie, 4 opriri globale au venit din câte o singură eroare `TRANSPORT_FAILED` la documente, pe proxy-uri diferite. Cererile prin alte proxy-uri primeau 200 în aceeași secundă, iar în 14 zile nu a existat niciun 403/429/challenge. Pragurile sunt în `UNCLASSIFIED_PROXY_LIMIT` / `UNCLASSIFIED_PROXY_WINDOW_MINUTES` (`packages/db/src/collection.ts`).

Orice manual pause, stream pause, maintenance, daily cap sau source block rămâne independent. O cerere rămasă „running” după pierderea worker-ului impune inspecție; nu o marca success pentru a debloca UI-ul.

### Descărcarea istorică a detaliilor de atribuire

Anunțurile de atribuire arhivate doar ca rând de listă (`award-list:v1`, fără `award-detail-root:v2`) pot primi formularul și loturile printr-o descărcare în fundal (16 octombrie 2026). **Este oprită implicit.**

- Sarcinile au prioritate 60 (fundal: `priority >= 50`). Colectorul le ia numai când niciun flux nepus pe pauză nu mai are lucru obișnuit executabil, și numai pe benzile `0…background_lanes-1`. Reluările programate au întâietate ca până acum. Părțile descoperite (loturi, eForms) moștenesc prioritatea și `backfill:true`. Nu se programează contracte.
- Folosesc aceeași poartă: intervalul pe IP (35–45 s), plafonul și concurența din `collection_proxy_control` rămân neschimbate. Benzile peste `max_in_flight` nu pornesc. Ritmul este cât lasă liber pool-ul.
- Pornire/oprire: `collection.js background-lanes <0..10>` (incrementează `revision`, scrie audit `background-lanes`). `0` oprește preluarea de sarcini noi. Cele deja admise se termină, iar o reluare după timeout deja programată pentru o sarcină de fundal rulează tot (bugetul de 3 încercări neschimbat).
- Programare, fără trafic SEAP: `collection.js backfill-award-details --limit=N [--pilot]`. Ia ultimul rând de listă per anunț, cele mai noi primele. Validează metadatele (ca la activarea din 8 octombrie) și omite anunțurile cu detaliu arhivat sau cu orice sarcină de detaliu în lot. Comanda poate fi rulată din nou fără dubluri. Scrie audit `award-detail-backfill` cu numărul pe tip/versiune. Refuză fără un lot `collecting` unic sau în timpul unei procesări.
- **Pilotul întâi:** `--pilot` programează cel mult 2 anunțuri pe fiecare combinație tip/versiune. Inspectează arhivele și golurile pilotului înainte de un `--limit` mare.
- **Formularele v1** (`get_v1`, verificate live pe 16 octombrie 2026 pentru tipurile 3, 16 și 18): nu au id intern (`noticeID`), iar secțiunile sunt în `caNoticeView_V1` sau `caNoticeView_V1_U` (utilități), cu secțiunile 2/4/5 goale. Rădăcina se verifică după id-ul public, numărul și tipul anunțului. Loturile vin din același `GetCANoticeLots_v2`, după id-ul public: valoare estimată pe lot și totală, CPV, criterii. Un v1 care declară eForms e respins ca format neverificat.
- **eForms negenerat de SEAP:** uneori `changeNoticeHtml` conține chiar eroarea serverului lor (de exemplu `400 Missing Authorization header in request`), iar `changeNoticePdfLocation` e o cale internă de rețea. Rămâne gol vizibil, cu mesajul sursei și numărul TED corespunzător (`tedNoticeNo`) dacă există.
- **Reluarea eșecurilor după o reparație:** `collection.js backfill-award-details --retry-failed` pune înapoi în coadă sarcinile de fundal eșuate (`backfill:true`). Cererile eșuate rămân în registru, iar erorile anterioare se păstrează în auditul `award-detail-backfill-retry`. Fără trafic la rularea comenzii.
- **Reîncărcare automată (17 octombrie 2026).** Comanda programează cel mult 100.000 de anunțuri, iar auditul `award-detail-backfill` reține acum și `remaining`, adică anunțurile valide rămase neprogramate. După o programare făcută de operator (nu pilot), colectorul verifică la fiecare 10 minute (`refillAwardBackfill`) și programează următoarele 100.000 când mai puțin de 20.000 de sarcini de fundal sunt `pending`/`running` (`AWARD_BACKFILL_REFILL_BELOW`). Verifică imediat și dacă ultima programare e mai veche decât câmpul `remaining`. Auditul are actorul `system:award-detail-backfill-auto` și `auto:true`. Nu rulează cu benzile de fundal pe 0, cu colectarea sau `awards` pe pauză, într-o mentenanță care oprește colectarea (cu `collection_during_maintenance` rulează), cu blocaj sau în timpul procesării. Se oprește definitiv după o programare cu `remaining=0`; o programare a operatorului o repornește. Rulează în afara cozii benzii 0: interogarea candidaților durează câteva secunde (3,5 s în prod pe 17 octombrie, 187.062 de anunțuri neprogramate). Erorile apar în logul colectorului (`award-backfill-refill-failed`), cu o nouă încercare peste 10 minute. **Oprire:** `background-lanes 0`.
- Panoul admin raportează fundalul separat, în secțiunea **„Descărcări istorice”** de pe pagina Colectare. Fundalul nu intră în progresul, ETA-ul sau golurile recuperării. Sarcinile de fundal în așteptare țin lotul `collecting`. Panoul arată, din metadatele sarcinilor și din audit:
  - pentru atribuirile SEAP: detaliul principal și părțile (loturi și eForms), eșecurile grupate pe cauză, anunțurile neprogramate, ritmul din ultima oră, ultima programare și o estimare (cereri rămase / ritmul ultimei ore);
  - pentru TED: ultimul număr OJ S arhivat și ziua lui, numerele rămase (estimate din zilele lucrătoare până azi), spațierea, următorul pachet, pachetele arhivate și verificările identice sau cu diferențe.

Rulare în producție, prin containerul de colectare: `docker compose --profile collection run --rm --no-deps collection node apps/ingestion/dist/scripts/collection.js <comanda>`.

## Procesare/publicare

Cronul host rulează o verificare la fiecare minut:

```text
* * * * * /bin/bash /srv/seap/src/infra/prod/process-nightly.sh >> /srv/seap/backups/processing-scheduler.log 2>&1
```

Program activ: **zilnic 05:00 ora României**. În fiecare zi: normalizare până la un raw boundary fix, asocieri TED/SEAP, marts statistice și tranzacții, Radiografie, acoperire, validare și indexare. **Duminică 05:00** se recalculează și flag-urile/CRI/mostrele de risc (`full`). Celelalte zile sunt `daily`; păstrează proveniența și data riscului precedent, fără a le cosmetiza ca proaspete.

Nu se așteaptă finalizarea recuperării istorice pentru publicarea noilor date. Colectarea și publicarea sunt procese distincte, cu stări și date distincte.

Procedura:

1. Lock comun cu deploy; o singură încercare pentru ziua programată.
2. Pausă colectare + mentenanță; păstrează pauza anterioară a operatorului.
3. Drenează cererile/sarcinile/OCR până la 25 minute înainte de oprirea worker-ilor. SIGTERM poate anula OCR; nu îl trimite înainte de drain.
4. Verifică spațiu liber, creează backup complet privat și SHA-256; `.partial` nu este punct valid de restore.
5. Rulează pipeline-ul la boundary fix; salvează etape, durate și heartbeat; validează întregul snapshot.
6. Reindexează Meili; verifică numărul așteptat și absența taskurilor eșuate/în curs.
7. Repornește cache-uri/worker-i, verifică health și redeschide doar checkpoint-ul validat, cu revision neschimbat.

La eroare, **mentenanța rămâne activă**, fără retry automat și fără redeschidere pe date amestecate. Un daily poate refuza păstrarea riscului vechi dacă sursele istorice s-au schimbat și nu mai reconciliază; atunci se validează pe copie un full sau restaurarea. Nu dezactiva verificarea ca să termine.

**Recuperarea unei publicări eșuate.** Cu acordul explicit al proprietarului, după ce cauza e corectată și livrată, rulează pe server `nohup bash /srv/seap/src/infra/prod/process-nightly.sh --recover-failed <run-id-eșuat> >> /srv/seap/backups/processing-scheduler.log 2>&1 &`. Comanda acceptă doar ultima rulare, cu status `failed`, cât timp mentenanța e activă și revision-ul e exact cel lăsat de eșec. Orice schimbare de operator după eșec cere o nouă inspecție. Rularea e una manuală `full`, cu backup nou și aceleași porți ca noaptea, iar rularea eșuată rămâne neschimbată în istoric. Nu o folosi pentru a ocoli o verificare care a refuzat datele.

**Probleme izolate, nu mentenanță (18 octombrie 2026).** Decizia proprietarului: o problemă mică de date nu mai ține tot site-ul în mentenanță. Două cazuri sunt izolate, fiecare cu plafon:
- **Carantina la `normalize`.** Până la `MAX_QUARANTINED_RECORDS` (20) documente puse în carantină într-o rulare nu opresc publicarea. Numărul include și reîncercările eșuate. Documentul nu ajunge în `core`, iar pe site rămâne ultima lui versiune bună. Se reîncearcă la fiecare rulare.
- **Grupuri aprobate care nu mai trec reverificarea la `identity-repair`.** Până la `MAX_REVOKED_GROUPS` (25) de grupuri își pierd aprobarea în loc să oprească publicarea. Revalidarea șterge decizia și membrii grupului, iar candidatul trece la `conflict` cu dovezile vechi și motivul (`approval_revalidation_failed`, `evidence.revocation`). Schimbarea e scrisă în `contract_identity_revisions`, iar `app.collection_audit` primește acțiunea `identity-revoked`. În aceeași rulare, descoperirea exclude din totaluri fiecare fost membru (`contract_identity_exclusions`). Câtă vreme `IDENTITY_RULES_VERSION` e aceeași, nu le aprobă din nou automat, nici dacă sursa revine (`revokedIdentityHolds`, motiv `approval_revoked_review_required`). O regulă nouă, adică o nouă versiune, le eliberează către descoperirea obișnuită.

Peste plafon, ca și la conflicte între două grupuri aprobate (`Overlapping approved groups`) sau la un registru invalid, publicarea se oprește ca înainte: atâtea probleme deodată arată o eroare de cod sau o schimbare a sursei. Fiecare problemă izolată trimite o singură alertă pe e-mail (`identity-revoked:<audit id>`, `quarantine:<raw id>`) și apare în `/admin/procesare` la „De verificat” cât timp e deschisă. Verifică-le dimineața: cauza, apoi fie o regulă nouă, fie rămâne exclusă. Funcțiile păstrează implicit oprirea la prima problemă; doar `scripts/processing.ts` trimite plafoanele.

**Carantina blochează publicarea (17 octombrie 2026, înlocuit pe 18 octombrie).** Până la paragraful de mai sus, un singur document pus în carantină la `normalize` oprea publicarea și păstra mentenanța. Cauza apare în `run.log` din `/srv/seap/backups/processing/<run-id>/` și în `core.quarantine` (`retry_required`, `resolved_at is null`). Pe 17 octombrie, anunțul 100661676 a republicat contractele din 8 octombrie cu ID-uri noi, iar `reviewed-winner.ts` era legat de ID-urile vechi. Regulile se leagă acum de cod SICAP + CUI + nume exact, în orice contract (detalii în `docs/implementation/recovery-20261008/README.md`). Următoarea rulare reîncearcă singură documentul din carantină.

**Alerte pentru operator.** Comanda `claim`, rulată de cron în fiecare minut, trimite pe e-mail adminilor verificați (`auth.users`, rol `admin`) incidentele care cer intervenție: procesare eșuată, procesare fără heartbeat de 15 minute, colectare oprită global (`blocked_reason`), flux pus automat pe pauză (`stream-auto-paused`) și problemele izolate dintr-o publicare (`identity-revoked`, `quarantine`). Fiecare incident are o cheie în `app.operational_alerts` și se trimite o singură dată. O oprire globală e un singur incident până se ridică; următoarea oprire primește alt mesaj. Eșecurile SMTP se reîncearcă de cel mult 5 ori. Fără `SMTP_HOST`, incidentele rămân `pending` și apar doar în `processing-scheduler.log`. Incidentele mai vechi de 24 de ore nu se anunță retroactiv. În timpul unei procesări, lock-ul de deploy oprește verificarea, iar alerta pleacă în primul minut după eșec.

**Colectare care nu aduce nimic (19 octombrie 2026).** Pe 18 octombrie colectarea a stat 30 de ore după un singur e-mail de blocaj. Alerta `collection-idle` urmărește efectul, nu cauza: SEAP fără nicio cerere reușită de 3 ore, TED fără nicio cerere de 24 de ore (un TED la zi întreabă din oră în oră, iar un număr nepublicat răspunde 404). Timpul se socotește de la ultima redeschidere după procesare, iar în mentenanță nu se trimite (o acoperă alertele de procesare). E-mailul numește cauza găsită în setări (blocaj, pauză globală, flux pe pauză) sau, fără niciuna, un colector oprit ori cereri care eșuează toate. Se repetă la 12 ore, ca „Reamintire”, și se închide când colectarea aduce iar ceva. O pauză pusă intenționat din admin trimite și ea reamintiri. Tot de atunci, o recuperare reușită (`--recover-failed`) readuce colectarea la starea de dinaintea rulării eșuate, nu la pauza pusă de eșec; un blocaj încă activ o ține oprită.

**Reverificare țintită la `identity-repair` (15 octombrie 2026).** Reverificarea reia doar grupurile aprobate care au cel puțin un membru cu amprentă schimbată, nu toate cele ~85.000. Reverificarea completă (~3 ore) rămâne pentru rularea programată de risc săptămânală, după schimbarea `IDENTITY_RULES_VERSION` și până când ultima trecere completă cu regulile curente a găsit `changedOutsideTargets: 0` în `app.collection_audit` (`identity-revalidation`). Prima rulare după deploy este deci completă și servește drept probă; dacă o trecere completă găsește vreodată schimbări în afara grupurilor țintă, modul țintit se oprește singur până la o trecere completă curată. Verifică dimineața `after->>'mode'`, `staleGroups` și `changedOutsideTargets`. [Detalii](../implementation/publication-revalidation-20261009/README.md).

**Reverificarea completă doar în ziua de risc (17 octombrie 2026).** „Rularea programată de risc săptămânală” înseamnă acum strict rularea programată din ziua `risk_weekday` (duminică). Celelalte rulări `full` rămân țintite: cele forțate de colectarea arhivei în mentenanță, de o schimbare de raportare sau o recuperare manuală. Regula de siguranță rămâne: reguli noi sau o trecere completă cu `changedOutsideTargets > 0` forțează din nou o trecere completă. Motivul este durata: pe 16 octombrie, reverificarea completă a ~199.000 de publicări a luat 3 h 38 min din 6 h 33 min.

**Abrevieri de act adițional (16 octombrie 2026).** Procesarea din 16 octombrie s-a oprit la `identity-repair` pe un singur grup aprobat (`missing_amendment_evidence`): a treia publicare a contractului subsecvent 280/2026 (CAN 100661218, contract 108207642) a scăzut valoarea de la 843.386,18 la 724.549,91 lei, cu titlul „…+Act adit dimin nr. 1159/02.10.2026”. Regula proprietarului din 12 octombrie acceptă ultima versiune când titlul numește un act adițional, dar expresia recunoștea doar „act adițional”/„ad diminuare”. `ADDENDUM_TITLE` acceptă acum și „act adit” și „act ad. dimin/major/supl”; `IDENTITY_RULES_VERSION` a devenit `contract-identity-rules-20261016`, deci următoarea trecere e completă. Verificare read-only înainte de schimbare: niciunul dintre cele 35 de grupuri excluse cu `missing_amendment_evidence` nu conține aceste abrevieri.

**„act ad <număr>” (18 octombrie 2026).** Procesarea programată din 18 octombrie s-a oprit la `identity-repair` din același motiv. A treia publicare a contractului 39919 („Contract paine semialba”, CAN1148579, anunțul 100661509) a scăzut valoarea de la 644.996 la 555.236 lei, cu titlul „… + act ad 61801/08.09.2026”. `ADDENDUM_TITLE` acceptă acum și „act ad” urmat de număr (opțional „nr.”), iar „act adjudecare 12” rămâne exclus. `IDENTITY_RULES_VERSION` a devenit `contract-identity-rules-20261018`. Verificare read-only pe producție: dintre cele 37 de grupuri excluse cu `missing_amendment_evidence`, se schimbă doar unul, contractul de medicamente din CAN1171429 (213.724,47 → 231.742,49 lei, „+ act ad 63837/22.09.2026”). Acesta devine acceptat, cu ultima valoare, conform regulii din 12 octombrie. Tot de aici vine și izolarea problemelor descrisă mai sus.

**Memoria la `identity-repair`.** Reverificarea publicațiilor aprobate citește registrul în loturi de 500 de grupuri (`REVALIDATION_BATCH`). Fiecare lot include toate contractele și arhivele numerelor sale oficiale de anunț, iar suprapunerile și erorile de verificare se adună peste loturi. Scrierile rămân într-o singură tranzacție, iar o eroare în orice lot anulează tot. Pe 14 octombrie 2026, citirea întregului registru (84.641 de grupuri după aprobările automate din 13 octombrie) a depășit heap-ul Node de ~1 GB, iar site-ul a rămas în mentenanță. Preflight-ul read-only `apps/ingestion/dist/scripts/preflight-publication-versions.js` folosește aceleași loturi și raportează `peakHeapMb`. Rulat cu două valori `REVALIDATION_BATCH`, trebuie să dea aceleași totaluri. Loturile singure n-au fost suficiente: preflight-ul din 14 octombrie a depășit tot ~1 GB după 40 de minute. De aceea containerul `processor` are acum `mem_limit: 6g` și `NODE_OPTIONS=--max-old-space-size=4096`. Ce anume ține memoria rămâne de investigat.

Un fix postgres.js folosește shutdown cu timeout pentru conexiuni rezervate expirate. Un proces care pare blocat după „toate verificările trecute” poate fi în cleanup, nu în calcul; inspectează activitatea DB/logul înainte de a rerula pipeline-ul.

### Import TED automat

Adăugat pe 16 octombrie 2026 și trecut în aceeași zi pe pachetul zilnic OJ S. **Este oprit până la activarea explicită.** Importă anunțurile de atribuire românești din TED (`can-standard`, eForms) ca **flux de colectare `ted`**, cu același protocol ca SEAP. Le arhivează în `raw` exact ca importul manual (`source='ted'`, `ted-eforms:v1`). Normalizarea, asocierea și `ted-mart` din noaptea următoare le preiau. Exemplu de lipsă reparată astfel: TED 506645-2026, „Oferte primite: —”.

- **Același protocol.** Cererile TED trec prin poarta comună (`runCollectionRequest`). Folosesc pool-ul de proxy-uri și spațierea pe IP din `collection_proxy_control`, plafonul global, limita zilnică, pauza 02:59–03:30, pauza, mentenanța, jurnalul `app.collection_requests`, reîncercările și auditul. **Bugetul este comun cu SEAP**: o cerere TED consumă din aceleași intervale. Colectorul se oprește înainte de `freeze`, deci procesarea nocturnă nu face cereri TED.
- **Ce se descarcă (din 16 octombrie 2026, seara).** **Pachetul zilnic OJ S**, nu XML-ul fiecărei notificări. Descărcarea pe notificare (`/en/notice/<n>/xml`) a fost blocată de AWS WAF-ul TED prin proxy-uri: 429 sau 202 cu `x-amzn-waf-action: challenge` și corp gol. O probă live prin proxy, pe 16 octombrie, a confirmat pachetul: `GET https://ted.europa.eu/packages/daily/202600200` → `application/gzip`, `content-disposition: attachment; filename=20261015_2026200.tar.gz`, 18.939.091 octeți. Adresa este `/packages/daily/{an}{număr OJ S pe 5 cifre}`. Varianta `/packages/notice/daily/...` dă 404 și nu este folosită. Un pachet conține XML-ul tuturor anunțurilor din acea zi, din toată UE. Se citesc doar anunțurile de atribuire românești.
- **Ținte permise.** Exact `POST https://api.ted.europa.eu/v3/notices/search` și `GET https://ted.europa.eu/packages/daily/<9 cifre>` (`isTedCollectionUrl`, `safeCollectionEndpoint`, `tedDailyPackageUrl`). URL-ul XML pe notificare **nu mai este permis**. Orice alt host sau cale este refuzat înainte de jurnal. Releul proxy rămâne un tunel TCP către proxy-urile fixe, deci restricția se face în aplicație. Nu se trimite Referer și nu se urmează redirecturi. În jurnal, parametrii sunt doar `{ojs}` pentru pachet și `{publicationDate,page,limit}` pentru căutare.
- **Transport.** Pachetul este binar și nu se decodează ca text. Plafonul este de 128 MB, doar pentru pachete; restul cererilor TED au 32 MB. Timeout-ul este cel de fișier, 600 s. Descărcarea de fișiere păstrează spațierea de 60 s față de alt fișier. Este reușită **doar** cu 200, fără `x-amzn-waf-action` și cu primii octeți gzip `1f8b`. Un 202, alt 2xx, antetul WAF sau un corp care nu e gzip se înregistrează ca `failed` în jurnal, cu motivul „fără conținutul așteptat (verificare anti-robot WAF sau fișier nevalid)”, și pun pe pauză fluxul `ted`. Regula se aplică și căutării: un 202 WAF nu mai poate apărea ca `success`.
- **Citire, fără shell.** gunzip în flux, apoi un cititor ustar strict (`src/scrape/ted/package.ts`). Acceptă fișiere obișnuite, directoare și nume pax/GNU lungi. Verifică suma de control a fiecărui antet și refuză legăturile, dispozitivele, căile absolute, `..`, fișierele peste 32 MB, mai mult de 1 GB decomprimat, peste 100.000 de intrări, arhivele trunchiate și datele de după cele două blocuri nule. Orice abatere oprește pachetul întreg, fără arhivare parțială. Prefiltrul text este cel din `scrape-ted-bulk`: `eforms-country">ROU` și `>can-standard<`. Apoi fiecare candidat este citit cu `extractTedNotice`. Se arhivează doar dacă: tipul este `can-standard`, numărul de publicare corespunde numelui fișierului `0000nnnn_aaaa.xml`, `efbc:GazetteID` este numărul OJ S cerut, `efbc:PublicationDate` este ziua pachetului și **o autoritate contractantă are țara `ROU`**, adică populația căutării TED `buyer-country="ROU"`. Anunțurile străine cu câștigător român trec prefiltrul, dar nu se arhivează; se numără în `result.otherCountry`. Arhivarea folosește `tedArchiveDocument({'publication-date':zi}, …)`, aceeași formă ca înainte (`source='ted'`, `can-standard:<număr>`, `ted-eforms:v1`). Un anunț deja arhivat identic este dublură după hash. Numele `content-disposition` (`{aaaallzz}_{an}{număr}.tar.gz`) trebuie să numească exact numărul cerut, iar data trebuie să fie validă. Altfel, pachetul este refuzat.
- **Sarcini și succesiune.** `ted-package {ojs}` descarcă un număr OJ S. După arhivare pune în coadă verificarea zilei (`ted-list {ojs, zi}`). Următorul număr îl pune bifa colectorului, **la cel puțin 30 de minute după ultima descărcare de pachet** (`TED_PACKAGE_SPACING_MS`). Pe 16 octombrie 2026 TED a răspuns 429 la al patrulea pachet cerut la circa un minut după cel anterior, de pe proxy-uri diferite, fără `Retry-After`. Cu 10 minute între pachete, a răspuns 429 la al optulea pachet consecutiv (17 octombrie, 00:40). Estimarea din cele trei episoade este de circa 4 descărcări în rafală, reumplute cu circa una la 20 de minute. Nu este o limită publicată. Numerele nu se ghicesc din date. Un **404 înseamnă „număr încă nepublicat”**: sarcina se încheie fără documente, cu `result.published=false`. În jurnal, cererea apare `failed` cu `HTTP 404` și nu oprește fluxul. Bifa TED din `advanceRecovery` rulează la fiecare minut în colector și reîncearcă numărul următor **cel mult o dată pe oră**. Există cel mult o încercare în coadă, iar eticheta încercării este ora României (`tedScan` = `AAAA-LL-ZZTHH`). **Trecerea la anul nou:** dacă `număr+1` a dat 404 și anul curent în România este după anul ultimului număr arhivat, se încearcă întâi `{an+1}00001` (o singură descărcare pe interval). După primul număr al anului nou, succesiunea continuă de acolo. O încercare eșuată din alt motiv, cu fluxul pus pe pauză și auditat, se repune în coadă după o oră. Ea rulează abia după ce operatorul reia fluxul. Prioritate 10, paginarea căutării 0.
- **Verificare cu căutarea TED.** `ted-list` nu mai creează sarcini-copil pe notificare. Paginează căutarea API pentru ziua pachetului, `buyer-country="ROU"`, `can-standard`, câte 100, cu aceleași verificări de total stabil și fără repetări. La ultima pagină compară **mulțimea exactă** de numere de publicare din căutare cu cea arhivată din pachet (`verifyTedDay`). La egalitate, rezultatul păstrează `verified:{ojs,day,package,search,match:true}`. La diferență, sarcina devine `failed` cu un mesaj românesc vizibil în `/admin`, de forma „TED: verificare eșuată pentru OJ S 198/2026 (2026-10-13): pachetul are 1 anunțuri românești, căutarea TED 2. Lipsesc din pachet: 105-2026.”. Lipsa este izolată: fluxul nu se oprește, numerele următoare continuă, iar lotul rămâne cu „erori de verificat”. Pentru indexarea întârziată, o zi cu verificare eșuată se caută din nou o dată pe zi, în următoarele 3 zile (`TED_OVERLAP_DAYS`). Încercarea eșuată rămâne în istoric.
- **Migrarea sarcinilor `ted-xml`.** `ted-enable` face și migrarea, într-o singură tranzacție. Sarcinile vechi `ted-xml` și `ted-list` fără `ojs`, în stare `pending` sau `failed`, devin `split`, cu eroarea „Înlocuită de pachetul zilnic OJ S (migrare ted-enable)”. `result` păstrează `supersededBy`, `previousStatus` și `previousError`, iar reîncercările lor sunt închise. Auditul `ted-enabled` le numără în `before.legacy`, pe tip și stare, și le listează în `after.supersededTaskIds`. Activarea refuză dacă o sarcină TED rulează. Dacă fluxul ar fi reluat înainte de migrare, o sarcină veche luată din coadă nu face nicio cerere. Ea eșuează cu mesajul „sarcină veche… Rulează ted-enable” și pune pe pauză fluxul `ted`.
- **Pornire (o linie, fără trafic, cu audit `ted-enabled`):** `cd /srv/seap/src/infra/prod && docker compose --profile collection run --rm --no-deps collection node apps/ingestion/dist/scripts/collection.js ted-enable`. Apoi reia fluxul „Atribuiri TED (UE)” din `/admin`, dacă era pe pauză. Punctul de plecare se calculează din date: cel mai mare `efbc:GazetteID` dintre ultimele 50 de numere de publicare `can-standard` din `raw`. Local, acesta este OJ S 123/2026, din 30.06.2026. Acel număr se descarcă din nou, ca suprapunere. Fără niciun anunț TED cu număr OJ S în `raw`, activarea refuză. Recuperarea locală ar însemna circa 78 de pachete, de aproximativ 19 MB fiecare, adică ~1,5 GB prin proxy-uri. Cu spațierea de 60 s pentru fișiere, durează cel puțin o oră și consumă din bugetul comun. **Oprire:** pune pe pauză fluxul „Atribuiri TED (UE)” din `/admin`. Pe o bază activată înainte cu designul pe notificare (există `ted-list`/`ted-xml`, dar niciun `ted-package`), `ted-enable` rulează din nou: migrează și pornește pachetele.
- **Erori izolate pe flux.** Un 429, 403, o verificare WAF, alt răspuns neașteptat, o eroare de transport, o arhivă nevalidă, un XML necitibil sau din alt număr ori altă zi și o paginare instabilă pun pe pauză **doar fluxul `ted`**. Fiecare lasă intrarea `stream-auto-paused` în audit și alerta operatorului; SEAP continuă. Motivul unui 429 include `Retry-After`; reia fluxul abia după termen. Un 5xx sau 408 se reîncearcă după 5 și apoi 10 minute, ca la SEAP, și abia apoi oprește fluxul. Erorile TED nu intră în circuitul proxy-urilor SEAP. Doar diferența dintre pachet și căutare rămâne lipsă izolată, fără pauză.
- **Verificare.** `SELECT kind,status,count(*) FROM app.collection_tasks WHERE stream='ted' GROUP BY 1,2;`, `SELECT params->>'ojs',status,result->>'published',result->>'total',error FROM app.collection_tasks WHERE kind='ted-package' ORDER BY id DESC LIMIT 10;` și `SELECT started_at,endpoint,status,outcome,error,bytes,proxy_id FROM app.collection_requests WHERE stream='ted' ORDER BY id DESC LIMIT 10;`. Verificările eșuate: `SELECT params->>'ojs',params->>'from',error FROM app.collection_tasks WHERE kind='ted-list' AND status='failed';`. Pentru pauze automate, vezi `app.collection_audit` (`action='stream-auto-paused'`).
- **Verificat live pe 16 octombrie 2026:** pachetele OJ S 123–125/2026 (17–21 MB, 3.470–3.616 XML-uri, descărcate în 2–3 s prin proxy) au fost citite și arhivate (84 și 44 de atribuiri românești pentru 123 și 124). Al patrulea pachet, cerut la un minut, a primit 429; de aici distanța de 10 minute, mărită la 30 după încă un 429 (vezi mai sus). Verificarea a arătat câte **un anunț lipsă pe zi** față de căutare (449040-2026, 452438-2026), absent și din importul lunar vechi: filtrul preliminar text nu le prinde. **Cauza (aflată din `result.notArchived` la OJ S 127/2026, 5 din 159):** multe XML-uri marchează țara cu `listName="country"`, nu `listName="eforms-country"`, iar filtrul (moștenit din `scrape-ted-bulk`) căuta doar a doua formă. Filtrul acceptă acum ambele (`TED_PREFILTER_VERSION=2`, și în `scrape-ted-bulk`). Numerele OJ S citite cu filtrul vechi a căror verificare a eșuat se descarcă din nou, cele mai vechi întâi, câte unul pe interval, și primesc o verificare nouă (scanare = ziua încercării). **Importul lunar istoric (2023+) are probabil același gol**; măsurarea și reimportul cer o decizie separată. De la `39eaaf6`+1, fiecare pachet păstrează în `result.notArchived` numărul de publicare și motivul pentru XML-urile `can-standard` care menționează ROU dar nu trec filtrul (plus elementul care conține ROU, fără conținut) și pentru cele respinse structural. Mesajul verificării eșuate spune pentru fiecare anunț lipsă dacă era în pachet și de ce nu a fost primit.
- **Neverificat la livrare.** Testele folosesc doar pachete sintetice construite în test, fără trafic. Necunoscute: dacă pachetele vechi rămân disponibile, la ce oră apare numărul zilei, dacă TED publică și în weekend și dacă indexarea căutării ține pasul cu pachetul. Un format neașteptat al arhivei oprește fluxul, fără arhivare parțială. Un pachet fără XML-uri românești detectate dă o verificare eșuată vizibilă. Urmărește primele cereri și primele verificări în jurnal.

### Durate măsurate, nu SLA

- Reparație TED + recalculare completă 27 septembrie: pipeline 1 h 47 m 49 s; mentenanță 2 h 50 m 31 s inclusivbackup/reparare/search.
- Repetiție zilnică pe copie:41 m 15,247 s pentrupipeline, exclusiv amprentele de risc/backup/search.
- Durata unei nopți viitoare depinde de volume și resurse; vezi `app.processing_runs`, nu extrapola un cron 05:00 în „gata la 05:01”.

## Inspecție read-only

Într-o sesiune `psql` autentificată local pe server:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SELECT revision,paused,maintenance,blocked_reason,min_seconds,max_seconds,
       processing_enabled,processing_time,risk_weekday
FROM app.collection_control;
SELECT id,end_day,status FROM app.collection_batches ORDER BY created_at DESC LIMIT 1;
SELECT stream,status,count(*) FROM app.collection_tasks
WHERE batch_id=(SELECT id FROM app.collection_batches ORDER BY created_at DESC LIMIT 1)
GROUP BY stream,status ORDER BY stream,status;
SELECT id,stream,status,outcome,started_at,finished_at
FROM app.collection_requests ORDER BY id DESC LIMIT 10;
SELECT task_id,timeouts,status,retry_at FROM app.collection_retries ORDER BY updated_at DESC LIMIT 10;
SELECT scheduled_day,scope,status,stage,started_at,completed_at
FROM app.processing_runs ORDER BY started_at DESC LIMIT 5;
SELECT version,kind,status,completed_at FROM app.monitoring_refreshes ORDER BY version DESC LIMIT 5;
COMMIT;
```

Nu publica output-ul brut al diagnosticelor sau emailurile din admin. Aceste query-uri nu cer date de la SEAP.

## Incidente închise — nu se rerulează

- Reparația arhivei TED, asocierea și publicarea live din 27 septembrie au fost încheiate și validate.
- Repetiția daily și activarea cronului au fost încheiate. O eroare de stdinSSH/Compose a fost corectată; vechiul raport failed-continuation nu cere relansarea întregului proces.
- Task 36017 s-a oprit înainte de HTTP din cauza unui prepared `SELECT *` invalidat de migrare; rezolvat prin proiecții stabile și retry one-off validat.
- Request 801/task 42952: retry unic autorizat atunci, request 802 success; nu se reaplică scriptul.
- Bugul `https://0.0.0.0:3000/contracte/...` a fost reparat cu redirect relativ.

Fișierele din `scripts/operations/` cu date 20260927 sunt audit/proceduri one-off. **Nu le executa ca setup, mentenanță de rutină sau retry generic.** Citește întâi `docs/implementation/continuation-20260927.md` și starea actuală.

## Recuperare și backup

Backup-urile programate conțin și date private. Din 19 octombrie 2026 se păstrează dump-urile complete (~24 GB fiecare) ale ultimelor 2 rulări reușite plus al ultimei rulări complete reușite (cea săptămânală). Dump-ul unei rulări eșuate se șterge după prima rulare reușită de după ea, pentru că recuperarea face propriul backup. Toate stau pe același disc ca baza de date și nu protejează împotriva pierderii serverului. Arhivele TED/benchmark separate sunt conservate. Verifică spațiul și politica înainte de ștergere.

La eșec: conservă logul, checksum-ul, boundary-ul și checkpoint-ul; validează reparația sau restore-ul într-o bază **nouă**, reconstruiește/verifică search și abia apoi planifică schimbarea live. Nu reda publicului date parțial refăcute. Nu șterge independent un source block ca efect secundar al redeschiderii site-ului.

Documente detaliate: [scheduled-processing](../implementation/scheduled-processing.md), [recovery runbook](../implementation/collection-recovery-runbook.md), [timeout retries](../implementation/seap-timeout-retries.md), [quiet window](../implementation/seap-quiet-window.md), [TED recovery](../implementation/ted-production-recovery-20260927.md).
