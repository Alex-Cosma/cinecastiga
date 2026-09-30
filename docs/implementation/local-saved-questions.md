# Întrebări locale și acțiuni autentificate — 30 septembrie 2026

Implementare locală, fără commit/push/deploy. Cererea proprietarului: ascunde urmărirea și salvarea în anchetă pentru vizitatori; permite păstrarea întrebărilor fără cont.

## Comportament

- `FollowButton` și `ClipButton` sunt ascunse până la confirmarea autentificării, inclusiv pe rezultate, profiluri și în drawer. `useViewer` reutilizează sesiunea Better Auth și păstrează primul render stabil la SSR/hidratare. Panoul de anchete se remontează la schimbarea utilizatorului, fără reutilizarea listei altui cont. Autorizarea backend rămâne obligatorie și neschimbată.
- Vizitatorul salvează din butonul existent, apoi încarcă din **Toate întrebările → Salvate**. Sunt păstrate numai numele, întrebarea, filtrele și metadatele locale necesare. Rezultatele, sesiunile și dovezile private nu se copiază în stocarea locală.
- Folosim `localStorage`, cheia versionată `cinecastiga.saved-questions.v1`, pentru persistență după închiderea browserului. Este separat pe origine/profil/browser; localhost și producția nu împart întrebări. Ștergerea datelor site-ului le elimină; persoanele care folosesc același profil de browser le pot vedea. Dialogul explică aceste limite. Nu promitem sincronizare între dispozitive sau funcționare offline.
- Nume normalizate unice fără diferențiere majuscule/minuscule; copii numerotate cu helperul existent, nume editabil înainte de salvare. Actualizarea folosește expectedVersion pentru detectarea unui tab învechit. Web Locks serializează scrierile între taburi când API-ul există; fallback sincron fără await în operația read-modify-write, fără promisiune de serializare între procese în browsere fără Web Locks. Evenimentele storage actualizează lista deschisă în alt tab.
- Citirile validează formatul/versionarea și fiecare întrebare. Datele corupte ori de format necunoscut nu sunt suprascrise. Erorile de acces/cotă păstrează formularul și explică lipsa salvării. Limită de 200 de întrebări locale, fără eliminări automate; întrebările existente pot fi actualizate la limită.
- După autentificare, lista include întrebările din cont și cele locale, marcate distinct și ordonate după ultima salvare. O întrebare locală se poate încărca și salva **explicit în cont** prin același buton. Nu importăm automat; originalul local rămâne. Numele unice din cont sunt în continuare controlate de backend. Întrebările contului nu sunt salvate automat local la logout sau la o eroare API.
- Încărcarea nu execută automat interogarea și păstrează confirmarea înlocuirii unui draft nesalvat. Stilul butonului „Toate întrebările” este neschimbat.

## Verificări

- 53 teste unitare trecute: 10 pentru stocare locală, 3 pentru numele copiilor, 38 constructor și 2 navigare/autentificare. Acoperă persistență/filtre, duplicate, copii, conflict de versiune, stocare coruptă, cote/permisiuni și limita de capacitate.
- TypeScript și build de producție web trecute. Directorul build temporar `.next-local-questions-check` și include-urile lui au fost eliminate; serverul dev existent rămâne pornit.
- 24 verificări browser Chrome: salvare anonimă/reload/încărcare, copie, duplicate, rezultat real local fără acțiuni private, desktop1440/mobil390 dark fără overflow, autentificare simulată și salvare explicită în cont fără ștergerea datelor locale, căutare fără diacritice, actualizare din alt tab, eroare de cotă fără succes fals. Zero erori JS/hidratare. Browserul anonim nu cere API-ul privat de rețete.
- API-urile reale locale POST `/api/recipes`, `/api/anchete`, `/api/urmariri` refuză anonim cu401. Verificarea contului folosește numai fixtures de rețea, nu scrieri în conturi reale.
- Dovezi ignorate de Git: `.impeccable/review/local-questions-20260930/`; harness temporar `/tmp/seap-local-questions.mjs`.

Fără migrare, scrieri în DB, cereri SEAP, colectori, procesare sau modificări de producție. Restricția de publicare a întregului branch pentru tranziția calendarului `rf-2026.6` rămâne cea din HANDOFF/checkpoint.
