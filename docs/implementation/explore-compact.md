# Explorează compact — 28 septembrie 2026

Implementare locală pe `work/explore-compact`, după aprobarea schiței `mockups/explore-compact/`. Nu este publicată. Scop: întrebarea și acțiunea principală să fie accesibile imediat, păstrând cele 13 tipuri și trasabilitatea rezultatelor.

## Comportament

- `/intreaba` folosește antetul scurt „Explorează”, legătura „Caută un subiect”. Introducerile repetitive și taburile redundante Construiește/AI sunt eliminate din această pagină. AI rămâne dezactivat.
- Butonul „Toate întrebările” păstrează markupul, plusul, numărul 13 și stilul existent; pe mobil înlocuiește doar rândul celor trei scurtături. Catalogul complet rămâne accesibil.
- „Mai multe filtre” grupează selecția precisă și numărul minim de înregistrări fără încă un nivel de disclosure. Condițiile încărcate/modificate deschid grupul; erorile de validare când există condiții avansate îl deschid. Restrângerea voluntară păstrează rezumatul exact al condițiilor și al pragului.
- Rezultatul se schimbă numai la aplicare. Explicațiile de profil, populație, modificări neaplicate și sursele exacte sunt păstrate.
- `PopulationEditor.embedded` afișează editorul în disclosureul comun. Nu s-au schimbat API-urile, schema sau datele.
- CSS este în `apps/web/app/intreaba/explore-compact.css`; tema existentă și componentele se reutilizează. Nu se schimbă PRODUCT.md/DESIGN.md.

## Verificări și limite

- Build Next de producție reușit în `.next-explore-build`; verificare TypeScript separată reușită după ultima ajustare a deschiderii filtrelor.
- 51 teste existente: `question-ui.test.ts` (38), `population.test.ts` (13).
- Chrome desktop 1440×1000 și mobil 390×844: toate cele 13 alegeri schimbă întrebarea; valoare minimă 50000.00 și minimum 5 înregistrări rămân în rezumat când grupul e închis; eliminarea condițiilor funcționează. Rețetele anonime cer autentificare și păstrează legătura de revenire.
- Un răspuns real tabelar pentru contracte/2025 a fost afișat și lista de surse s-a deschis. Nu reprezintă rularea tuturor celor 13 analize și nici verificarea salvării autentificate a rețetelor. Prima încercare națională nu a afișat răspuns în intervalul verificării; cauza nu a fost izolată. Nu se afirmă o îmbunătățire de performanță SQL.
- Mobil: lățime pagină 390/390, butonul principal se termină la ~800 px, față de ~1151 px înainte; desktop: prima coordonată a butonului ~526 px față de ~989 px înainte. Sunt măsurători ale întrebării inițiale, nu o garanție pentru toate formele.
- Captura dark a fost verificată după terminarea tranziției de temă. Zero erori JS raportate de verificarea finală. Detector: patru recomandări privind dimensiunile fonturilor; valorile sunt ajustări locale pentru densitatea aprobată.
- Review/documentare în firul principal; fără review independent în această etapă. Dovezi locale în `.impeccable/review/explore-compact/`.
- Fără trafic SEAP, workeri, mutații de cont/date, migrații sau deploy.

## Pornire locală

Din `apps/web`, cu Node 22 și dependențele existente:

```sh
DOCUMENTS_ENABLED=false NEXT_DIST_DIR=.next-explore-dev node node_modules/next/dist/bin/next dev --webpack --port 3000
```

La încheierea implementării acest proces este deja pornit. Directoarele `.next-explore-dev` și `.next-explore-build` sunt ignorate. Next poate adăuga automat includeurile lor în tsconfig; acestea nu sunt schimbări de produs necesare pentru commit.

## Revizie cerută de utilizator: Salvează întrebarea

Vechiul `RecipeShelf.tsx` și stilurile exclusiv ale panoului au fost eliminate. Butonul secundar `SaveQuestionButton` este lângă și în stânga acțiunii principale, inclusiv la 390 px. Antetul păstrează numai titlul și căutarea de subiecte.

Dialogul are un singur câmp, numele întrebării, precompletat și editabil. Face snapshot al întrebării curente când se deschide; salvează prin POST `/api/recipes` numai numele și spec-ul validat. Nu execută analiza, nu salvează rezultatele sau sursele, nu modifică o versiune existentă. Repetarea clicului după succes pentru același draft este blocată; schimbarea draftului permite o nouă salvare. Backendul păstrează autorizarea și validarea existente. Versiunile/datele deja salvate nu sunt șterse.

Escape/anulare restabilesc focusul; în timpul POST-ului dialogul rămâne deschis și acțiunile sunt blocate. Erorile permit corectare/reîncercare; 401 prezintă autentificarea cu spec-ul în URL-ul de întoarcere. După autentificare, utilizatorul apasă din nou salvarea; nu se promite salvare automată.

Verificări pentru această revizie: build Next de producție, TypeScript și 51 teste existente trecute; Chrome desktop/mobile light/dark, fără overflow sau erori JS. API real: POST anonim 401, fără scriere. Flux de succes verificat cu răspuns API interceptat în browser, inclusiv payload și evitarea dublării; nu este o nouă validare de persistență PostgreSQL autentificată. Capturi și jurnal în `.impeccable/review/save-question/`. Butoanele pe mobil sunt pe același rând, partea de jos la ~776 px pentru întrebarea inițială.

**Încărcarea este doar propunere, nu implementare:** în dialogul „Toate întrebările”, taburi „Modele” / „Salvate”; căutare, titlu, rezumat filtre și data salvării. Selectarea unei întrebări o pune în constructor fără rulare automată; modificările nesalvate cer confirmare înainte de înlocuire. Butonul exterior existent rămâne identic. Până la acordul utilizatorului, vechea listă de rețete nu mai este montată; datele sunt păstrate prin API. Funcțiile de versiuni/urmărire din panoul vechi trebuie regândite în fluxul viitor de încărcare, nu s-au șters din backend.

## Revizie aprobată: încărcarea din „Salvate” — implementată

Înlocuiește starea de propunere din secțiunea precedentă. Dialogul catalogului include taburi accesibile cu săgeți/Home/End: „Modele de întrebări” (cele 13) și „Salvate”. Dimensiunea dialogului nu se schimbă la încărcare sau schimbarea tabului. Butonul exterior este neschimbat. Lista arată nume, rezumat al condițiilor și ultima dată a salvării, în ordinea updated_at/id. Stările gol, căutare fără rezultate, autentificare, eroare și reîncercare au mesaje explicite.

`SavedQuestions.tsx` încarcă lista doar la accesarea tabului. Căutarea după nume este pe server, cu debounce și anularea cererilor vechi. `recipeStore.list(userId, search)` selectează exclusiv datele proprietarului, alături de spec-ul versiunii curente; căutarea ILIKE tratează caracterele `%`, `_` și backslash literal. Sunt returnate maximum 200 rezultate, cu avertizare vizibilă la atingerea limitei; căutarea include și întrebările mai vechi, nu doar cele deja afișate. Nu s-a adăugat migrare.

Clickul revalidează ultima versiune prin endpointul individual și pune spec-ul în constructor. Nu apelează analiza; răspunsul/sursele aplicate anterior rămân neschimbate până la rulare. Condițiile precise și pragul minim sunt restaurate. Dacă draftul diferă de ultima întrebare salvată/încărcată (sau starea inițială), apare confirmarea înlocuirii, cu anulare și focus restabilit.

`SaveQuestionButton` primește identitatea/versiunea întrebării active. „Actualizează întrebarea” transmite expectedVersion; „Salvează o copie” folosește endpointul de creare. Un conflict 409 păstrează draftul/numele și oferă copia sau redeschiderea. Enter în câmpul numelui execută acțiunea principală de actualizare, nu creează implicit o copie. Versiunile anterioare rămân în baza de date; selectorul istoricului din vechiul panou nu a fost reintrodus. Autentificarea păstrează draftul în URL-ul de întoarcere; identitatea unei întrebări încărcate nu persistă după refresh/autentificare și se reselectează din „Salvate” dacă trebuie actualizată.

Verificare: 52 teste trecute, dintre care testul de persistență pe PostgreSQL real izolat verifică proprietarul, spec-ul curent din listă, căutarea, caracterele wildcard literale, versiunile, conflictele și rollbackul. Fixtureul a folosit tabelele rețetelor din migrarea 0030 și un auth.users minimal; baza izolată a fost eliminată. Build producție trecut, apoi TypeScript trecut după ajustarea Enter/copiere. Browser desktop 1440 și mobil 390, light/dark: căutare, 13 modele, înălțime stabilă, restaurarea perioadei/CPV/pragului/populației, anulare/confirmare înlocuire, update/copy/conflict, zero analiză automată, zero overflow și erori JS. Răspunsul anonim 401 este real; înregistrările private pentru testele browser sunt fixtures interceptate, nu date ale utilizatorilor.

Review vizual în firul principal, în două treceri delimitate: inspectare desktop/mobile și corecție de contrast a câmpului de căutare în tema dark, urmată de confirmare. Dovezi în `.impeccable/review/load-questions/`. Nicio schimbare a canonului de design, nicio cerere SEAP, niciun deploy.

## Nume unice și copiere — 28 septembrie 2026

Utilizatorul a cerut evitarea numelor identice. Regula este **per proprietar**, ignorând cazul literelor și spațiile consecutive/de margine. Conturi diferite pot folosi același nume. `recipeInput` și store-ul normalizează spațiile, iar indexul unic expresie din `0041_unique_saved_question_names` aplică regula în PostgreSQL, inclusiv la cereri simultane și scrieri directe. Crearea și actualizarea care ar încălca regula fac rollback integral, inclusiv al versiunii inserate în tranzacție; API-ul răspunde 409 cu `code: title_taken`, distinct de conflictul de versiune.

„Salvează o copie” intră într-un pas de denumire înainte de POST. GET `/api/recipes?copyTitle=...`, autentificat și private/no-store, propune primul sufix liber „— copie”, „— copie 2” etc. Folosește toate întrebările proprietarului, nu limita de 200 din listă; nu creează o înregistrare. Sufixele nu se stivuiesc, iar lungimea rămâne în 160 fără tăierea unei perechi Unicode. Numele propus este editabil; „Salvează copia” confirmă. Sugestia nu rezervă numele: dacă altă cerere îl ocupă între timp, serverul refuză clar și păstrează formularul pentru redenumire. Nu se suprascrie o altă întrebare.

Migrarea păstrează cea mai veche întrebare din fiecare grup cu nume identic și redenumește celelalte cu sufixe libere. Pentru fiecare redenumire adaugă o versiune nouă cu același spec și o notă; nu rescrie versiuni istorice și nu șterge întrebări. Tranzacția se oprește dacă lipsește versiunea curentă. Schema Drizzle, snapshotul 0041 și jurnalul sunt actualizate; migrarea se va aplica la deploy prin fluxul existent. A fost aplicată local după testare, fără intervenție în producție.

Verificări: 56 teste (38 question-ui, 13 population, 3 nume/copiere, 2 persistență PostgreSQL). Baza izolată `seap_test_recipe_names_20260928` a primit schema rețetelor și fixture auth minimal. Testele verifică proprietari diferiți, majuscule/spații, create concurent, update colizional și rollbackul versiunii, actualizare cu propriul nume, sugestii incrementale, precum și refuzul scrierii SQL directe duplicate. Separat, migrarea s-a aplicat peste trei înregistrări legacy, inclusiv un sufix „— copie” ocupat; au rămas toate trei și versiunea veche, duplicatul primind „— copie 2”. Local: 42 migrări în jurnal și index valid. Build web și verificări TypeScript web/DB trecute. Browser folosește fixtures pentru nume/succes/conflicte; nu creează întrebări private în baza utilizatorului. Capturi/jurnale în `.impeccable/review/recipe-names/`.
