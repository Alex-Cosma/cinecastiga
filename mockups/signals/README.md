# Semnale — mockup A

Mockup interactiv separat de aplicație, aprobat ca **direcție**, nu ca implementare. Cererea din 30 septembrie 2026. Identitatea vizuală rămâne cea din `DESIGN.md`.

Pornire din rădăcina repo:

```sh
python3 -m http.server 4185 --bind 127.0.0.1 --directory mockups
```

Deschide <http://127.0.0.1:4185/signals/>. Nu este o rută Next.js și nu se publică prin deployul aplicației.

## Ce se poate testa

- Selector cu căutare fără diacritice pentru toate cele 13 tipuri, grupate în patru familii.
- Autorități/firme și patru județe demonstrative. Tipurile exclusive unui rol schimbă selecția cu feedback.
- 10 rezultate pe pagină; totalul întregului set demonstrativ, paginare sus/jos și resetarea paginii la filtrare.
- O singură explicație deschisă în listă; limitele lungi într-un disclosure separat.
- Înregistrări sursă disponibile direct din rând sau din explicație; dialog demonstrativ, cu paginare când sunt mai mult de 10.
- Vizualizare separată CRI, bare care filtrează după numărul de criterii, ordonare după nume/CRI, explicația celor 5/4 criterii.
- Filtre mobile, temă luminoasă/întunecată, focus și Escape în dialoguri, reduced motion.
- „Testează stările mockupului”: normal, gol, eroare/reîncercare, surse exacte indisponibile. Încărcarea este simulată 380ms.
- Selecții principale reflectate în URL, navigarea în istoricul browserului. Expansiunea și scenariile demonstrative sunt efemere.

## Date și limite

Toate entitățile, numerele, relațiile și sursele sunt **fictive**, etichetate astfel. Există 32 de rânduri demonstrative per tip; totalurile sunt ale fixture-ului, nu numere din SEAP. Aceiași indici de fixture sunt adaptați pentru a demonstra observațiile diferitelor tipuri. Nu sunt rezultate ale motorului de calcul. CRI ilustrează criteriile existente; nu execută formulele reale sau validări de populație.

Nu sunt inventate URL-uri SEAP/TED sau profiluri reale pentru fixture-uri. Navigarea globală și metodologia duc la aplicația locală, pe portul 3000. Dialogul surselor este un prototip: nu descarcă, nu exportă și nu salvează în anchete. Este prezentat parcursul anonim, fără buton de salvare în anchetă. Nu pornește DB, colectori, recalculări sau procesări. Fonturile existente sunt refolosite offline prin `../src/fonts.css`; nu sunt adăugate imagini raster.

## Verificare

Chrome real: desktop 1440×1000, mobil 390×844, tema întunecată și reduced motion. Toate cele 13 tipuri, căutare fără diacritice, schimbarea automată de rol, județ, paginare, explicație, surse, CRI, gol/eroare, filtre mobile și lipsa erorilor JS sunt verificate. Dovezile și rezultatele browser se află local în `.impeccable/review/signals-mockup-20260930/` (ignorate de Git). În total39 verificări ale interacțiunilor și5 verificări suplimentare pentru corecțiile reviewului au trecut. Review independent: **SHIP ca mockup interactiv**, după confirmarea celor două corecții (păstrarea paginii la revenirea din CRI și condițiile pragurilor vizibile). Nu este o validare a backendului real.

Prompt și propunere: [documentul de design](../../docs/design/signals-redesign-20260930.md). Contract: [brief](../../.impeccable/surfaces/signals-mockup.md).
