# Checkpoint după publicare — 1 octombrie 2026, seara

Salvat la cererea proprietarului înainte de compactare. **Sarcina este încheiată.**
Nu există reparații, indexări, backupuri sau deployuri începute de agent care trebuie
reluate. Nu interpreta vechile note „running/pending” drept operațiuni active.
Starea serverului de mai jos este ultima verificare din această sesiune, nu o
observație nouă făcută la scrierea acestui checkpoint.

## Punctul de reluare

- Citește AGENTS.md, [handover](README.md) și [raportul final](../implementation/entity-identity-release-20261001.md).
- Branch local `main`; HEAD și origin/main: `58eaf06`, documentație `[skip ci]`.
- Codul final în producție: `c6763f3712e3005beda2cce4065f5050a7efbc2c`.
- GitHub Actions `36906296990`: CI și deploy reușite. Server checkout și codul
  compilat al corecției Meili confirmate. Publicarea principală anterioară:
  `663cc27`, Actions `36886537522`, de asemenea reușite.
- SSH `cinecastiga`, checkout `/srv/seap/src`, compose `infra/prod`.
- Nu sunt necesare alte intervenții în producție pentru a termina acest lot.
  Nu relansa scripturile one-off și nu deduce autorizație pentru următorul lot.

## Ce s-a reparat

Importatorul istoric interpreta prefixul fiscal CUI ca ID de participant SICAP.
Auditul arhivei BSON a coroborat CUI+nume cu dimensiunea originală; nu s-a făcut
unire aproximativă după nume. În producție:

- 4.231.642 de asocieri de achiziții directe corectate.
- 14.264 de aliasuri verificate; linkurile vechi redirecționează relativ cu307 și
  păstrează query params. Filtrele, întrebările, sursele și recapturile rezolvă
  identitatea canonică. Capturile private deja înghețate nu se rescriu.
- Conservarea rândurilor/sumelor/câmpurilor originale verificată înainte și după;
  toate proiecțiile refăcute, fără discrepanțe la verificarea finală.
- Cluj canonic2146445, CUI4305857; fragmentul2147251 redirecționează aici.
  Profilul2165580, CUI14920794, este fiscal distinct și rămâne separat.
- 231 de rânduri atribuite unei instituții reale greșite au fost corectate către
  institutul1986102; muzeul2130379 și ID-ul său SICAP real rămân păstrate.
- 34.323 de rânduri din arhivă,313 grupuri necoroborate, nu au fost forțate.
  Acestea nu sunt automat toate greșite. Nu pretinde că orice omonim a fost rezolvat.

## Starea finală verificată în producție

- 47 migrări autentice;0046 introduce mecanismul redirecturilor.
- Checkpoint11 `1b4d434e-7f8a-464f-959b-706940c397fe`, ready.
- Full pipeline1h52m21.939s;11 verificări complete trecute.
- Metodologie `rf-2026.6`, calendar `Europe/Bucharest-v1`.
- Căutare:20.588.242 înregistrări,180.979 documente de entități.
- Site redeschis21:18:46RO; mentenanță totală aproximativ2h31m08s, cu backup,
  corecție, recalculare, indexare și recuperarea descrisă mai jos.
- Control revision26,paused=false,maintenance=false,blocked_reason=null.
- Setarea operatorului40–60s păstrată; program05:00RO zilnic/risc duminică intact.
  Pauza02:59–03:30 și reîncercările5/10minute neschimbate. Niciun request manual
  SEAP/TED pentru reparație și nicio descărcare automată de PDF.
- Colectarea reluată:6350 primul request200 reușit;6357–6359 reușite după deploy.
- Web healthy, pagină publică/profil/health200, admin anonim403.
- 24 verificări reale publice în browser/API trecute; capturi inspectate vizual.
- 107 teste unitare ingestion și build trecute, inclusiv6 regresii noi Meili.
  Restul verificărilor de integrare/copie sunt în raportul implementării. Nu
  transforma cele148 teste DB sărite în suitele implicite în teste „trecute”.

## Incidentul Meili și recuperarea deja încheiată

Indexarea a produs toate documentele corecte, dar verificarea strictă a găsit
un task `indexCreation` eșuat cu `index_already_exists` (task191). Vechiul cod
chema createIndex chiar dacă indexul exista; catch-ul HTTP nu prinde eșecul
asincron. Copia izolată avea index nou și nu expusese această ramură.

Corecția verifică existența, creează doar pe index_not_found și verifică succesul
fiecărui task. `recover-search.mjs` a acceptat numai incidentul/checkpoint-ul exact,
a păstrat raportul inițial, a reindexat entitățile și a repetat verificările pentru
ambele indexuri/identități/limita înghețată. Fără repetarea full-ului. Recuperarea
a validat la21:17:46RO, apoi redeschiderea normală a reușit. Fixul permanent este
în c6763f3, deployat. Nu repeta recuperarea. Checkpoint10 failed este invalidarea
intenționată de dinaintea reparației, nu un full ulterior eșuat.

## Artefacte și medii păstrate

- Server privat `/srv/seap/backups/identity-live-20261001/`: backup6,6GB,
  checksum/listă, plan/probe, report.json validated, monitoring-validation.json,
  production-checks.json, validated/reopened, jurnale. Eroarea inițială:
  report-search-failure.json, search-diagnostic.json, failed-search-recovered.
- Copia completă privată: DB `seap_test_identity_full_20261001` și directorul
  `/srv/seap/backups/identity-repair-20261001/`, backup/probe păstrate. Conține
  date private app/auth: nu exporta către coleg și nu copia în Git/local.
- Containerele identity-preview-web/identity-preview-meili eliminate; tunelul
  local3014 închis. Dumpul redundant6,6GB din /tmp al containerului PostgreSQL
  eliminat doar după egalitatea SHA256 cu arhiva păstrată pe host.
- Checkoutul/imaginea preview pot rămâne pe server; nu sunt servicii active.
- Artefacte publice locale `/tmp/seap-identity-audit-20261001/`: audit verified-v2,
  jurnale, verify-preview.mjs, preview-checks.json, production-checks.json și
  capturi. Probele importante sunt și pe server; /tmp nu este arhivă permanentă.
- DB-uri locale separate: `seap_test_identity_repair_20261001` (copie parțială
  cu reparare/conservare/idempotence verificate), `seap_test_identity_pilot_20261001`
  (pilot Cluj), `seap_test_identity_import` (fixture destructiv). Nu utiliza
  fixture-urile pe baze reale și nu deduce aliasuri din copia parțială.
- Baza locală obișnuită `seap` are migrația0046, dar **datele nu sunt reparate**.
  Dumpul sigilat `handover-local-20260930` este tot nereparat. Migrația singură
  nu repară identități sau marts. Nu modifica dumpul sigilat pe loc.
- Dev local3000 și mock4185 au fost lăsate neatinse; verifică procesele înainte
  de utilizare. Nu opri serviciile utilizatorului pentru cleanup.

## Working tree și continuarea produsului

Au rămas modificări mai vechi, intenționat neatinse/neincluse în commiturile
reparației: `.impeccable/surfaces/signal-citation-mockup.md`,
`mockups/signal-citation/README.md`, părți din HANDOFF.md și
`docs/handover/06-status-and-roadmap.md`, fișierul de critică TopicSearch din
`.impeccable/critique/` și `docs/reviews/user-journeys-20261001/` necomis.
Nu reset/stash/drop și nu stage-all peste ele. La ultimele commituri au fost
incluse numai secțiunile noastre din fișierele comune, folosind patchuri în index.
Checkpointul de față și pointerele lui sunt salvate local la cererea de compactare;
nu s-a făcut alt deploy pentru această salvare.

Restul propunerilor din auditul celor5 parcursuri, încă neimplementate:

1. Intrarea în Anchete pentru vizitatorul fără cont: explicarea invitației și
   eventual solicitare de acces, numai după decizia proprietarului; nu signup liber.
2. Continuitatea căutare → constructor: nu converti tacit textul în CPV sau UAT
   în județ; transferă doar filtre echivalente ori etichetează întrebarea nouă.
3. Tabelul profilului: titlul real al contractului și CPV secundar; sume fără
   ellipsis,10 rânduri/pagină păstrate.
4. Copierea căutării vizibilă pe mobil; mai puțină redundanță pentru categoriile goale.

Identitatea vizuală rămâne. Proprietarul a abandonat explicit citarea publică
înghețată a SEMNALELOR: nu reintroduce acel backend/mockup ca prioritate. Preferă
anchete/date/interogări și accesul facil la înregistrările sursă. Următorul lot
se alege cu proprietarul; nu există unul început automat după această compactare.
