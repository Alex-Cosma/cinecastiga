# Pachetul local pentru stick — 30 septembrie 2026

**Pachet complet și verificat.** Pachetul include codul și documentația din momentul împachetării; `PACKAGE-SHA256SUMS` verifică întregul dosar după transfer.

- Director: `infra/prod/dumps/handover-local-20260930`, lângă pachetul precedent, păstrat separat.
- Arhivă: `database.dump`, **9,411,824,015 bytes** (9,41 GB / 8,77 GiB).
- SHA-256: `ace1825d9428197d0678b46bc4dd1ba3705ae07b3152b36d85feb2ce3ea26bef`.
- Export: 30 septembrie2026, 20:35:16–20:48:58, Europe/Bucharest.
- Sursă: baza **LOCALĂ** `seap`, PostgreSQL16.13, 68.780.874.775 bytes fizici înaintea exportului (aproximativ64GiB), **46 migrări**.
- Cod la pornirea exportului: `43c0d4a`. Snapshotul de cod include și corecția de deploy `f474c3e`; hashul exact și documentele de lucru sunt consemnate în `source-manifest.json`.
- Checkpoint local: baseline/version1, ready, 19 septembrie2026. Copia locală nu a fost recalculată pentru calendarul `rf-2026.6`; exportul nu schimbă datele sau proveniența publicării.
- Sunt incluse toate datele publice din această copie, inclusiv documente/PDF/OCR. Fără conturi, sesiuni, 2FA, feedback privat, anchete, urmăriri sau cozi active. Colegul creează un cont local nou.

Snapshotul de cod conține 1.414 fișiere; toate cele 26 de checksumuri din PACKAGE-SHA256SUMS au fost verificate după împachetare. Arhiva de cod a fost inspectată: fără medii private, dumpuri, chei PEM, `.git` sau `node_modules`. Pachetul pe disc păstrează documentația datată la împachetare; notele ulterioare din repository nu îi modifică checksumurile.

## Verificări ale arhivei noi

- `pg_dump` complet, fără erori; catalogul verificat pentru lipsa datelor `auth.*` și a tuturor tabelelor private din `app`, inclusiv feedbackul nou.
- SHA-256 calculat pe întregul fișier.
- Citire și decomprimare **integrală** cu pg_restore16, fără erori.
- Structura arhivei restaurată într-o bază temporară nouă; restore selectiv verificat: **46 migrări și9.454coduriCPV**, zero utilizatori/feedback/requesturi. Baza temporară și fișierul auxiliar au fost eliminate.
- [Raportul verificării](transfer-artifact-verification-20260930.json). **Nu s-a făcut un al doilea restore integral al celor64GiB**; aceste verificări nu sunt prezentate ca restore complet sau benchmark al lui.
- Fără cereri SEAP, recalculări sau modificări asupra bazei locale originale.

## Cod, handover și producție

Pachetul conține `source.tar.gz`, `source-manifest.json`, `CITESTE-MA.md`, `docs/handover/`, `scripts/handover/` și `PACKAGE-SHA256SUMS`. Niciun `.env`, secret, dump în arhiva codului sau dependență instalată.

**Starea producției la împachetare:** commitul43c0d4a și migrațiile au fost deploy-ate, iar recalcularea completă pentru noul calendar este încă în curs sub mentenanță. Corecția Caddy este aplicată live și comisă local înf474c3e, urmând push/deploy după eliberarea lockului. Acesta este un snapshot datat al informațiilor, nu un status live: pentru încheierea operațiunii consultă ultima versiune de pe main a `docs/implementation/release-20260930.md`. Nu relansa procedurile one-off din arhiva de cod.

După verificarea noului pachet, proprietarul poate șterge `handover-local-20260928` dacă nu mai dorește copia istorică. Agentul nu a șters-o. Nu s-a copiat pe USB și nu s-a formatat niciun dispozitiv.

---

## Arhiva precedentă, păstrată ca istoric


# Pachetul local pentru stick — 28 septembrie 2026

**Export complet, verificat și gata pentru dosarul de transfer.**

- Director: `infra/prod/dumps/handover-local-20260928`.
- Arhivă: `database.dump`, **8,107,262,999 bytes** (8,11 GB zecimali / 7,55 GiB).
- Sursă: baza **locală** `seap`, PostgreSQL 16.13, aproximativ 57 GiB fizic înaintea exportului.
- Export: 28 septembrie 2026, 11:47:47–11:59:14, Europe/Bucharest.
- Cod de bază: `b857e517d6e37dd01aeac539cb88995641d39967`. Snapshot-ul USB a fost creat înaintea commitului acestui handover și include documentația/utilitarele de atunci. La cererea ulterioară a proprietarului, handover-ul și `AGENTS.md` sunt acum versionate în repository; pentru versiunea actuală folosește un clone Git. Arhiva USB rămâne un artefact datat, cu hash-urile sale originale.
- Checkpoint înregistrat: baseline/version 1, ready, 19 septembrie 2026. Nu este checkpoint-ul 5 publicat ulterior în producție.
- SHA-256: `2d9a9c0bcda5ee30e536b855f3a86ec4ad1b591c305e19cf55e30780d4b0142b`.

Pachetul final include și `source.tar.gz`, `source-manifest.json`, `CITESTE-MA.md`, documentația, scripturile și `PACKAGE-SHA-256SUMS`. Nu include `.git`, `node_modules`, medii/configurații private sau datele utilizatorilor aplicației. Alege un stick cu cel puțin 9 GB liberi; un stick 16 GB exFAT gol este suficient. Nu s-a detectat/copiat/formatat niciun stick în această operațiune.

## Verificări efectuate

- Export `pg_dump` complet, fără erori; catalogul verificat pentru excluderea datelor auth/private app.
- SHA-256generat din întregul fișier.
- **Citire/decompresie integrală** a arhivei cu pg_restore 16, output către `/dev/null`, exit 0.
- Restaurarea structurii din arhiva reală într-o bază nouă izolată.
- Restaurarea selectivă a datelor reale: 39 migrații, 9454 coduri CPV, 1 anunț, 9 fișiere în catalog,2 descărcate/procesate, 28 pagini, 3 bloburi. SHA-256 al fiecărui blob corespunde identității stocate.
- Zero utilizatori și zero requesturi în baza de verificare. Testul sintetic anterior a demonstrat explicit eliminarea rândurilor private prezente în sursă.
- Refuz la nume DB obișnuit `seap`, bază destinație existentă și arhivă coruptă.
- Nu s-au făcut cereri SEAP, recalculări de statistici sau migrații pe baza originală.

**Limita verificării:** nu s-a restaurat încă o a doua copie integrală a tuturor celor 57 GiB de date pe acest Mac. Citirea întregii arhive și restore-urile de structură/date selectate au trecut; acestea nu sunt prezentate ca benchmark de restore integral. Colegul va rula restore-ul complet într-o bază nouă, iar scriptul oprește la eroare și verifică tabelele private/controlul local după import.

Vezi `transfer-procedure-verification.json` și `transfer-artifact-verification.json`. Bazele temporare și copia dump-ului din container folosite la verificare au fost curățate după verificare; baza originală și arhiva de transfer rămân.

## Exportul de producție

Exportul început înainte de schimbarea cerinței se terminase. La solicitarea explicită a proprietarului, au fost eliminate directorul `/srv/seap/backups/handover-public-20260928`, logul și scriptul auxiliar. Procesul era deja încheiat. Backup-urile operaționale și colectarea nu au fost afectate; nu se păstrează o copie inutilă pe server.
