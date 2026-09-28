# 5B — mockup funcțional pentru căutarea unui subiect

Documentat la **28 septembrie 2026**. Utilizatorul a aprobat realizarea unui mockup funcțional înainte de implementarea în aplicație. Artefactul este în [mockups/topic-search](../../mockups/topic-search/README.md), pregătit pentru evaluarea utilizatorului; nu este implementare sau deploy în producție.

## Domeniul realizat

- O expresie comună și filtre după zona geografică, interval inclusiv de ani și tipul achiziției controlează potrivirile din titluri, documente și entități. Potrivirea este literală, fără diferențe de diacritice: expresie în ordine sau toate cuvintele în orice ordine. Nu este căutare semantică.
- Tipurile de rezultate au numărători separate. Documentele nu sunt adunate ca tranzacții suplimentare. Suma afișată pentru achiziții acoperă titlurile potrivite din toate paginile filtrului și reprezintă valori contractuale fictive, nu plăți.
- Rezultatul din document deschide pagina exactă într-un cititor HTML și oferă PDF-ul demonstrativ corespunzător. Cele șase PDF-uri, cu opt pagini fizice în total, sunt generate din aceleași pagini și paragrafe ca cititorul. Datele conțin douăsprezece achiziții și nouă înregistrări de documente.
- Salvarea păstrează citatul, documentul, contractul, pagina, metoda ilustrativă, nota, momentul salvării și SHA-256 calculat din PDF. Exportul JSON nu include fișierul original; acesta rămâne disponibil separat.
- Căutarea, filtrele și paginarea sunt în URL, împreună cu documentul/pagina când sunt deschise. Anchetele și configurațiile de urmărire se păstrează doar în browser, sub cheia `cinecastiga-topic-search-v1`.
- Acoperirea distinge fișierele procesate, nedescărcate și fără text. Stările demonstrative includ încărcare, lipsă de rezultate, eroare recuperabilă și stocare locală refuzată.

Toate instituțiile, firmele, contractele și documentele sunt fictive. Județele sunt filtre geografice, nu afirmații despre achiziții reale. Nu există autentificare, acces privat garantat, index național, extragere/OCR efectivă, urmăriri automate sau notificări în acest mockup. Nu se inventează linkuri SEAP și nu sunt necesare cereri către sursă, modificări de schemă sau mutații în aplicația reală.

## Pornire și traseu de evaluare

Din rădăcina repository-ului:

```sh
python3 -m http.server 3112 --bind 127.0.0.1 --directory mockups
```

Deschide `http://127.0.0.1:3112/topic-search/`. Serverul servește `mockups`, iar fonturile sunt locale. Modulele JavaScript și citirea PDF-urilor necesită HTTP localhost, nu `file://`. Nu este necesară o bază de date.

Exemplul inițial „locuri de joacă”, Buzău, toți anii/toate tipurile produce șapte achiziții, patru documente și zero entități. Deschide Documente → „Mai apare și la pagina 2”, verifică originalul, păstrează pasajul cu o notă și exportă ancheta. „Memoriu tehnic — zona de agrement” demonstrează o potrivire în document fără aceeași expresie în titlul achiziției. Schimbă filtrele și modul de potrivire, apoi inspectează acoperirea și urmărirea locală. Traseul detaliat este în [README](../../mockups/topic-search/README.md).

## Verificare și limitele dovezilor

Cu serverul pornit și dependențele proiectului instalate:

```sh
node mockups/topic-search/check.mjs
```

Scriptul utilizează Playwright-ul local și calea macOS pentru Google Chrome; aceasta trebuie adaptată pe alte sisteme. Scrie capturi și `verification.json` în `.impeccable/review/topic-search/`. PDF-urile incluse nu trebuie regenerate pentru o verificare obișnuită. Dacă fixture-urile se modifică, rulează întâi `node mockups/topic-search/generate-fixtures.mjs`; acesta rescrie PDF-urile și manifestul cu amprente. Salvările anterioare nu sunt migrate la noile binare.

[Copia raportului de verificare](../../mockups/topic-search/verification.json) consemnează **59 de verificări trecute**, fără erori de browser și fără cereri HTTP externe observate. Acoperă numărători/filtre, pagina exactă, amprenta originalului, persistență/export, prevenirea duplicatelor, potrivirea fără diacritice, paginare/URL, entități, urmărirea locală, stări de eroare, lățimi de 800/390/320px, cititor mobil, focalizarea formularului și stocarea refuzată. Acestea sunt verificări ale mockupului și nu probează serviciile de producție sau accesibilitatea completă.

Verdictul independent anterior, pentru prima versiune (nu pentru noile filtre), din `.impeccable/review/topic-search/review.md` este **ship**, limitat la cele două corecții evaluate: accesul de la pasajul mobil la formular și separarea legăturii de acoperire pe propriul rând. Reviewerul a redeschis cele zece capturi cerute, fără rerulare de browser sau detector; verdictul nu este o nouă revizuire integrală. Capturile sunt `desktop.png`, `documents.png`, `reader.png`, `saved-case.png`, `empty.png`, `mobile.png`, `reader-mobile.png`, `reader-mobile-save.png`, `dark-mobile.png` și `dark-desktop.png` în același director de dovezi.

Acest pas de documentare a citit sursele și raportul și a inspectat `desktop.png`, `reader-mobile-save.png` și `dark-mobile.png`. Nu a rulat browserul, teste, generatorul de PDF-uri sau cereri de rețea. Copia JSON de lângă mockup este identică raportului de lucru la predare; la o verificare viitoare trebuie sincronizată explicit.

## Raport cu sistemul vizual existent

Mod Operate: extensie a lumii vizuale existente, fără schimbare de identitate. Referințele sunt [PRODUCT.md](../../PRODUCT.md), [DESIGN.md](../../DESIGN.md), sidecar-ul existent și [direcția suprafeței](../../.impeccable/surfaces/mockups-topic-search-index-html.md). Rolul dedicat de documenter nefiind disponibil, pasul a aplicat contractul Impeccable degradat de documentare.

| Element | Artefactul final și relația cu sistemul |
| --- | --- |
| Paletă | Păstrează ivory `#f7f8f2`, forest `#204c3c`, suprafețele și culorile întunecate existente. Textul secundar estompat este întărit local la `#626e62` pentru contrast, cu `#a5b39e` în tema întunecată; sistemul comun rămâne neschimbat. |
| Tipografie | Bricolage pentru titluri, IBM Plex Sans pentru lectură; corp 15px/1.6. Titlul întrebării este 44px în CSS, față de 42px în brief, și 35/32px la lățimi mici. Titlurile rezultatelor sunt 19px; metadatele au 10–13px. Cititorul are 15px/1.95 pe desktop și 14px pe mobil. Acestea sunt variații locale, nu o nouă scară normativă. |
| Structură | Rânduri deschise și separatoare fine, conținut de 1120px în cutia principală de 1180px cu padding inclus. Contextul stă lângă rezultate pe desktop și înaintea lor pe mobil. Cititorul și formularul se stivuiesc sub 760px. |
| Forme și profunzime | Controale de 6–7px, suprafețe de citat de 8px; acoperirea de 12px și dialogul de 14px sunt variații locale. Umbra dialogului/toastului (`0 18px 65px #10221924`, întunecat `#0007`) diferă de exemplele canonice, dar marchează o suprapunere. Rândurile rămân plate. |
| Evidență și interacțiune | Verde pentru acțiunea de păstrare, citat pe suprafață distinctă, pagină și original alături, focus portocaliu de 2px cu offset 4px, subliniere de navigare și iconuri SVG. Mișcarea scurtă a dialogului și tranzițiile sunt dezactivate la reduced motion. |

Accentele pentru potrivire (`#f6dfa2`, întunecat `#665221`), umbra, razele și variațiile de tip sunt documentate numai aici. Nu sunt adăugate în sistemul comun și nu sunt „reparate” în afara domeniului autorizat. Etichetele mici ale înregistrărilor comunică metadate reale ale fixture-urilor; nu devin o regulă decorativă. Nici deviațiile istorice deja excluse de DESIGN.md nu sunt canonizate.

Nu există active raster livrate în interfață: PNG-urile sunt dovezi de revizuire, PDF-urile sunt fixture-uri text generate, iar iconurile sunt SVG inline. `PRODUCT.md`, `DESIGN.md` și `.impeccable/design.json` au rămas byte-identice în acest pas; nu a fost necesară regenerarea sistemului sau a sidecar-ului.

## Etape propuse după evaluarea utilizatorului

Aceste etape sunt propuneri de lucru, nu implementări terminate sau autorizație de deploy:

1. **Contractul căutării pe date existente.** Stabilește populația comună pentru județ/an/tip, identitățile contractelor și directelor, potrivirea literală și numărătorile distincte. Verifică semantica într-o bază izolată înainte de integrarea interfeței.
2. **Indexarea documentelor deja disponibile.** Leagă versiunea originală, pagina și textul extras; păstrează separat lipsa fișierului, lipsa textului și OCR-ul neverificat. Expune acoperirea și potrivirile fără trafic nou la sursă ca efect implicit al căutării.
3. **Cititorul și dovezile persistente.** Integrează pagina exactă și originalul cu anchetele autentificate existente, verificarea permisiunilor, citatul nemodificat, amprenta versiunii și nota. Folosește teste izolate pentru acces și păstrarea provenienței.
4. **Urmărirea reală, separat.** Integrează numai după stabilirea sensului unei selecții înghețate și al comparației între publicări validate; simularea locală nu justifică joburi sau notificări automate. Păstrează explicit eșecurile și acoperirea incompletă.

Fiecare etapă necesită validări pentru datele reale și o revizuire a interfeței integrate. Feedbackul utilizatorului asupra mockupului precede aceste schimbări. Acest pas nu a modificat aplicația, baza de date sau fișierele de test/fixture și nu a făcut commit, push ori deploy.

## Revizia filtrelor după feedbackul utilizatorului

Utilizatorul a cerut typeahead pentru județe și localități, interval de ani cu „Toți anii” implicit și eliminarea explicației despre sediul instituției. Layoutul rezultatelor rămâne deliberat în evaluare.

- Combobox cu grupuri Județe / Localități; tip și județ/comună părinte pentru dezambiguizare. Tastatură: săgeți, Enter, Escape, Tab. Textul tastat nu schimbă zona până la alegerea unei sugestii. Ștergerea selectează toată țara.
- Numele municipiilor Buzău, Râmnicu Sărat și Cluj-Napoca provin din catalogul INS deja disponibil în repository; celelalte localități exemplificative sunt marcate demo. Lista este limitată la mockup, nu catalog național. Identificatorii geografici și legăturile achizițiilor sunt demonstrative.
- Comuna include satul său; alegerea satului păstrează selecția exactă. Omonimele sunt distincte. Sensul geografic nu este reinterpretat drept amplasament al lucrării.
- Perioada acceptă început/sfârșit 2018–2026, inclusiv același an. Editarea/preseturile sunt draft până la Aplică; inversarea capetelor este respinsă. Toți anii elimină ambele limite.
- Două achiziții suplimentare fictive din 2022 și 2023 demonstrează intervalul 2022–2024 și selecția unui sat. Total 12 achiziții; fișierele/PDF-urile originale demonstrative nu s-au schimbat.
- Parametrii noi `place`, `from`, `to` se păstrează în URL și urmăriri; vechile `county` și `year` sunt normalizate la deschidere. Nicio modificare de producție.
- 59 verificări de browser, inclusiv noile sugestii, scopul geografic, anii inclusivi, URL, invalidare, lipsă sugestii și controale deschise pe mobil. Capturi suplimentare: location-desktop, period-desktop, location-mobile, period-mobile, location-dark-mobile. Scanarea mecanică a dus la întărirea locală a textului secundar; metadatele mici moștenite rămân în afara schimbării layoutului.
