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
| Pagina principală | Întrebări/teme ilustrate, intrare accesibilă în date | `apps/web/app/page.tsx`, `PRODUCT.md`, `DESIGN.md` |
| `/intreaba` | „Întreabă”: casetă de text liber → „Am înțeles așa” (întrebare editabilă) → răspuns și surse; exemple pe obiective; constructorul pas cu pas și cele 13 modele rămân secundare | `apps/web/app/intreaba/`, `apps/web/lib/ask/`, `apps/web/lib/intent/` |
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

### Întrebări în cuvintele omului (22 octombrie 2026)

Decizia proprietarului: întrebarea liberă este înțeleasă de **reguli deterministe**, nu de un model de limbaj; textul nu pleacă la un serviciu extern. `apps/web/lib/intent/` conține interpretorul (`rules.ts`, contractul `QuestionInterpreter` din `types.ts`, prin care un interpretor LLM se poate adăuga ulterior fără a schimba API-ul sau UI-ul), maparea la `AskSpec` validată cu `validateSpec` și propoziția în română (`to-spec.ts`). Vocabularul este cel din `/api/suggest`: interogările au fost mutate în `lib/intent/vocabulary-queries.ts`, iar răspunsul `/api/suggest` a rămas același. Localitățile vin din `reference.uat` (plus sectoarele din catalogul RPL 2021), cu numele oficiale cu diacritice.

`GET /api/intent?q=…` (maximum 300 de caractere, tranzacție read-only cu `statement_timeout` 1,5 s, buget de 4 s care oprește căutările rămase, cache în proces 10 minute) întoarce interpretarea (intenție din cuvinte-cheie, subiect CPV/sinonim, loc, tip de instituție, instituție/firmă/persoană doar la potrivire puternică, perioadă relativă la data curentă, cuvintele neînțelese, încredere), `spec` sau `null`, propoziția și alternative gata de rulat. Măsurat local pe `seap`: 15–110 ms pentru întrebări obișnuite; întrebările despre persoane (ONRC) ~400 ms.

Reguli care nu se negociază (revizuite 22 octombrie după review-ul `rules-v2`):

- **Identități:** o persoană, o instituție sau o firmă este aleasă automat numai dacă registrul are exact una cu acel nume. Persoanele se caută după numele exact (ambele ordini, diacritice tolerate; „Maria” nu este „Marian”) și se numără toate identitățile ONRC; mai multe → listă de alegere (cu anul și locul nașterii, dubluri identice comasate), marcată „parțială” cu legătură de căutare când sunt mai multe decât cele afișate. Instituțiile și firmele vin dintr-o căutare proprie (`entityCandidates`) care nu comasează entitățile cu același nume și le numără; un nume parțial („Spitalul Județean”) sau purtat de mai multe entități („Compania de Utilități Publice”, „Proactiv”, „Erbașu”) devine alegere, iar `spec` este `null` până la alegere.
- **Locuri înaintea subiectelor:** numele de localități și județe (și cele din mai multe cuvinte: „Alba Iulia”, „Satu Mare”, „Turnu Măgurele”) sunt citite înaintea domeniilor CPV; cuvintele de instituție (primărie, direcție, colegiu, spital, școală…) și cuvintele generice („lucrări”, „servicii”) nu devin niciodată domenii; o etichetă din catalog trebuie să înceapă cu cuvântul scris. Un nume de localitate ambiguu (două comune „Sălcioara”) devine alegere. „Buzău” singur este județul (alternativă: „Doar primăria Municipiului Buzău”); o localitate are alternativa „Tot județul X”.
- **Localitatea înseamnă primăria:** `uatSiruta` acoperă numai administrația locală a UAT-ului (`uatScopeCaveat`), iar propoziția spune „primăria …”. Pentru „ce instituții din X”, schimbarea pe instituții, școli, spitale, consiliul județean și pentru semnale/risc interpretorul folosește județul și o spune; profilurile de risc nu primesc niciodată o localitate, nici prin alternative. `sentenceScopeProblems` (`lib/intent/scope-check.ts`) verifică în teste că fiecare propoziție spune locul, tipul de instituție, sursa de date și perioada pe care le rulează specificația.
- **Perioade:** anii viitori sunt refuzați; „anul trecut”/„anul acesta” folosesc calendarul din București; cache-ul `/api/intent` are cheia pe data din București și `max-age=60`.
- Cuvintele neînțelese sunt afișate, nu ignorate. O întrebare din care s-au înțeles doar valori implicite („<script> cine câștigă”) primește „Nu am înțeles”, nu un răspuns național.
- În constructor, o localitate pe o întrebare care nu o poate aplica (hartă, comparație, relații, risc) apare ca eroare de validare, nu este purtată în tăcere.

Setul de regresie al review-ului (123 de formulări) se rulează cu scripturile din raportul de predare; pe copia locală: 0 nepotriviri propoziție–specificație din 463 de specificații și alternative emise.

Selectorul de loc din constructor oferă și localități (municipiu/oraș/comună/sector) acolo unde motorul le aplică: clasament (fără dimensiunea județ), total, evoluție, schimbare între ani, „pe ce se duc banii” și liderul după valoare. Harta, clasamentele pe județe, comparațiile, relațiile și profilurile de risc oferă doar județul și explică de ce (`localityScopeSupport` în `question-ui.ts`). Legăturile `/intreaba?q=…` (de exemplu din căutarea de pe prima pagină) deschid interpretarea, nu răspunsul direct. Un link `?spec=` nu mai derulează pagina la răspuns și păstrează `dataset`; județul rezolvat apare cu diacritice.

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

Feedbackul poate fi trimis anonim, fără nume/email impus. Este vizibil în secțiunea separată de admin; administratorul poate șterge individual intrări. Nu expune mesajele de feedback printr-un endpoint public.

## Lucrări exploratorii și cercetare

`feat/ce-bate-la-ochi` conține explorarea editorială cu hartă de județe și povești. Branch-ul separat a fost cerut explicit. Nu reintegra automat componentele sau articolele în main și nu publica acuzații pentru a completa o machetă.

Cercetările watchdog au fost mutate pe 12 octombrie în afara depozitului (care este public), în `../seap-research/docs/research/20261011-watchdog{,-round2}/`, cu dovezile în `../seap-research/.local/`; conțin nume de persoane și nu se versionează. Runda 2 are 18 rapoarte (9 povești, 9 achiziții neobișnuite) și 3 revizii independente. Promptul și `DATA-CAVEATS.md` sunt obligatorii înaintea reutilizării concluziilor. Rapoartele sunt piste cu limite și surse, nu constatări juridice. Au scos la iveală chiar defectele de date reparate în intervenția curentă.
