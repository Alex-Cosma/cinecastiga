# Transfer complet al datelor publice

## Exportul curent

La cererea din 30 septembrie, s-a exportat și verificat un snapshot LOCAL nou în `infra/prod/dumps/handover-local-20260930`, fără a suprascrie pachetul anterior. Starea efectivă, hashurile și verificările sunt în [TRANSFER-STATUS.md](TRANSFER-STATUS.md). Folosește acest pachet nou după verificarea checksumurilor; observațiile datate 28 septembrie de mai jos sunt istorice. Codul recent și schema cu 46 migrări intră în noul handover, însă exportul nu reprocesează calendarul/marts locale.

## Alegerea făcută

Proprietarul a confirmat: **bază completă, date publice și cont local nou**. **Decizia finală: sursa este baza LOCALĂ a autorului, iar mediul de transfer este un stick USB.** Aceasta are arhiva brută mai mare și documentele pilotului. Snapshot-ul nu este prezentat drept ultima publicare din producție. Nu copiem volumul Docker și nu distribuim un backup privat integral.

Dimensiuni istorice la 28 septembrie 2026, 11:32 RO (nu descriu noul pachet din 30 septembrie):

| Sursă | Dimensiune PostgreSQL observată |
|---|---:|
| Producție |37 GB|
| Localul autorului |57 GB|

Producția: marts 17 GB, core 13 GB, reference aproximativ 2,4 GB, raw aproximativ 2,3 GB; include și o copie temporară TED de 2,2 GB care nu intră în bundle. Localul vechi are raw 23 GB. Dimensiunile includ indexuri/stocare fizică și sunt rotunjite; **nu sunt dimensiuni ale fișierului comprimat** și nici dovada echivalenței bazelor.

„Complet” se referă la toate rândurile publice din snapshot-ul LOCAL, nu la reunirea a două arhive divergente. Pachetul din **30 septembrie** are 46 migrări, baza sursă de aproximativ 64 GiB și dump de 9.411.824.015 bytes. Păstrează checkpoint-ul local baseline/ready v1 din 19 septembrie și documentele publice ale pilotului; nu a reprocesat calendarul. Ultima publicare de producție verificată în 30 septembrie are checkpoint 8 și calendar `rf-2026.6`. Acestea nu certifică aceeași populație sau actualitate. Nu se suprascrie producția cu baza locală și nu se schimbă data publicării doar pentru că exportul este nou.

## Ce intră și ce nu

**Incluse:**

- Întreaga structură a schemelor aplicației, extensii, constrângeri, secvențe și indexuri.
- Toate datele din `raw`, `core`, `marts`, `reference` și istoricul `drizzle`.
- Din `app`: `document_notices`, `procurement_documents`, `document_blobs`, `document_pages`, `monitoring_refreshes`.
- Astfel se păstrează originalele/PDF-urile, OCR-ul, relațiile și proveniența publicării analitice.

**Fără rânduri:** `auth.*` și orice tabel `app` care nu este în lista explicită de mai sus. Prin urmare nu se transmit conturi, hash-uri de parole, sesiuni, 2FA, emailuri de utilizatori, anchete/note/citate private, invitații, rețete, urmăriri, digest-uri, audit admin, joburi, cereri și control activ.

**Scheme excluse:** `graphile_worker`, `repair_*`. Scriptul refuză scheme noi necunoscute, large objects neinventariate și tabele partiționate/materializate neașteptate în app. Documentele sunt `bytea`, nu PostgreSQL large objects.

Datele publice pot conține nume/reprezentanți/contacte publicate de sursele oficiale. „Fără datele private ale aplicației” nu înseamnă „anonimizare a tuturor persoanelor din achiziții”. Fișierele de configurare, cheile SSH, SMTP și secretele de autentificare nu sunt în acest bundle.

## Export — metodă și impact

`export-public.py` folosește un singur `pg_dump` custom/comprimat, cu tranzacții read-only. Același snapshot logic include toate tabelele; colectarea poate continua să adauge răspunsuri brute. Arhiva nu include rândurile adăugate după snapshot. Un export consecvent nu echivalează cu o republicare a acelor rânduri în marts.

Pe producție scriptul ia `.git/deploy.lock`, refuză mentenanța sau o publicare analitică în curs și nu permite deploy/scheduler simultan. Nu setează pauză și nu trimite cereri SEAP. Folosim un singur proces de dump și compresie moderată pentru a limita competiția de CPU/I/O; tot există trafic de citire și o tranzacție lungă. Exportul se programează departe de 05:00, iar lock-ul se eliberează la terminare/eroare.

Comanda aleasă, pe calculatorul autorului, din rădăcina repository-ului:

```sh
python3 scripts/handover/export-public.py \
  --container seap-postgres-1 \
  --checkout "$PWD" \
  --source-label cinecastiga-local-20260930 \
  --output infra/prod/dumps/handover-local-20260930
```

Colectarea locală era deja oprită și procesarea automată dezactivată. Exportul nu modifică acele setări. Varianta de producție fusese exportată înaintea schimbării cerinței. La cererea proprietarului, arhiva de 4,75 GB și fișierele auxiliare ale acelui export au fost șterse de pe server după confirmarea terminării procesului. Nu este păstrată și nu este pachetul pentru stick. Backup-urile operaționale obișnuite nu au fost afectate.

Directorul trebuie să fie nou. O execuție eșuată nu se confundă cu una completă. Nu șterge directorul în care încă rulează exportul și nu îl porni din nou pe aceeași destinație.

Bundle final:

| Fișier | Rol |
|---|---|
| `database.dump` | Arhivă PostgreSQL custom, comprimată |
| `manifest.json` | Sursă, commit, ore, versiune PG, migrații, checkpoint, excluderi, bytes și SHA-256 |
| `SHA256SUMS` | Hash ușor de verificat înainte/după transfer |
| `archive.list` | Catalog pg_restore; verificat fără TABLE DATA private |
| `export.log` | Diagnostice de export |
| `source.tar.gz`, `source-manifest.json` | Snapshot al codului și proveniența lui, fără secrete |
| `CITESTE-MA.md`, `docs/handover/`, `scripts/handover/` | Instrucțiuni, context și unelte pentru coleg |
| `PACKAGE-SHA256SUMS` | Verificarea tuturor fișierelor din pachet |

`database.dump.partial` sau `manifest.partial.json` indică o execuție incompletă/nevalidată. Prezența unui fișier `.dump` singur nu certifică succesul: trebuie și manifest final/hash.

Documentație tehnică primară: [pg_dump 16](https://www.postgresql.org/docs/16/app-pgdump.html) explică snapshot-ul și formatele de arhivă; [pg_restore 16](https://www.postgresql.org/docs/16/app-pgrestore.html) documentează restaurarea selectivă, paralelă și fără ownership/ACL. Dump-ul logic este portabil între platformele de dezvoltare compatibile; folosește PostgreSQL 16 pentru reproducibilitate.

## Transfer efectiv

După ce există manifestul final, copiază **întregul director** `infra/prod/dumps/handover-local-20260930` pe stick, împreună cu documentația și scripturile de restaurare. Finder este suficient. Din terminal, numai după ce ai identificat volumul corect:

```sh
rsync -av --partial --progress \
  infra/prod/dumps/handover-local-20260930/ \
  "/Volumes/NUMELE_STICKULUI/handover-local-20260930/"
```

Înlocuiește numele volumului; nu executa exemplul literal. Nu formata un stick care conține date pentru această operațiune. **exFAT** este alegerea practică pentru un singur dump mai mare de 4 GB și compatibilitate Mac/Windows/Linux. Dacă stick-ul este FAT32 și nu poate fi schimbat, împarte dump-ul în bucăți sub 4 GB, copiază-le și reconstituie fișierul pe discul colegului înainte de verificarea SHA-256/restore. Nu încerca restore direct din bucăți.

Directorul sursă este ignorat de Git. Nu copia `.env`, chei SSH, `node_modules`, volume Docker sau backup-urile private. Pentru repository colegul folosește propriul acces GitHub; dosarul `docs/handover` și `scripts/handover` trebuie să fie prezente în checkout-ul lui sau copiate separat din pachet. Hash-ul de cod din manifest este punctul de plecare.

Pe un stick oferit unei persoane de încredere, dump-ul public este suficient. Dacă stick-ul poate fi pierdut ori pachetul trece prin cloud, se poate folosi criptare cu cheia transmisă separat. Nu s-a trimis automat nimănui și nu s-a formatat niciun dispozitiv.

Arhiva este deja comprimată; o a doua compresie ZIP nu este necesară. Pentru rețele instabile, `rsync --partial` poate relua transferul. Verifică SHA-256 după copiere, nu doar mărimea.

```sh
cd /cale/catre/bundle
shasum -a 256 -c SHA256SUMS
```

SHA-256 detectează coruperea accidentală dacă manifestul provine de la sursa de încredere; nu autentifică singur un emitent necunoscut. Restore-ul execută SQL-ul arhivei: acceptă numai pachetul pregătit și verificat pentru proiect.

## Restore și validare

Urmează [pornirea locală](03-development.md). Scriptul `scripts/handover/restore-local.py`:

1. Refuză un Docker endpoint remote și containerul care nu aparține proiectului local `seap`.
2. Acceptă doar nume `seap_collab[_suffix]` sau `seap_test_transfer_*`; refuză o bază existentă.
3. Verifică mărimea și SHA-256 din manifest.
4. Creează o bază din template 0 și restaurează cu `--no-owner --no-privileges --exit-on-error`,2 joburi implicit.
5. Introduce doar control local nou, oprit; verifică golirea tabelelor private/operaționale și numărul de migrații.
6. Rulează ANALYZE și șterge copia temporară a dump-ului din container. Baza nouă rămâne pentru diagnostic dacă restore-ul eșuează.

La un pachet schema-only de test, migrațiile au 0 rânduri; acesta nu este pachetul pentru coleg. Bundle-ul complet trebuie să păstreze istoria reală, pentru a evita reluarea migrațiilor peste obiecte deja existente.

După restaurarea completă: reindexează Meilisearch local, creează adminul nou, verifică întrebări/surse și documentele existente. Nu executa recalcularea completă doar pentru a porni frontend-ul; snapshot-ul conține deja marts.

## Verificări făcute pentru procedură

- Export și restore al întregii structuri din copia locală într-o bază nouă izolată.
- Fixture cu utilizator privat și cerere de colectare plus blob/document/pagină publică: după export/restore, users 0, requests 0, blobs 1, documents 1, pages 1.
- Restore-ul verifică toate tabelele private, nu doar cele două folosite în fixture.
- Validarea bundle-ului efectiv și dimensiunea finală sunt consemnate în [starea pachetului](TRANSFER-STATUS.md); nu deduce succesul exportului mare din testul mic.

## Actualizări ulterioare ale bazei colegului

Nu reimporta peste anchetele lui locale. Fă un snapshot nou într-o bază nouă (`seap_collab_YYYYMMDD`), verifică-l, apoi schimbă DSN-ul și reconstruiește indexul local. Transferul eventual al propriilor anchete locale este separat și trebuie să păstreze referințele/checkpoint-urile. Arhivele de onboarding nu sunt backup-uri private de producție și nu pot restaura conturile sau investigațiile live.
