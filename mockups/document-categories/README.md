# Clasificarea documentelor în pagina contractului

Machetă interactivă separată de aplicație. Preia contextul contractului din macheta existentă `contract-files`; lista celor 18 documente, categoriile, stările, previzualizarea și coada sunt demonstrative. Nu citește baza de date, nu face cereri SEAP și nu modifică prioritățile din producție.

Deschide `http://localhost:3112/document-categories/` cât timp serverul local al machetelor rulează. Alternativ, din rădăcina proiectului:

```sh
python3 -m http.server 3112 --bind 127.0.0.1 --directory mockups
```

- Categorii cu numere, caietele primele; selector nativ pe mobil.
- Căutare în titlu și numele fișierului, fără diferențe între diacritice.
- Filtru „Doar de citit acum”, paginare de maximum șase rânduri și resetarea selecției fără rezultate.
- Cititor inline cu PDF demonstrativ, arhivă desfășurabilă, explicația încadrării și a surselor.
- Stări de descărcare, coadă prioritară, OCR, eroare și clasificare incertă.
- Selector pentru vizitator/autentificat; citirea rămâne publică, preluarea este dezactivată pentru vizitatori.
- Temă luminoasă/întunecată, navigare de la tastatură și mișcare redusă.

Legăturile „Original” descarcă explicit `document-demonstrativ.pdf`; nu simulează un original semnat. În implementare, fiecare volum va avea propriul original și amprentă, iar citările vor păstra toate sursele arhivei reunite. Lista ilustrativă nu dovedește existența acestor documente în procedura reală.

Verificare locală cu Node22 și Google Chrome pe macOS:

```sh
node mockups/document-categories/check.mjs
```

Capturile desktop, mobil și întunecate și raportul verificărilor sunt în `.local/document-categories-preview/` (necomise). Fonturile sunt cele existente în proiect, incluse local în `mockups/src/fonts.css`.
