# Ce bate la ochi — machetă editorială

Previzualizare locală: <http://127.0.0.1:3112/ce-bate-la-ochi/>. Machetă interactivă separată de aplicație, cu povești fictive aprobate explicit pentru explorarea designului. [Brief-ul](../../.impeccable/surfaces/ce-bate-la-ochi.md) fixează traseul hartă → județ → poveste ilustrată → surse.

## Traseu de încercat

1. Intrarea „Ce bate la ochi” apare după „Explorează”. Harta are 42 de unități administrative; culorile și numerele arată poveștile demonstrative, nu riscul sau corupția. Sunt 8 povești în 4 județe și București.
2. Alege Cluj pe hartă sau caută un județ, inclusiv fără diacritice. Deschide indexul editorial, filtrează după temă și intră în „Trei contracte. Același drum. Ce le leagă?”. În browsere compatibile, silueta județului și ilustrația participă la tranziție; reduced motion elimină tranzițiile.
3. Urmează capitolele și cronologia. Deschide o sursă din text, grafic sau dosar; cele trei valori însumează 320.000 lei. Închide dialogul pentru a continua lectura. Fișa primei surse se deschide într-un tab nou și arată 95.000 lei.
4. Încearcă sursa de presă demonstrativă, copierea linkului, Back/Forward, tema întunecată și un județ fără povești, precum Alba. Lipsa poveștilor nu este o concluzie despre județ.

## Adrese și fișiere

Adresele interne folosesc hash-uri: `#/`, `#/judet/cluj`, `#/poveste/acelasi-drum`. Fișa locală folosește `document.html?story=acelasi-drum&source=0`; indicii 0–2 sunt achizițiile fictive, 3 contextul de presă, 4 nota de documentare. Linkurile generale către Descoperă, Explorează, Anchete și metodologie deschid aplicația locală de pe portul 3000.

[index.html](index.html), [app.js](app.js) și [style.css](style.css) formează interfața; [data.js](data.js) conține poveștile, iar [document.html](document.html) afișează sursele demonstrative. Tema se păstrează local în browser; nu există cont sau salvare editorială.

## Identitate și proveniență

Se păstrează [designul existent](../../DESIGN.md): verde și fildeș, Bricolage/Plex, separatoare fine, detalii portocalii și temă întunecată. Compoziția editorială și tranzițiile sunt extensii ale acestui mockup. `DESIGN.md` și `.impeccable/design.json` rămân nemodificate.

SVG-urile drum/spital/rețea din [art.js](art.js) sunt extrase fără schimbarea desenelor din `QuestionArt`, [apps/web/app/page.tsx](../../apps/web/app/page.tsx). [map.js](map.js) copiază geometria și metadatele din [ro-map.json](../../apps/web/lib/ro-map.json). Se păstrează avertismentul existent: „GADM-derived (GabrielRondelli/geojson). Non-commercial; replace with Natural Earth (public domain) before wider release.” Fonturile sunt cele locale din `../src/fonts.css`. Nu sunt livrate imagini raster.

## Limite și verificare

Instituțiile, firmele, valorile, cronologiile și documentele sunt fictive. Dosarul reproduce exact selecția demonstrativă; nu reprezintă dovezi reale. Citarea externă este simulată printr-un document local, fără articol real sau URL oficial inventat. Valorile contractelor nu sunt plăți. Solicitarea către instituție nu a fost trimisă.

Autorii, revizia și publicarea editorială, atribuirea unei povești mai multor județe, istoricul corecturilor, răspunsurile instituțiilor și legăturile către surse reale sunt funcționalități viitoare, nu implementări existente în machetă. Nu există modificări ale bazei de date sau aplicației, cereri către SEAP/producție ori deploy.

Au fost consultate codul, brief-ul, documentele de produs/design și [rezultatele browserului](../../.impeccable/review/ce-bate-la-ochi/checks.json). Verificările locale desktop 1440px și mobil 390px acoperă harta, căutarea, filtrele, lectura, sursele, istoricul, tema întunecată, tastatura și reduced motion; raportul nu consemnează erori JS sau depășirea lățimii. Revizia independentă are verdict **SHIP FOR MOCKUP REVIEW**: cele trei corecții cerute (tranziția județului, instituțiile distincte în fișe și acordul gramatical) sunt rezolvate. [Raportul](../../.impeccable/review/ce-bate-la-ochi/review.md) și [verificările corecțiilor](../../.impeccable/review/ce-bate-la-ochi/fix-checks.json) delimitează evaluarea. Limita totală de agenți a împiedicat un fir nou; au fost reutilizate fire independente existente pentru review și documentare. Această evidență nu validează producția sau conformitatea completă de accesibilitate.

## Pornire și verificare

Dacă serverul de machete este oprit, din rădăcina repository-ului:

```sh
python3 -m http.server 3112 --bind 127.0.0.1 --directory mockups
```

Verificarea interacțiunilor: `node mockups/ce-bate-la-ochi/check.mjs`. Folosește Chrome local pe macOS; calea alternativă se poate furniza prin `CHROME_PATH`. Capturile se scriu în `.impeccable/review/ce-bate-la-ochi/`. Nu este necesară baza de date pentru machetă. Linkurile generale către aplicația locală presupun serverul Next pe portul 3000.
