# Reparația identităților istorice — lucru în curs, 1 octombrie 2026

Proprietarul a aprobat planul și a cerut implementarea. Diagnosticul inițial este
în `docs/reviews/entity-identities-20261001/report.md`. Branch de lucru:
`fix/historical-authority-identities`, bazat pe `b293eea`. Codul este comis și împins pe branch (`22c186d`); nu pe main, fără deploy.

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
   terminat. Corecția integrală rulează în sesiunea20818; log
   `/tmp/seap-identity-audit-20261001/full-apply.log`. Urmează verify, rerulare,
   aliases, verify. Aceasta NU validează toate marts-urile sau datele private.
2. SERVER: copia COMPLETĂ `seap_test_identity_full_20261001` este gata și auditul
   confirmă planul. Director privat `/srv/seap/backups/identity-repair-20261001/`.
   Backup `snapshot.dump`6,6GB +checksum, păstrat numai pe server. Include date
   private; NU îl descărca sau pune în Git. Copia este paused și processing disabled.
   `apply-copy.sh` rulează din15:11ora serverului (16:11RO), prin nohup:
   apply → verify → apply → verify → aliases → verify au trecut. **14.264 aliasuri**,
   2.414 UAT vechi arhivate/eliminate, 3 UAT adăugate canonic. Pipeline complet pornit
   16:27:31 RO, boundary raw17363865. Normalize terminat; reconcile în curs.
   Log `apply-copy.log`; markere `rows.ready`, `refresh.ready` sau `apply.failed`.
   Wrapperul `clone-refresh.mjs` refuză orice DB fără prefixul izolat și nu folosește
   Meili live. NU s-au modificat achiziții, control, workers sau schedule live.
3. Preview local3013 al pilotului a fost oprit (PID35205), verificările sunt salvate.
   NU opri devul utilizatorului3000 (PID16949) sau mockups4185. Devul3000 are timeout
   inclusiv health la16:30, fără query DB activ; necesită diagnostic separat.
4. Preview COMPLET pe server, loopback3014, imagine `cinecastiga-identity-preview:22c186d`,
   checkout separat `/srv/seap/identity-preview-src`. Containere `identity-preview-web`
   și `identity-preview-meili`, credențiale auth/Meili noi, SMTP gol, documente disabled.
   Baza copiei a primit granturi web. Tunel local3014 sesiune3354. Răspunde503 normal
   cât timp rulează recalcularea (health200). Nicio expunere publică a copiei.
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
   guarded în rehearse.py), dar NEEXECUTAT și încă necomis în al doilea lot. Un test
   PostgreSQL cu rollback pentru control/revision/boundary a trecut. Mai trebuie
   verificarea finală și raportul autentic release-validation.json al copiei; nu
   fabrica markerul. Nu aplica ad-hoc aliases.sql pe live.
4. Commit/deploy compatibil, apoi reparație live numai după validarea copiei.
   Nicio corecție a achizițiilor în baza locală de lucru sau live încă.
   Migrarea0046 este aplicată pe local normal, cu redirects GOL.
