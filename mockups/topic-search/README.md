# 5B — Caută un subiect

Mockup funcțional, separat de aplicația reală. Toate instituțiile, firmele, achizițiile și documentele sunt **fictive**. Sugestiile geografice includ câteva nume reale din catalogul INS existent și localități inventate, marcate „demo”; asocierile cu achizițiile sunt integral demonstrative.

Deschide [mockupul local](http://127.0.0.1:3112/topic-search/). Dacă serverul de mockupuri nu rulează, din rădăcina repository-ului:

```sh
python3 -m http.server 3112 --bind 127.0.0.1 --directory mockups
```

Serverul trebuie să servească directorul `mockups`, nu rădăcina repository-ului. Fonturile sunt reutilizate local; nu este necesară o bază de date. Fișierele folosesc module JavaScript și salvarea citește PDF-uri locale, deci deschide prin HTTP localhost, nu `file://`.

## Încearcă traseul complet

1. Căutarea inițială este **locuri de joacă**, județul **Buzău**, toți anii și toate tipurile de achiziții.
2. Vezi separat **7 achiziții**, **4 documente** și **0 entități**. Numerele nu se adună într-un pretins total de contracte distincte: același contract poate avea mai multe documente.
3. Deschide **Documente**, apoi **Mai apare și la pagina 2** la primul caiet de sarcini.
4. Verifică pasajul despre accesibilitate; poți deschide PDF-ul demonstrativ la pagina respectivă, schimba pagina sau selecta alt paragraf.
5. Completează titlul anchetei și nota, apoi **Salvează pasajul în anchetă**. Deschide ancheta și exportă JSON-ul.
6. În rezultate, deschide **Memoriu tehnic — zona de agrement**. Subiectul apare în conținut, deși nu este în titlul achiziției.
7. În **Unde cauți?**, scrie „buzau” pentru județ și municipiu, „lunca” pentru localități omonime sau „teisor” pentru sat. În **Perioada**, alege un interval precum 2022–2024 și apasă **Aplică intervalul**; **Toți anii** este implicit. Schimbă zona, intervalul sau tipul achiziției: aceleași filtre controlează toate tipurile de rezultate. **Opțiuni de căutare** permite expresia în ordine sau toate cuvintele în orice ordine. Căutarea ignoră diacriticele.
8. **În ce am căutat** explică fișierele procesate, nedescărcate și fără text. **Urmărește căutarea** salvează numai o configurație locală, fără joburi sau notificări.

Căutarea, filtrele, tipul de rezultat și pagina listei sunt în URL; documentul și pagina PDF pot fi redeschise din URL. Anchetele se păstrează în localStorage, sub `cinecastiga-topic-search-v1`, separat de cele din aplicație. Nu există autentificare sau garanții de acces privat în acest mockup local.

## Date și limite

- 12 achiziții fictive, 9 metadate de document, 6 PDF-uri demonstrative pregătite, 8 pagini fizice în total.
- În filtrul inițial Buzău: 10 achiziții disponibile, 8 fișiere cunoscute, 5 cu text căutabil. Rezultatele sunt subsetul potrivit expresiei.
- Valorile sunt înregistrări contractuale ilustrative, nu plăți. Suma prezentată la Achiziții include toate titlurile potrivite filtrului, inclusiv cele aflate pe alte pagini, și nu include documentele ca tranzacții suplimentare.
- PDF-urile sunt generate din exact aceleași pagini și paragrafe ca cititorul. Cititorul mockupului redă HTML, nu o extragere OCR reală. Eticheta OCR este un exemplu de stare.
- Citatele păstrează textul exact, documentul, contractul fictiv, pagina fizică, metoda ilustrativă, nota, momentul salvării și SHA-256 calculat din PDF. Exportul JSON nu încorporează PDF-ul; originalul demonstrativ este disponibil separat.
- Nu sunt inventate linkuri SEAP pentru exemple. Nu se trimit cereri SEAP, emailuri sau mutații către aplicație. Contractele/directele, conturile și coada din producție rămân în afara acestui prototip.
- Acest mockup nu implementează căutarea națională, un index de documente, OCR, comparații de documente sau urmăriri reale.

## Verificare și regenerare

Din rădăcina repository-ului, cu serverul local pornit și dependențele existente ale proiectului instalate:

```sh
node mockups/topic-search/check.mjs
```

Verificarea folosește Playwright-ul existent din `apps/web/node_modules` și Chrome la `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Scrie capturile și raportul în `.impeccable/review/topic-search/`. Pe alt sistem, calea browserului din script trebuie adaptată înainte de rulare.

PDF-urile sunt deja incluse. Numai dacă modifici fixture-urile, regenerează-le înainte de verificare:

```sh
node mockups/topic-search/generate-fixtures.mjs
node mockups/topic-search/check.mjs
```

Generatorul verifică numărul de pagini și rescrie PDF-urile, HTML-urile de referință și manifestul SHA-256. Citatele deja salvate păstrează amprenta copiei anterioare; o regenerare nu migrează aceste salvări. Verificările acoperă comportamentul și datele fictive ale prototipului; nu sunt teste ale serviciilor de producție.

## Starea revizuirii — 28 septembrie 2026

Revizia filtrelor cerută de utilizator înlocuiește selectoarele de județ/an cu typeahead geografic și interval inclusiv de ani. Explicația despre sediul instituției a fost scoasă din interfață. Structura rezultatelor rămâne în evaluare și nu a fost redesenată. Câmpul geografic suportă săgeți, Enter, Escape, selectare explicită și ștergere; intervalele invalide nu schimbă selecția aplicată. URL-urile și urmăririle din versiunea anterioară sunt compatibile.

[Raportul păstrat lângă mockup](verification.json) consemnează **59 de verificări trecute**, fără erori de browser sau cereri HTTP externe în rularea raportată. Este copia raportului din `.impeccable/review/topic-search/verification.json`; scriptul scrie raportul de lucru în acel director, nu actualizează automat această copie.

Verdictul independent anterior, pentru prima versiune (nu o aprobare a noilor filtre), din `.impeccable/review/topic-search/review.md` este **ship pentru cele două corecții mobile evaluate**: acțiunea de păstrare a pasajului conduce la formular, iar legătura de acoperire are propriul rând. Verdictul nu reprezintă o nouă revizuire integrală sau aprobarea implementării în producție.

Mockupul este pregătit pentru evaluarea utilizatorului. Nu s-a făcut deploy. Domeniul, adaptările vizuale și etapele propuse pentru implementarea ulterioară sunt în [documentația 5B](../../docs/implementation/batch5b-topic-search-mockup.md). `PRODUCT.md`, `DESIGN.md` și `.impeccable/design.json` rămân neschimbate.
