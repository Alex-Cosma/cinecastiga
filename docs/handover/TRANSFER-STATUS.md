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
