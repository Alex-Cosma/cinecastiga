# Operare în producție

Acest document transmite mecanisme și decizii, nu autorizație permanentă de administrare. Dezvoltarea locală nu cere acces live. Verificările citire-only sunt distincte de reluarea colectării, migrare, rebuild sau restore.

Consolidat la 1 octombrie 2026. Ultima verificare de producție consemnată este din 30 septembrie, seara: [raport final](../implementation/release-20260930.md). Tranziția calendarului este încheiată; nu se repetă la următorul deploy obișnuit. Pentru starea din momentul intervenției citește controlul și rulările din baza mediului vizat.

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

Schema veche trebuie să poată servi versiunea veche în timpul migrării. Nu există rollback destructiv automat al migrațiilor deja comise. Nu rezolva o eroare de istoric prin resetarea migrațiilor sau ștergerea tabelelor.

## Colectare SEAP — politica efectivă

- Fluxuri: achiziții directe, anunțuri de participare, atribuiri; catalog auxiliar.
- Recuperare: DAde la 1 iulie 2026, anunțuri/atribuiri de la 1 ianuarie 2026, deduplicare. Vechile loguri nu demonstrau acoperirea completă până la 31 iulie, de aceea s-au ales ferestre suprapuse.
- Lotul curent `recovery-2026-09-25` are capăt fix 25 septembrie 2026. Nu se extinde automat doar fiindcă azi e o zi nouă.
- Buget comun pentru colector și documente: în modul direct rămâne o cerere în curs și intervalul din `collection_control`; prin proxy, intervalul pe IP, plafonul total și concurența sunt în `collection_proxy_control`. Limitele acceptate sunt1–50porniri/minut și1–10cereri simultane, maximum una pe IP. Decizia proprietarului din6octombrie:100proxy-uri noi,35–45s/IP,50/min,10simultane. [Rollout și stare verificată](../implementation/seap-proxy-pool.md#concurrent-requests-and-replacement100-endpoint-pool--2026-10-06). Citește setările live înainte de orice intervenție; valorile istorice nu sunt instrucțiuni de resetare.
- În plus, GET-urile de fișiere au minimum 60 secunde între începuturi, inclusiv eșecuri.
- Nicio descărcare automată de PDF-uri; utilizatorul autentificat cere documentul.
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

403/429/challenge, răspuns invalid, eroare SQL, conexiune pierdută fără deadline-ul confirmat sau anulare nu sunt tratate automat ca timeout. Păstrează diagnosticele, statusul, parametrii siguri, faza, durata și excepția sanitizată. Nu stoca parole/tokenuri/cookies în jurnal.

Orice manual pause, stream pause, maintenance, daily cap sau source block rămâne independent. O cerere rămasă „running” după pierderea worker-ului impune inspecție; nu o marca success pentru a debloca UI-ul.

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

Un fix postgres.js folosește shutdown cu timeout pentru conexiuni rezervate expirate. Un proces care pare blocat după „toate verificările trecute” poate fi în cleanup, nu în calcul; inspectează activitatea DB/logul înainte de a rerula pipeline-ul.

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

Backup-urile programate conțin și date private. Păstrează cele mai recente 14 puncte de restaurare programate reușite; backup-urile rulărilor eșuate și arhivele TED/benchmark separate sunt conservate. Verifică spațiul și politica înainte de ștergere.

La eșec: conservă logul, checksum-ul, boundary-ul și checkpoint-ul; validează reparația sau restore-ul într-o bază **nouă**, reconstruiește/verifică search și abia apoi planifică schimbarea live. Nu reda publicului date parțial refăcute. Nu șterge independent un source block ca efect secundar al redeschiderii site-ului.

Documente detaliate: [scheduled-processing](../implementation/scheduled-processing.md), [recovery runbook](../implementation/collection-recovery-runbook.md), [timeout retries](../implementation/seap-timeout-retries.md), [quiet window](../implementation/seap-quiet-window.md), [TED recovery](../implementation/ted-production-recovery-20260927.md).
