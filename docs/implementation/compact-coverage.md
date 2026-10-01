# Acoperirea datelor, la cerere — 1 octombrie 2026

Implementare locală după auditul vizitatorului sceptic. Proprietarul a cerut explicit să nu încărcăm paginile cu text. Identitatea și întrebările existente sunt păstrate.

## Comportament

- Homepage: un rând închis implicit, „Ce date includ aceste cifre?”, imediat sub totaluri. Pe desktop ocupă spațiul de separare existent. Explicația lungă de la finalul paginii este mutată în interior; creditul hărții rămâne vizibil.
- Explorează: „Datele și calculul” înlocuiește disclosure-ul „Cum s-a calculat”, fără încă un bloc vizibil. Păstrează explicația calculului, SQL-ul avansat și accesul la metodologie. Se leagă de întrebarea aplicată, nu de filtrele încă editate; la altă întrebare se închide/resetază.
- La deschidere: intervalele observate pentru sursele relevante. Homepage arată DA, contracte și TED, cu TED explicit separat de totaluri. Întrebările mixte includ DA și contracte; profilurile istorice de risc includ doar DA. Inventarul este global și nu certifică acoperirea instituției sau a perioadei filtrate.
- Nu se inferă completitudinea din prima/ultima dată, nu se afișează procente și nu se etichetează automat anii fără înregistrări drept goluri de colectare. Perioada absentă este „neconfirmată”.
- Publicarea datelor și recalcularea riscului folosesc checkpointul coordonat validat, nu ultima cerere de colectare. Timestampurile sunt afișate în Europe/Bucharest; zilele sursei nu sunt deplasate de fusul browserului. Baseline-ul local fără publicare coordonată rămâne explicit neconfirmat.

## Citire și performanță

`CoverageDisclosure` folosește un `<details>` nativ, accesibil din tastatură, fără modal sau animație suplimentară. `GET /api/data-coverage` este public și returnează doar perioadele/inventarierea surselor și datele publicării/recalculării; nu expune jurnale sau diagnostice ale colectorului.

Fetch-ul pornește numai la deschidere. Nu blochează homepage-ul, builderul sau răspunsul întrebării. Loading explicit, eroare cu reîncercare manuală, timeout client de 15 secunde, anulare la închidere/unmount; datele primite se reutilizează la redeschiderea aceleiași componente. Se folosesc citirile și cache-urile existente ale inventarului/publicării. Nu există migrații, recalculări sau cereri către SEAP/TED.

Deschiderea nativă înaintea hidratării React este preluată la montarea componentei. În verificarea inițială, activarea imediată din tastatură putea lăsa loadingul fără fetch; sincronizarea stării cu elementul `<details>` a rezolvat cazul, confirmat în verificarea finală.

## Verificări

- 45 teste trecute: 38 ale întrebărilor și 7 noi pentru sursele efective, calendarul RO, inventarul necunoscut și limita datelor expuse de endpoint. Cele 7 noi au fost rulate din nou după redenumirea endpointului.
- TypeScript trecut; build web optimizat separat trecut. Tipul generat pentru ruta temporară `/api/coverage` a fost eliminat după redenumire. Build-ul temporar și include-urile sale au fost curățate; dev3000 rămâne pornit.
- Detector Impeccable: zero constatări pe componentele/stilurile schimbate.
- Browser Chrome local: **22 verificări trecute**, homepage și răspuns DA real (Municipiul Buzău, iulie 2026, 4 înregistrări / 588.500 lei), desktop 1440, mobil 390 și 320, light/dark. Închis implicit, maximum 44px pentru rândul de pe homepage, zero cereri de acoperire până la deschidere, tastatură, surse relevante, SQL păstrat, loading/eroare/retry și inventar necunoscut verificate. Erorile și inventarul absent au fost simulate prin interceptare HTTP, fără mutații DB. Zero erori JS sau trafic SEAP/TED; fără overflow orizontal. Capturi și rezultat în `/tmp/seap-coverage-20261001/`; harness local `/tmp/seap-coverage-browser.mjs`. Revizia finală a trecut TypeScript după fixul de hidratare.

Modificările sunt locale; nu s-a făcut commit/push/deploy pentru acest lot. Citarea durabilă, corectarea metricii linkurilor homepage și promisiunea butonului „citează” din metodologie rămân separate.
