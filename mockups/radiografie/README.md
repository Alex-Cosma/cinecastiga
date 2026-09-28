# Radiografie CNAIR — două variante de comparat

Mockupuri funcționale separate, pe date publice reale din copia locală din **28 septembrie 2026**, pentru CNAIR (entitatea `2146146`). Utilizatorul a ales **varianta B**. Varianta B, inclusiv zoomul și achizițiile directe compacte, este acum implementată local în aplicație. Vezi [documentația implementării](../../docs/implementation/radiografie-b-implementation.md); acest director păstrează mockupurile de comparație și snapshotul lor.

- **[A — Pornești de la o pistă](http://127.0.0.1:3112/radiografie/a/):** observație, context, limite și surse exacte. VALURO: șapte achiziții directe, 532.200 lei, în aceeași zi; OYL: șase proceduri, 30 de contracte, aproximativ 200,9 milioane lei; ESTA: cotă estimată de o treime dintr-un contract de aproximativ 869,2 milioane lei, comparată cu cifra de afaceri din 2023.
- **[B — Explorezi vizual](http://127.0.0.1:3112/radiografie/b/):** trei perspective — furnizori, loturi și achiziții directe. Selecție de 150 de furnizori, 12 afișați inițial; 37 de familii CPV, opt proceduri pe pagină în matrice; șapte grupuri de achiziții directe. Selecția păstrează legătura cu detaliile și sursele.

## Pornire

Serverul local de mockupuri folosește portul 3112. Dacă este oprit, din rădăcina repository-ului:

```sh
python3 -m http.server 3112 --bind 127.0.0.1 --directory mockups
```

Deschide [selectorul](http://127.0.0.1:3112/radiografie/) sau direct A/B. Modulele JavaScript necesită HTTP; `file://` nu este suportat. Fonturile sunt locale. Linkurile către sursele din aplicație se deschid în tab nou și necesită aplicația locală la `http://localhost:3000`. Linkurile SEAP sunt referințe externe; nu au fost accesate pentru această verificare.

## Trasee de comparat

1. În A, deschide cele șapte surse VALURO sau o bară individuală; verifică titlurile originale, datele, CPV, valorile exacte și referințele sursei. Explorează apoi contractele OYL și explicația cotei ESTA.
2. În B, caută un furnizor, schimbă numărul afișat și selectează un punct sau un rând. Graficul are zoom 1–12×: +/− urmăresc furnizorul selectat, Ctrl/⌘ + scroll mărește în jurul cursorului, tragerea deplasează vizualizarea, iar „Resetează” revine la ansamblu. Cu focus pe grafic, tastele +/−, săgețile și 0 oferă aceleași acțiuni. Axele se recalculează; cercurile își păstrează dimensiunea. Căutarea și schimbarea limitei resetează zoomul. Pe mobil, lista înlocuiește graficul furnizorilor, iar selecția duce la detalii.
3. În „Loturi”, schimbă domeniul și perioada, paginează și selectează o celulă pentru contractele exacte. Asocierile apar împreună; matricea păstrează etichetele furnizorilor la derularea orizontală.
4. În „Achiziții directe”, alege grupul din selectorul compact, compară intervalul detectat cu istoricul și deschide sursele. Încearcă ambele teme și navigarea din tastatură.

## Date și limite

`data.js` conține aproximativ 4 MB de date publice: rezultatul `getRadiografie('2146146')`, șapte selecții `readRadiografieEvidence` pentru grupurile de achiziții directe, înregistrări și totaluri exacte, titluri din arhiva brută și 8.589 de identificatori de contracte cu referințe externe și titluri. Snapshot-ul local nu certifică integralitatea sau actualitatea colectării din producție.

Valorile contractelor nu reprezintă plăți. Cotele asocierilor pot fi estimate; comparația ESTA nu stabilește participația reală ori capacitatea de execuție. Grupările apropiate în timp și câștigarea repetată a loturilor sunt piste de verificare, nu dovezi de încălcare a legii. În matrice, contractele distincte dintr-un anunț reprezintă loturile.

Doar tema persistă în `localStorage`. Mockupul nu salvează anchete și nu conține conturi, sesiuni sau date private. Construirea și verificarea lui nu au făcut cereri SEAP, ingestie, scrieri în baza de date sau modificări ale aplicației. Fără commit, push ori deploy pentru acest mockup.

## Verificare locală

Verificare în browser la 1440 și 390 px, în temele luminoasă și întunecată: fără erori JavaScript sau overflow al paginii; coloane de 96 px în matricea mobilă. Au fost verificate totalurile și numărul exact de surse pentru toate cele șapte grupuri, cele șapte surse VALURO / 532.200 lei, o sursă ESTA, 30 de contracte OYL, selecția furnizorilor din tastatură și o celulă cu două surse.

Au mai fost verificate căutarea fără rezultate și resetarea, afișarea tuturor celor 150 de furnizori, paginarea matricei cu 125 de proceduri, schimbarea CPV și comutarea istoricului achizițiilor directe. Acestea sunt verificări ale mockupului local, nu teste backend sau de producție.

[Review-ul independent](../../.impeccable/review/radiografie-mock/review.md) are verdict **ship pentru comparația locală**, cu două observații neblocante pentru B pe mobil: eticheta procentelor din lista furnizorilor și distanța dintre comparație și panoul de detalii. Capturile sunt în același dosar de review. `PRODUCT.md`, `DESIGN.md` și `.impeccable/design.json` rămân canonul existent, nemodificat.

## Ajustarea variantei B

Șirul de șapte butoane a devenit un selector. Totalul, plafonul și tipul apar într-un rând compact, graficul are 220 unități înălțime, iar sursele sunt imediat sub el. Secțiunea desktop măsoară circa 506 px; graficul mobil încape în lățimea disponibilă. Procentul din lista mobilă de furnizori are acum explicație.

Verificări suplimentare: zoom, deplasare, resetare, tastatură, Ctrl-wheel, resetarea zoomului la căutare, toate cele șapte selecții și sursele lor, comutarea istoricului, desktop/mobil și teme. Fără erori JavaScript sau overflow. [Review de ajustare](../../.impeccable/review/radiografie-b-refine/review.md): `ship` la scopul mockupului, efectuat în același fir deoarece limita de agenți a blocat atât pornirea unui reviewer nou, cât și continuarea celui independent. Nu constituie un nou review independent.
