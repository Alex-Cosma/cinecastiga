# Release 28 septembrie 2026 — Explorează și întrebări salvate

Autorizare explicită: commit + push + deploy. Commit aplicație `137b4e5`, publicat pe `main` și `work/explore-compact`. [Actions 36459640568](https://github.com/Alex-Cosma/seap-new/actions/runs/36459640568).

Include pagina Explorează compactă, păstrarea butonului „Toate întrebările”, salvarea lângă rulare, încărcarea din tabul „Salvate” fără rulare automată, confirmarea înlocuirii modificărilor, update/copy și numele unice per cont. Mockupurile de referință și documentarea fac parte din commit. Nu sunt incluse dumpuri sau date private de test.

## Verificări înainte de publicare

- Workspace `pnpm turbo typecheck lint test build`: 20/20 sarcini trecute, 414 teste unitare. 121 teste de integrare web omise în această rulare fără baze fixture; nu sunt prezentate drept trecute.
- 13/13 teste host pentru deploy și procesarea nocturnă.
- Separat: 56 teste țintite, inclusiv două teste PostgreSQL pe bază izolată pentru nume/concurență/privat/rollback, plus validarea migrării peste duplicate cu istoric păstrat. Baza fixture eliminată.
- Browser local desktop/mobil light/dark: 13 modele, încărcare fără autorun, restaurare filtre, protejarea modificărilor, actualizare/copie/conflict, nume propus editabil înainte de confirmare. API anonim real 401; browserul folosește fixtures pentru înregistrări private, fără scrieri în conturile utilizatorilor.
- Preflight producție: checkout curat la `88b345c`, web/DB healthy, 41 migrări, **zero întrebări salvate și zero duplicate**. Control rev14, paused/maintenance false, fără blocaj, 50–70 secunde, zilnic05:00/risc duminică. Procesarea zilei ready/complete.

## Migrare

`0041_unique_saved_question_names` adaugă indexul unic `(owner_user_id, lower(normalized_title))`. Migrarea poate redenumi duplicatele prin versiuni noi fără a rescrie istoricul; în producția inspectată nu există înregistrări de redenumit. Sunt păstrate autorizarea per proprietar și verificarea expectedVersion. Nu se modifică colectarea, bugetele SEAP sau pipeline-ul analitic. Deploy-ul aplică migrarea prin runnerul existent înainte de restart.

## Rezultat

**Deploy reușit și verificat în producție**, 28 septembrie 2026, aproximativ 20:44 ora României. Actions 36459640568: CI și deploy `success`. Serverul are checkout curat la `137b4e5849a0ee16a382b662b5a7d79a3ccd602a`.

- 42 migrări aplicate; `app.query_recipes_owner_title_unique`: unique/valid/ready toate true. Zero grupuri de nume duplicate.
- Web și PostgreSQL healthy, workerul documente repornit; colectorul existent a continuat să ruleze. Controlul rămâne rev14, nepausat/fără mentenanță/blocaj, 50–70 secunde, zilnic05:00/risc duminică. Ultimele cereri inspectate 2110–2112: HTTP200/success.
- Health200 (`ok:true`), API admin403 anonim. Prima verificare read-only a cererilor a folosit accidental o coloană inexistentă (`http_status`); corectată după schema reală la `status/outcome`, fără mutații.
- Chrome public: `/intreaba`200, titlul compact, vechiul panou absent, toate cele13modele disponibile, tabul Salvate protejat prin autentificare, POST anonim de salvare401 și revenire cu draftul păstrat. Mobil390 fără overflow și salvarea în stânga rulării. Zero erori JS și zero cereri browser către SEAP.
- Verificarea de producție este anonimă și read-only, exceptând POST-ul refuzat401; nu am creat întrebări în conturi de utilizator pentru smoke. Persistența/autorizarea per proprietar și concurența sunt verificate separat în fixture PostgreSQL, conform secțiunii anterioare.

Dovezi browser locale în `.impeccable/review/explore-production/`. Documentarea acestui rezultat se publică într-un commit Markdown ulterior cu `[skip ci]`, fără încă un deploy al aceleiași aplicații.
