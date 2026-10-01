# Reparația identităților istorice — lucru în curs, 1 octombrie 2026

> Historical implementation/checkpoint notes. The [live publication report](entity-identity-release-20261001.md) supersedes the operational states below. Do not restart jobs based on this document.

Proprietarul a aprobat planul și a cerut implementarea. Diagnosticul inițial este
în `docs/reviews/entity-identities-20261001/report.md`. Branch de lucru:
`fix/historical-authority-identities`, bazat pe `b293eea`. Codul este comis și împins pe branch (`22c186d`, `96388a2`, `aaf7b83`); nu pe main, fără deploy.

## Audit reproductibil finalizat

`audit-legacy-authorities.ts` a citit toate cele 4.781.249 de DA din BSON:
15.842 șiruri de autoritate, 4.746.926 rânduri coroborate CUI+nume cu dimensiunea
originală, 34.323 rânduri în 313 grupuri nerezolvate. Niciun prefix coroborat ca ID
SICAP și niciun conflict cu două identificări coroborate. Nu înseamnă că toate
rândurile coroborate necesită schimbare: urmează diferența față de core.

Bundle local, **necomis**: `/tmp/seap-identity-audit-20261001/verified-v2/` (manifest v2, inclusiv dimensiunea originală integrală).
- Dimensiune SHA256: `7656fcae69f8a00e0ca3358bac68c806936da8df2b2cd425c817e62522d7376b`.
- DA BSON SHA256: `6b7d73c17871973d1adad70dbf69c725c2effb49a4db28959dcdfc55c1f3fd2a`.
- Fiecare rând sursă este în `rows.tsv`, inclusiv cele nerezolvate; `groups.json`
  păstrează rezultatul clasificării, probele de ID și eșantioane. Manifestul
  certifică hashurile și numărul de rânduri după citirea completă.

Verificare read-only a referințelor candidate în baza LOCALĂ: zero referințe în
notices, awards, contract_winners, ted_notices, ted_lot_winners sau ca furnizor DA.
2.419 asocieri `reference.authority_uat`; trebuie validate/transferate. SQL și
rezultat: `/tmp/seap-identity-audit-20261001/references.sql`, `external-references.csv`.

## Cod implementat, încă nepublicat

- Importatorul tratează autoritatea ca șir fiscal CUI+nume, nu inventează SICAP.
  Reluarea verifică ID-urile DA existente înainte de a crea entități și raportează
  numărul real inserat. Citirea BSON refuză trunchieri/corupție.
- Auditor independent fără conexiune DB sau trafic sursă.
- Migrare 0046: `core.entity_redirects`, funcție canonică și protecție contra
  lanțurilor/ciclurilor. **Aplicată pe baza locală de lucru `seap`: tabel GOL.**
  Nicio achiziție reală nu a fost reasociată în baza locală de lucru.
- Compatibilitate pentru pagini/profiluri, întrebări, populații și excluderi,
  drawer, legături/comparații și verificarea identităților urmărite. Capturile
  și întrebările stocate nu sunt rescrise.
- `scripts/identity-repair/rehearse.py`: prepare/audit/pilot/apply/verify, doar
  DB izolată `seap_test_identity_*`. Verifică manifest, conservarea tuturor
  câmpurilor non-identitate și fingerprint global cu exact modificările admise.
- `aliases.sql`: doar entități fără CUI/ID străin, complet evacuate de tranzacții,
  fără alte roluri, dovadă originală; păstrează identitatea veche pentru chitanțe,
  elimină ID-ul SICAP fabricat, verifică UAT. Pilotul Cluj a trecut inclusiv acest pas.
- `clone-refresh.mjs`: wrapper explicit DOAR pentru copie; pipeline complet
  existent, fără SEAP, fără index Meili live.

## Verificări trecute până aici

- 101 unit ingestion; test real import+reluare și 8 teste reader/clasificare.
- 364 unit web (146 integrări sărite în rularea implicită).
- 2 integrări PostgreSQL reale pentru redirect: filtre/excluderi, chitanțe de
  legături și urmăriri, conservarea obiectelor originale, schimbarea țintei
  refuzată, lanțuri/cicluri refuzate.
- Typecheck web/ingestion a trecut; verificările ulterioare se găsesc în loguri.
- Fixture DB: `seap_test_identity_import`, separată de copiile reale. Nu rula
  `legacy-import.integration.test.ts` pe copia de date: testul șterge fixtures.

## Pilot real validat și plan complet (~16:13 RO)

- Pilot izolat `seap_test_identity_pilot_20261001`: 1.569 rânduri Cluj mutate
  `2147251 → 2146445` (1.388 acceptate), 5.953 acceptate pe profilul canonic.
  CUI14920794 / entitatea2165580 rămâne neschimbată, 102 acceptate.
- Conservare exactă a valorilor și a tuturor câmpurilor non-identitate; fingerprint
  global; reluare fără modificări; un redirect verificat; SICAP fals eliminat,
  SICAP1226 păstrat; asocierile UAT reconciliate fără conflict.
- Cinci rute reale în build Next au răspuns307 către ID-ul canonic, păstrând
  parametrii: profil, comparații, legături, radiografie, surse. Artefact `route-checks.json`.
- Planul complet local ȘI copia completă de producție: **4.231.642 rânduri**, 14.536
  ID-uri vechi, zero conflicte raw_id, zero rânduri de arhivă lipsă, zero conflicte UAT.
- **231 rânduri** erau pe o instituție reală greșită: Muzeul Câmpiei Băileștilor
  (2130379, CUI9486029, SICAP201802), deși sursa indică Institutul de Cercetări
  Biologice (1986102, CUI201802, SICAP11137). Numai rândurile se corectează;
  identitatea muzeului și SICAP-ul real rămân. Exemple DA102321228/102310351/102212038.
- Testele de siguranță ale scriptului au trecut (manifest, drift, rollback,
  idempotentă, conservare, coliziune namespace reală, conflict UAT). Web build,
  8 teste DB și 20 teste operaționale trecute, pe lângă testele enumerate anterior.

## Operațiuni ACTIVE — nu relansa

1. LOCAL: `seap_test_identity_repair_20261001` are schema completă, dar date doar
   entities/SICAP/CPV/authority_uat și **20.795.132 DA**. Restaurarea și auditul au
   terminat. Corecția integrală a comis **4.231.642 rânduri**; log
   `/tmp/seap-identity-audit-20261001/full-apply.log`. Verificarea globală a trecut
   (`full-verify.log`), inclusiv toate amprentele și sumele. A doua aplicare a
   schimbat **0 rânduri** (`full-idempotence.log`), terminată17:24RO. Nu mai sunt
   operațiuni locale active. Nu derivăm aliasuri din această copie parțială:
   absența rolurilor din tabelele omise nu dovedește absența lor reală. Aliasurile
   și publicarea sunt validate pe copia COMPLETĂ de pe server.
2. SERVER: copia COMPLETĂ `seap_test_identity_full_20261001` este gata și auditul
   confirmă planul. Director privat `/srv/seap/backups/identity-repair-20261001/`.
   Backup `snapshot.dump`6,6GB +checksum, păstrat numai pe server. Include date
   private; NU îl descărca sau pune în Git. Copia este paused și processing disabled.
   `apply-copy.sh` rulează din15:11ora serverului (16:11RO), prin nohup:
   apply → verify → apply → verify → aliases → verify au trecut. **14.264 aliasuri**,
   2.414 UAT vechi arhivate/eliminate, 3 UAT adăugate canonic. Pipeline complet pornit
   16:27:31 RO, boundary raw17363865. Normalize/reconcile/ted-mart/marts terminate;
   flags în curs la17:17RO, activ fără așteptare de lock. Profil Cluj canonic:
   5.953 DA și569 contracte; CUI14920794 rămâne separat,102 DA și4 contracte.
   Log `apply-copy.log`; markere `rows.ready`, `refresh.ready` sau `apply.failed`.
   Wrapperul `clone-refresh.mjs` refuză orice DB fără prefixul izolat și nu folosește
   Meili live. NU s-au modificat achiziții, control, workers sau schedule live.
3. Preview local3013 al pilotului a fost oprit (PID35205), verificările sunt salvate.
   NU opri devul utilizatorului3000 (PID16949) sau mockups4185. După timeout-uri,
   verificarea IPv4 `127.0.0.1:3000` a trecut:health200 în1,3s, profil200 în15,5s
   (primul render, în timpul operațiunii locale intensive). Nu a fost repornit.
4. Preview COMPLET pe server, loopback3014, imagine `cinecastiga-identity-preview:aaf7b83`,
   checkout separat `/srv/seap/identity-preview-src`. Containere `identity-preview-web`
   și `identity-preview-meili`, credențiale auth/Meili noi, SMTP gol, documente disabled.
   Baza copiei a primit granturi web și CONNECT explicit pentru seap_web. Tunel
   local3014 sesiune3354. Mentenanța copiei este explicit=true până după validarea
   indexării. Nicio expunere publică a copiei.
5. `search-copy.sh` așteaptă refresh.ready și pornește indexarea titlurilor și Meili
   separat; markere search.ready/search.failed, logsearch-copy.log, raportsearch-report.json.
   Nu relansa. `plan-proof.json` este pregătit:4231642 rânduri,14264 aliasuri,
   fingerprint `-27804067446331219630579`.

## Următorii pași necesari

1. Monitorizează corecția și validările pe copii. Nu relansa joburile existente.
2. După pipeline complet pe server: validare index de titluri, Meili SEPARAT,
   comparație Cluj/alte cazuri/core vs marts și probe HTTP/UI.
3. Finalizează/testează coordinatorul LIVE cu backup proaspăt, mentenanță,
   oprirea writerilor, corecție+recalculare, validare, restart/index și reluare.
   Coordinatorul datat este acum scris (`publish.sh`, `publication*.mjs`, opțiune
   guarded în rehearse.py), dar NEEXECUTAT, comis și împins în `96388a2`. Un test
   PostgreSQL cu rollback pentru control/revision/boundary a trecut. Importurile
   modulelor au trecut în imaginea reală de producție; un target greșit este refuzat
   înainte de conectare (URL de canary inofensiv, fără parolă live). Mai trebuie
   verificarea finală și raportul autentic release-validation.json al copiei; nu
   fabrica markerul. Nu aplica ad-hoc aliases.sql pe live.
4. Commit/deploy compatibil, apoi reparație live numai după validarea copiei.
   Nicio corecție a achizițiilor în baza locală de lucru sau live încă.
   Migrarea0046 este aplicată pe local normal, cu redirects GOL.

## Probe UI pregătite, încă nerulate pe copia completă

Scriptul local `/tmp/seap-identity-audit-20261001/verify-preview.mjs` folosește
Playwright Core instalat în repo și Chrome local, pe tunelul3014. Se execută DOAR
după `search.ready` (pipeline-ul în curs întoarce503 pentru pagini). Verifică nouă
redirecturi, echivalența query/surse vechi vs canonice, căutare și șase profiluri,
două pagini DA (inclusiv coliziunea muzeu/institut) și linkurile SEAP fără a le
accesa. Scrie `preview-checks.json` și două capturi PNG. Date numai publice.

După probe reale reușite, raportul `release-validation.json` se construiește din
`search-report.json`, `plan-proof.json`, `manifest.json` și `preview-checks.json`,
cu status/routesPassed/checkpointId/proofFiles/plannedRows/planFingerprint/aliases.
Acest marker NU există încă și nu trebuie inventat ca să pornească live.

## Ultima verificare a capturilor (17:02 RO)

Un traseu suplimentar a fost corectat: recapturarea unei entități cu ID vechi
folosește acum contextul, CUI-ul și numărătorile canonice, nu doar rândurile canonice.
Cererea originală și capturile complete precedente rămân neschimbate; noua versiune
consemnează ID-ul cerut și ID-ul efectiv. Scopul/spec-ul efectiv sunt canonice.
Capturile obișnuite folosesc acum aceeași poartă de publicare ca relațiile și
comparațiile: în timpul unei publicări nevalidate eșuează fără rânduri parțiale,
cu posibilitatea reîncercării după procesare. Metadata noilor capturi ia versiunea
riscului din checkpoint-ul real, în locul constantei vechi rf-2026.5.

Teste noi/rerulate:9 integrări capturi reale PostgreSQL (inclusiv100.001rânduri și
imuabilitate),6 integrări legături,12 integrări comparații;364 unități web trecute,
148 integrări sărite în rularea implicită;TypeScript trecut. Testele de control și
repetiția sintetică a scriptului au trecut iar. Coordinatorul live verifică și
capturile queued/running, cu trei observații consecutive fără lucrări înainte de
backup. În producție, tabela capturilor era goală la această verificare; niciun
conținut privat nu a fost citit.

Preview-ul a fost reconstruit și repornit pe imaginea `cinecastiga-identity-preview:aaf7b83`.
Buildul de producție a trecut. La pregătire s-a constatat lipsa grantului CONNECT
pentru rolul web în copia cu CONNECT PUBLIC revocat; grantul explicit este acum
aplicat numai pe copie. Mentenanța copiei a fost setată explicit=true până la
validare. După search.ready trebuie setatăfalse DOAR în copie înainte de proba UI;
paused=true și processing_enabled=false rămân. Nu deduce conexiunea DB din health200.

Coordinatorul live folosește backup custom `-Z1` (același nivel ca backupul restaurat
pe copia completă) și păstrează eroarea sanitizată în raport/log privat la eșec.
La17:17RO: live încă peb293eea, revision24, paused=false, maintenance=false,
delay40–60s, zilnic05:00, risc duminică. Spațiu liber server760GB. Nu schimba aceste
setări ca efect secundar al reparației.
# Checkpoint final al sesiunii:18:37RO

**[Handoff actualizat](../handover/continuation-identity-20261001.md) are prioritate
față de stările intermediare de mai jos.** Toate joburile copiei sunt terminate:
pipeline complet1h47m41,772s, checkpoint5988d154-8e40-4616-b71c-d6a1d881a784 ready;
indexare20.588.021 titluri și180.979 entități, toate verificările trecute.
Branch împins până lab7b9061; preview încă peaaf7b83. Urmează reconstruirea
preview-ului pentru păstrarea parametrilor Radiografiei, probele reale HTTP/UI și
apoi publicarea protejată. Nicio modificare a achizițiilor live/local normal.
