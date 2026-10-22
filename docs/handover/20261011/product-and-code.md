# Produs, interfață și harta implementării

## Scopul aplicației

cinecâștigă? este o aplicație existentă de investigare a achizițiilor publice din România, publicată la `cinecastiga.ro`. Publicul include cetățeni fără experiență și organizații de presă de investigație. Recorder, RISE Project și Snoop sunt exemple de public și standard editorial, nu parteneriate confirmate.

Proprietarul a cerut explorare rapidă și plăcută, dar cu date verificabile. Nu transforma semnalele în acuzații. O diferență mare față de alte instituții este motiv de verificare, nu verdict. Când o sumă pare spectaculoasă, verifică înainte moneda, TVA-ul, lotul, unitatea, versiunea, plafonul și dacă este total sau increment.

## Stack și structură

- Monorepo pnpm/Turborepo, TypeScript; Node 22, pnpm 9.4.0 în fluxul documentat. `pnpm-lock.yaml` decide versiunile exacte.
- `apps/web`: Next.js App Router, React, interfața publică/admin și endpoint-uri. CSS-ul aprobat, fonturile și temele sunt deja construite.
- `apps/ingestion`: adaptoare de colectare, arhivare, normalizare, reconciliere TED, statistici, semnale, Radiografie, indexare și worker-i.
- `packages/db`: scheme Drizzle, migrații, conexiuni postgres.js, controlul comun al cererilor și publicării. Exportă `dist`; reconstruiește pachetul după schimbări.
- `packages/domain`: tipuri și reguli comune; `packages/scraper-clients`: clienți de sursă.
- PostgreSQL 16 este sursa de adevăr. Meilisearch este un index derivat. Better Auth gestionează conturile și autentificarea. Toolchain-ul documentelor include Chromium, OpenSSL, Poppler, Tesseract și convertoarele instalate în imaginea worker-ului.
- `infra/prod`: Docker, Caddy, deploy, migrator și orchestrat nocturn. `scripts/operations`: intervenții datate, nu comenzi universale de setup.

## Pagini și comportamente care trebuie păstrate

| Zonă | Funcție și decizie | Puncte de intrare |
|---|---|---|
| Pagina principală | Întrebări/teme ilustrate, intrare accesibilă în date. Județul ales pe hartă deschide „Pe ce se duc banii?” (breakdown pe domenii) pentru acel județ. Etichetele benzii de cifre au explicații `<Term>`. Blocul „Începe o anchetă” apare doar cu sesiune; anonim, o linie neutră | `apps/web/app/page.tsx`, `DiscoveryMap.tsx`, `apps/web/lib/discovery-links.ts`, `PRODUCT.md`, `DESIGN.md` |
| Navigare și `/ghid` | Meniul: Descoperă, **Întreabă** (fostul „Explorează”, aceeași țintă `/intreaba`), Ce bate la ochi (regula existentă), Anchete doar cu sesiune. „Cum funcționează” deschide ghidul pentru început; sub 1100 px ghidul apare ca „Ghid” în meniu. Metodologia rămâne legată din ghid și footer | `apps/web/lib/site-nav.ts`, `apps/web/app/SiteNav.tsx`, `apps/web/app/ghid/`, `apps/web/app/guide.css` |
| Glosar | Un singur dicționar de definiții pentru începători (ghid + `<Term id="…">`): buton accesibil, explicația se deschide în fluxul paginii, fără hover. Nu pune un `Term` într-un link | `apps/web/lib/glossary.ts`, `apps/web/components/Term.tsx` |
| `/intreaba` | Descoperă / Construiește; întrebare editabilă cu filtre clare, răspuns și surse | `apps/web/app/intreaba/`, `apps/web/lib/ask/` |
| `/cauta` | Căutare entități și achiziții tematice; typeahead geografic; interval de ani/toți anii | `apps/web/app/cauta/`, `apps/web/lib/topic-search*`, `apps/ingestion/src/search/` |
| `/domenii` | Atlas CPV; click pe părinte aprofundează, frunza deschide detalii, săgeata deschide detalii la orice nivel | `docs/implementation/domains-atlas.md` |
| `/entitati/[id]` | Profil, parteneri, istoric, semnale (CRI separat de „Toate semnalele”, cu linkuri `/semnale?ent=`), transparența populației | `apps/web/app/entitati/`, `apps/web/lib/marts.ts` |
| Radiografie | Comparații, furnizori, dependență, achiziții directe, loturi și surse | `apps/web/app/entitati/[id]/radiografie/`, `apps/ingestion/src/flags/radiografie.ts` |
| `/contracte/[nid]` | Sursă contractuală, furnizori, publicații/versiuni, fișiere și text | `apps/web/app/contracte/`, `apps/web/lib/marts.ts`, `apps/web/lib/documents/` |
| `/anunturi/[caid]` | Anunț și contractele/loturile lui | `apps/web/app/anunturi/`, `apps/web/lib/marts.ts` |
| `/semnale` și detalii | Explorare compactă/paginată a indicatorilor cu limite și dovezi; filtru opțional `ent` pentru o entitate | `apps/web/app/semnale/`, `apps/web/lib/signals.ts`, `flags.ts` |
| `/supra-prag` | Atribuiri publicate în TED; nu promite toate achizițiile peste prag | `apps/web/app/supra-prag/`, `apps/web/lib/ted.ts` |
| Anchete | Spațiu privat de lucru, roluri, capturi, note, cronologie, sarcini | `docs/implementation/batch2-investigation-workspace.md` |
| Urmăriri | Comparații între checkpoint-uri validate, diferențe și dovezi | `docs/implementation/batch3-monitoring.md` |
| `/admin` | Navigare pe rute consistente, colectare/date/documente, procesare, proxy-uri, jurnal, feedback, conturi | `apps/web/app/admin/`, `docs/implementation/admin-navigation-20260928.md` |
| Metodologie/acoperire | Definiții, limite, surse și starea datelor | `apps/web/app/metodologie/`, `apps/web/components/DataCoverage.tsx` |

Căile cu `*` sunt indicații de căutare, nu nume exacte de fișier. Folosește `rg --files` înainte de a deschide un modul mutat.

## Motorul întrebărilor

Vocabularul validat este în `apps/web/lib/ask/spec.ts`: `table`, `stat`, `timeseries`, `map`, `compare`, `distribution`, `breakdown`, `scatter`, `sankey`, `network`, `entity_card`, `fact_check`, `trend`. Sunt 13 tipuri, nu 13 interogări hardcodate. `compile.ts` construiește SQL parametrizat dintr-o specificație validată; nimeni nu trimite SQL liber prin UI.

Seturile de date sunt `all`, `da`, `contracts`. TED nu este încă un set aditiv: aceeași atribuire poate exista și în SEAP. Măsurile includ valoare, număr și valoare pe locuitor. Filtrele pot folosi ID-uri exacte, CPV, județ/UAT, perioadă, tip de autoritate, comparații, număr de oferte și date de referință. Numele liber și identitatea exactă selectată sunt lucruri diferite.

Păstrează separarea dintre draftul formularului și întrebarea executată. Un răspuns vechi nu devine rezultatul unor filtre nou editate. Rezolvarea asincronă a etichetei unui ID nu trebuie să marcheze întrebarea ca modificată. Un query național costisitor nu trebuie să fie prima execuție automată a vizitatorului.

Căutarea CPV ignoră diacriticele și folosește sinonime; „spații verzi” trebuie să conducă și la 77310000-6. O divizie precum 45 include subdomeniile. Etichetele CPV afișează numele inteligibil, nu doar un cod. „Toți anii” și intervalele nu se rescriu arbitrar ca anul implicit.

## Întrebări salvate și autentificare

„Salvează întrebarea” stă lângă acțiunea de executare. Nu reintroduce butonul separat și jargonul „rețete” în fluxul public; termenul rămâne tehnic în unele tabele. Copiile au nume distincte pentru a evita confuzia. Întrebările pot fi încărcate, ajustate și rulate din nou. Pentru anonimi există stocare locală, fără promisiunea sincronizării între dispozitive. [Decizii și implementare](../../implementation/local-saved-questions.md).

Acțiunile „Urmărește modificările” și „Salvează în anchetă” sunt ascunse vizitatorului anonim. Descărcarea din SEAP este verificată și server-side; ascunderea unui buton nu este control de acces. Documentele deja arhivate rămân publice. Excepția 2FA este strict locală și explicită; nu o propaga în producție.

## Anchete și dovezi

Roluri owner/editor/viewer, invitații și verificări de acces pentru fiecare operațiune. Întrebările, notele, citatele, sarcinile și capturile sunt organizate într-un spațiu privat. Un link către date live nu este o captură imuabilă.

Captura păstrează selecția exactă, rândurile sursă, metoda, limitele, checkpoint-ul și hash-ul. Exporturile au manifest și proveniență; nu presupune că ZIP-ul conține automat și toate PDF-urile originale. Un citat de document se leagă de pagina corectă și de fișierul verificat. Schimbarea paginii PDF trebuie să schimbe și panoul de text/OCR.

Urmărirea privată stabilește întâi un reper fără alertă. Rulările ulterioare compară checkpoint-uri valide. Copierea unei diferențe într-o anchetă nu acordă acces la urmărirea privată a altui utilizator. Digest-urile sunt un mecanism separat, cu drepturi și proveniență; existența codului nu dovedește că SMTP sau un program de trimitere este activ pe un anumit mediu.

## Comparații

Primăriile sunt comparate automat cu cele mai apropiate 10 administrații după populația rezidentă INS/RPL 2021; comunele, orașele și municipiile sunt împreună. CJ rămân între ele. Diferențele de populație sunt afișate; utilizatorul poate adăuga/elimina manual comparatori. Membrii fără date nu devin zero și nu intră în mediană. Contextul unei comparații salvate trebuie păstrat.

Nu mapa automat o companie subordonată sau o instituție cu nume asemănător la primăria respectivă. CUI-ul, județul, rolul și SIRUTA contează. Pentru alte instituții există comparația prin activitate, explicată separat. Bugetul suplimentar ca filtru a fost discutat, fără a fi promis ca implementat.

## UI/UX și feedback

Identitatea forest-green/ivory, fonturile existente, tema deschisă/închisă și componentele aprobate sunt deliberate. Preferă informația progresivă: rezumat scurt, explicație la cerere, surse clare. Nu umple partea superioară a paginii cu paragrafe repetitive.

Dialogurile nu își schimbă violent înălțimea în timpul căutării; cererile vechi nu suprascriu rezultatele noi. Drawer-ul are feedback vizibil de încărcare. Tabelele lungi sunt paginate; admin folosește 10 rânduri/pagină. Sumele sunt aliniate la antet și păstrează accesul la valoarea exactă, nu doar abrevierea în milioane.

Meniul principal primește doar un indiciu că există un cookie de sesiune (`getSessionCookie`, fără căutare în bază și fără token trimis clientului); sesiunea confirmată în browser decide. Pagina principală verifică sesiunea pe server și transmite doar da/nu; este `force-dynamic`, cu `Cache-Control: private, no-store`.

Derularea la navigare folosește `experimental.appNewScrollHandler` (`apps/web/next.config.mjs`). Handlerul implicit din Next 16.2 pornea de la primul nod al segmentului; în producție acela este un `<script>`/stylesheet mutat de React în `<head>`, așa că handlerul renunța și pagini ca `/semnale` sau `/domenii` se deschideau la poziția de derulare a paginii anterioare. Verificat local pe build de producție: navigarea înainte începe sus, „Înapoi” restaurează poziția, ancorele `#` funcționează. La un upgrade Next, retestează înainte să scoți opțiunea. Un link care schimbă doar parametrii paginii curente (paginare, filtre) trebuie să aibă `scroll={false}` dacă cititorul trebuie să rămână pe loc; altfel urcă la începutul paginii.

Feedbackul poate fi trimis anonim, fără nume/email impus. Este vizibil în secțiunea separată de admin; administratorul poate șterge individual intrări. Nu expune mesajele de feedback printr-un endpoint public.

## Lucrări exploratorii și cercetare

`feat/ce-bate-la-ochi` conține explorarea editorială cu hartă de județe și povești. Branch-ul separat a fost cerut explicit. Nu reintegra automat componentele sau articolele în main și nu publica acuzații pentru a completa o machetă.

Cercetările watchdog au fost mutate pe 12 octombrie în afara depozitului (care este public), în `../seap-research/docs/research/20261011-watchdog{,-round2}/`, cu dovezile în `../seap-research/.local/`; conțin nume de persoane și nu se versionează. Runda 2 are 18 rapoarte (9 povești, 9 achiziții neobișnuite) și 3 revizii independente. Promptul și `DATA-CAVEATS.md` sunt obligatorii înaintea reutilizării concluziilor. Rapoartele sunt piste cu limite și surse, nu constatări juridice. Au scos la iveală chiar defectele de date reparate în intervenția curentă.
