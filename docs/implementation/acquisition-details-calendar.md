# Detalii de achiziții și calendar — 29 septembrie 2026

Stare: **implementat și verificat local**, branch `fix/acquisition-details-dates`. Fără commit/push/deploy și fără reprocesarea arhivei locale sau de producție. Utilizatorul a aprobat prima intervenție din [audit](../reviews/reddit-skeptic-20260929/report.md): detalii și date, cu identitatea vizuală păstrată.

## Pagini de detaliu

- `/achizitii/[id]` păstrează obiectul, codul DA, starea, CPV-ul (denumire și cod), instituția/furnizorul, publicarea/finalizarea în ora României, valoarea estimată și de închidere.
- Fără document brut/titlu gol, denumirea CPV devine titlu, cu mențiunea explicită că este categoria și că titlul original nu este disponibil. Lipsa CPV/titlului lasă codul; necunoscutul nu devine zero.
- Valorile sunt șiruri zecimale PostgreSQL, formatate fără conversie în `Number` și fără rotunjire. Câmpurile normale nu depind de existența documentului brut.
- Legătura oficială SEAP este lângă titlu. Navigarea la instituție și salvarea în anchetă păstrează fluxurile existente. Nu există funcționalitate nouă de colectare; fișierele achizițiilor directe rămân declarate indisponibile.
- Contractele afișează valoarea exactă și cotele exacte, cu eticheta „cotă estimată” pentru asocieri. Cotele însumate reproduc totalul inclusiv restul rotunjirii la ultimul membru. Nu s-au modificat alocările.
- CPV-ul contractului folosește categoria anunțului dacă înregistrarea contractului nu o are, la fel ca proiecțiile existente; proveniența este etichetată „din anunț”.
- Căutarea/drawer-ul identifică explicit data drept semnare sau finalizare. Data calendaristică deja normalizată nu mai este reinterpretată prin fusul orar al browserului.

## Cauza diferenței de o zi

Confirmat în copia locală, pentru aceleași două exemple observate live în audit:

| Contract SEAP | Instant în core, UTC | Zi în România | Zi în proiecția veche |
| --- | --- | --- | --- |
| 106652551 | 2025-07-15 21:00:00+00 | 16.07.2025 | 15.07.2025 |
| 107706970 | 2026-05-21 21:00:00+00 | 22.05.2026 | 21.05.2026 |

Builder-ele foloseau `to_char(timestamptz, ...)` și `extract(year ...)` în fusul implicit UTC, iar detaliul folosea Europe/Bucharest. Un plus de o zi aplicat în UI ar fi greșit iarna/vara și pentru celelalte ore. Schimbarea afectează și apartenența la un an/lună, deci nu este doar formatare.

## Corecția calendarului

- Builder-ele pentru statistici, tranzacții, risc, Radiografie, inventar folosesc `SET LOCAL TIME ZONE 'Europe/Bucharest'` în tranzacțiile proprii. Setarea nu schimbă fusul global al serverului sau al sesiunilor după commit.
- Proiecția TED și citirile directe ale datelor sursă folosesc conversie explicită. Căutarea de subiecte moștenește datele și anii proiecțiilor refăcute; **indexul trebuie refăcut după ele**.
- Datele folosite pentru plafoanele legale erau deja în calendarul României; definițiile plafoanelor nu sunt schimbate. Limitele din registrul pragurilor rămân date civile codificate UTC, ca înainte.
- Datele `core`, fișierele brute și dovezile deja înghețate în anchete nu sunt rescrise. Numai calculele și capturile noi folosesc regula uniformă.
- Metodologia riscului este `rf-2026.6`, iar refresh-ul consemnează `procurementCalendar: Europe/Bucharest-v1`. Schimbarea perioadelor poate afecta semnalele anuale; o actualizare zilnică refuză să combine noul calendar cu baseline-ul `rf-2026.5`.

## Publicare: necesită o reprocesare completă controlată

**Nu trata acest branch ca un deploy exclusiv UI.** Un push pe main poate declanșa deploy automat. Codul nou nu repară retroactiv textele de dată existente în marts sau în index. În special, listele din copia locală existentă încă păstrează datele vechi până la refacere; testele de mai jos validează proiecțiile noi pe baze izolate.

Pentru publicare se folosește procedura existentă de mentenanță, oprire coordonată a lucrului și backup verificat, apoi procesarea completă (`scope: full`) cu codul nou, inclusiv risc, statistici, Radiografie, inventar și indexul de căutare. Se verifică cele două contracte din tabel și un caz la trecerea dintre ani înainte de redeschidere. Nu se rulează numai `index-topics --if-missing`: un index existent ar păstra zilele vechi.

Este necesară **o singură actualizare completă de tranziție**, nu schimbarea programului agreat: ulterior date/statistici zilnic, risc duminică la 05:00. Dacă s-ar face doar deploy și s-ar aștepta următoarea procesare zilnică, aceasta ar refuza baseline-ul vechi și ar păstra mentenanța la eroare. Planifică tranziția înainte de push/deploy. În această intervenție nu s-a pornit nicio procesare pe server sau asupra arhivei locale.

## Verificări

- **67 teste web țintite trecute**, incluzând SQL PostgreSQL pentru achiziții fără brut, titluri goale, zecimale exacte, contracte/CPV moștenit și surse de semnale. Prima rulare avea 10 teste SQL de surse sărite; au fost apoi rulate explicit cu `SEAP_READONLY_TESTS=1`, toate trecute.
- **93 teste unitare ingestion trecute** și **13 integrări PostgreSQL trecute**: 4 marts (inclusiv două fusuri de sesiune), 3 praguri/competiție, 5 gate de procesare și 1 tranzacții zilnice.
- Verificări reale pentru date de iarnă și vară și trecerea 31 decembrie/1 ianuarie: ziua, anul agregării și intervalul în minute rămân corecte. UTC și America/Los_Angeles produc aceleași date românești.
- Gate-ul refuză baseline-ul vechi înainte de normalizare; o rulare completă permite ulterior regimul zilnic fără risc recalculat zilnic.
- TypeScript web/ingestion și build de producție web trecute. Build-ul a folosit `.next-details-check`, fără a opri dev 3000; directorul și include-urile temporare au fost eliminate.
- Browser local desktop 1440 și mobil 390, teme light/dark: achiziție cu titlu, achiziție fără brut, contract cu 3 membri. HTTP 200, fără erori JS, fără depășirea lățimii. Legăturile externe SEAP/TED au fost blocate în harness; nicio descărcare de sursă.
- Capturi și extrase: `.impeccable/review/acquisition-details-20260929/`. Probele vizuale sunt pe arhiva locală existentă; probele de reconstruire a calendarului sunt pe fixtures izolate, nu pe arhiva completă.
- Bazele `seap_test_detail_calendar` și `seap_test_processing` au fost create numai pentru testare, fără date private copiate, apoi eliminate. Nu s-a modificat baza principală prin testele de scriere.

Pentru verificare manuală locală: `/achizitii/121325235` (copia locală are titlul brut, spre deosebire de proba live), `/achizitii/100219597` (fără titlu arhivat), `/contracte/106652551` (valoare exactă, cote estimate, CPV din anunț).
