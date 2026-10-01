# Numărătorile homepage și instrucțiunile de citare — 1 octombrie 2026

Continuarea auditului Reddit, după commitul local `d51fb29` pentru acoperirea compactă. Proprietarul a cerut commit pentru acel lot și continuarea lucrului. Nu a cerut push/deploy.

- Cele două linkuri ale numărătorilor de pe homepage folosesc acum `measure: count`, pentru DA și pentru rândurile contract–furnizor. Linkul valorii totale păstrează `measure: value`.
- Verificarea reală a depistat că măsura `count` include implicit și DA peste 2 milioane lei, pe care homepage-ul le exclude. Linkul DA păstrează acum explicit limita prin selecția precisă existentă (`closing_value <= 2000000`). Filtrul rămâne vizibil/editabil și este respectat de surse/exporturi; semantica întrebărilor `count` existente nu se schimbă.
- Compilatorul recunoaște numai această selecție exactă pentru totalul național DA și folosește `v_plaf/n_plaf` din agregatul existent. Alt plafon, condiții suplimentare, contracte, filtru pe entitate sau minimum de înregistrări nu substituie populația cu acel agregat. Fără migrare sau reprocesare; nu introducem o scanare națională suplimentară la click.
- `/metodologie#citare` descrie acțiunea reală „Copiază întrebarea”: link cu filtrele aplicate. Nu mai promite butonul inexistent „citează” sau stabilitatea tuturor adreselor. Precizează pe scurt că linkul nu îngheață datele și că exportul surselor trebuie păstrat pentru cifrele citate. Rămâne distincția semnal/pistă versus dovadă de ilegalitate.
- Fără schimbări de layout, tabele, acces sau surse externe. Citarea durabilă a unui semnal după recalculare rămâne de proiectat separat; exportul CSV actual și capturile private nu sunt prezentate ca referințe publice stabile.

## Verificări

- 67 teste trecute: 38 ale builderului și 29 ale surselor/compilatorului, inclusiv 7 cazuri noi pentru limita explicită DA, concordanța cu sursele și refuzul agregatului pentru alte selecții. Nu s-au folosit fixtures în baza reală.
- TypeScript trecut după schimbarea compilatorului. Detectorul de design nu raportează constatări pe cele două pagini modificate.
- 15 verificări Chrome locale trecute: clickurile celor două numărători reproduc exact cifrele homepage-ului din baza reală; sursele și măsurile celor trei linkuri sunt corecte; instrucțiunile de citare și precizarea despre datele neînghețate sunt prezente. Desktop 1440 și mobil 390, fără overflow, erori JS sau cereri SEAP/TED. Capturi și raport în `/tmp/seap-reddit-small-fixes-20261001/`, harness `/tmp/seap-reddit-small-fixes.mjs`. Citirile nu modifică baza de date.

Aceste două corecții sunt locale și necomise; acoperirea precedentă este comisă. Niciun push/deploy în această continuare.

## Publicare cerută ulterior

La1octombrie, după realizarea mockupului de citare, proprietarul a cerut commit și push cu lucrul terminat. Aceste corecții sunt incluse în lot, împreună cu documentația și prototipul. CI/deploy se verifică separat; pushul nu reprezintă confirmarea deployului.
