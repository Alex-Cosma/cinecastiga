# DQ-03 + DQ-05 — ONRC / bilanțuri MF

Lot autorizat la 4 octombrie 2026. Branch `fix/reference-import-integrity`.
[Rezultate și verificări](VALIDATION.md).
Reparația a fost validată **local, pe copie izolată**. Ulterior, proprietarul a
autorizat aplicarea imediată în producție, cu mentenanță: [procedură și stare](PRODUCTION.md).
Nu relansa operațiunile DQ-01/DQ-02 deja încheiate în producție.

## Defecte și prevenție

- ONRC: `DD/MM/YYYY HH:mm:ss` devenea NULL, deși `DD/MM/YYYY` era recunoscut.
  Parserul comun acceptă ambele formate, validează calendarul și ora, fără
  conversie de fus orar. O dată lipsă rămâne lipsă. O dată calendaristic validă,
  dar foarte veche sau ulterioară snapshotului, rămâne un caz de verificat;
  nu inventăm o corecție. Identitatea păstrează nume normalizat + data nașterii
  + localitatea nașterii. Nu unim persoane doar după nume.
- MF: expresia `profitul?` nu recunoștea `Profit net`. Parserul comun recunoaște
  `Profit net` și `Profitul net`, folosind codul indicatorului din specificația
  categoriei/anului. Nu presupune I18 pentru toate categoriile. Indicatorii
  de profit/pierdere ambigui sau inexistenți în antet opresc importul;
  nu devin automat zero.
- Sumele MF sunt transmise ca zecimale exacte, fără trecere prin floating point.
  Zero este o valoare; NULL este lipsă. Profitul și pierderea rămân separate.
- Importul viitor ONRC înlocuiește snapshotul într-o singură tranzacție, după
  descărcarea fișierelor. Antet neașteptat, linie malformată, snapshot gol sau
  dată invalidă anulează importul și păstrează snapshotul anterior.
- Importul MF folosește fallbackul standard numai pentru UU/BL_BS_SL/IR, fără
  specificație și cu antetul complet `CUI,CAEN,I1,...,I20`. O specificație
  prezentă nu primește indicatori presupuşi suplimentari.

## Reparația datelor existente

`apps/ingestion/src/reference/repair.ts` lucrează exclusiv cu fișiere existente:

1. ONRC: citește snapshotul complet, rezolvă CUI din `reference.onrc_firm`, apoi
   compară **multisetul complet** cu datele stocate. Sunt acceptate doar două
   stări: proiecția parserului vechi sau proiecția corectată. Duplicatele sunt
   păstrate. O diferență suplimentară refuză operațiunea. Astfel nu actualizăm
   ambiguu mai multe persoane folosind nume/J-number fără identitate completă.
2. MF: fiecare fișier trebuie să corespundă exact categoriei, anului fiscal și
   versiunii (`source_vintage`) stocate. Se verifică celelalte câmpuri financiare
   și prezența fiecărei declarații în sursă. Profiturile nenule incompatibile
   opresc operațiunea. Se completează **doar profit_net NULL**, fără rânduri noi
   și fără suprascrierea altor câmpuri.
   Categoriile fără fișier/spec local sau fără un indicator explicit neambiguu
   sunt listate în `skipped` și rămân neschimbate; nu este folosit fallback în
   reparație. Prima simulare a refuzat o specificație istorică lipsă și a anulat
   tranzacția integral, înainte de adoptarea acestei raportări explicite.
3. CLI rulează ambele reparații în aceeași tranzacție. La eroare niciuna nu este
   aplicată. A doua rulare trebuie să raporteze zero modificări.
4. Raportul păstrează SHA-256 ale surselor, numărări și impact agregat, fără
   nume/date de naștere. Numărul cheilor comune între furnizori nu reprezintă
   automat numărul semnalelor de risc: regulile de cheltuieli/praguri nu sunt
   recalculate de acest script. ONRC rămâne un snapshot, nu istoric al mandatelor.

## Validare locală reproductibilă

Necesită Node22, pnpm9.4, PostgreSQL16 local și pachetele workspace construite.
Nu folosi CLI-urile online `import-onrc` / `import-financials` pentru această
simulare: ele descoperă sursele prin internet.

```sh
python3 scripts/operations/prepare-reference-simulation.py seap_test_references_20261004

DATABASE_URL=postgres://seap:seap_dev@localhost:5432/seap_test_references_20261004 \
  pnpm --filter ingestion exec tsx src/scripts/repair-references-local.ts \
  2026-07-08 \
  "$PWD/../seap-heartbeat/onrc/2026-07-08-od_reprezentanti_legali.csv" \
  "$PWD/../seap-heartbeat/financials" \
  "$PWD/docs/implementation/reference-import-integrity/local-result.json"
```

Pregătirea refuză o bază deja existentă. Copiază schema reală, istoricul
migrărilor și numai tabelele publice necesare (ONRC, MF, entități, profiluri).
Nu copiază conturi, sesiuni, anchete sau cozi. CLI refuză orice host nelocal sau
bază care nu începe cu `seap_test_references_`. Pentru verificarea rerulării se repetă
**doar CLI**, cu alt fișier de raport; nu se repetă pregătirea copiei.

Teste: `pnpm --filter ingestion test` și `pnpm --filter ingestion typecheck`.
Testele `src/reference/repair.integration.test.ts` necesită explicit o bază
locală **goală**, cu schema reală, numită `seap_test_references_guards`.
Fixture-urile se anulează prin rollback. Nu folosi copia mare pentru fixtures.

## Publicare ulterioară

Acest CLI are intenționat protecție care împiedică rularea pe baza aplicației.
Pentru publicare se pregătește o operațiune unică în mentenanță, cu backup,
aceleași verificări de sursă pe snapshotul efectiv din țintă și o singură
recalculare a semnalelor/radiografiei după repararea referințelor. Abia după
verificarea datelor derivate se publică noul checkpoint. Deploy-ul parserelor
singur **nu repară** referințele deja importate. Autorizarea ulterioară pentru aplicarea imediată și procedura de operare sunt
consemnate în [PRODUCTION.md](PRODUCTION.md).

DQ-04 este separat: lipsa răspunsurilor brute JSON din arhivă, nu dovada unor
PDF-uri inexistente în interfață. Nu este reparat de acest lot.

De auditat separat: anumite specificații ONG au două etichete care încep cu
`Venituri totale` (prevederi anuale / realizat la 31.12). Parserul anterior lua
prima. Acest lot păstrează maparea câmpurilor neatinse, iar reparația verifică
egalitatea lor înainte de completarea profitului. Există și etichete cu virgulă
în descriere (`VENITURI TOTALE, din care:;i21`) și coduri numerice fără `I` în
unele specificații bancare. Interpretarea acestor indicatori neatinși este o
verificare separată; lotul de față nu le schimbă maparea. Nu prezenta repararea
profitului drept validare a tuturor indicatorilor MF sau a tuturor categoriilor.
