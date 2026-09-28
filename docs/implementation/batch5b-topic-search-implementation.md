# 5B — căutare de subiecte în aplicație (local)

28 septembrie 2026. Integrare autorizată pentru testare locală, în branch `work/topic-search`; nu reprezintă deploy în producție. Mockupul separat rămâne în `mockups/topic-search/`. Utilizatorul a solicitat ulterior commitul tuturor modificărilor locale, inclusiv mockup, implementare, ajustări și documentație; fără push/deploy.

## Fluxul utilizatorului

- Câmpul de pe homepage și căutarea globală trimit la `/cauta?q=…`. Sugestiile rapide de instituții/firme rămân disponibile.
- `/cauta` caută în titlurile achizițiilor directe acceptate și ale contractelor din mart, în paginile documentelor publice deja procesate, respectiv în nume/CUI. Nu trimite cereri SEAP.
- Județ/localitate din typeahead, interval inclusiv de ani sau toți anii implicit, achiziții directe/contracte/toate, toate cuvintele/expresie în ordine.
- Potrivire PostgreSQL full text `simple`, fără diacritice, cuvinte complete. Expresia păstrează ordinea, ignoră punctuația; nu este o comparație byte-for-byte și nu promite căutare semantică, sinonime tematice sau toleranță la greșeli. Aliasurile existente „primăria”, „CJ” sunt reutilizate pentru entități.
- Taburi distincte, previzualizări în Toate, câte 10 rezultate pe pagină, URL partajabil și istoric Back/Forward. Numerele categoriilor nu se adună într-un număr de achiziții distincte.
- Documentul deschide contractul și pagina exactă în readerul existent; acesta are deja selecție de pasaj și salvare server-side într-o anchetă cu permisiuni verificate. PDF-ul arhivat poate fi deschis public. Căutarea nu pregătește fișiere și nu schimbă controalele de autentificare pentru preluarea SEAP.
- Erorile nu sunt prezentate drept zero rezultate. O nouă căutare păstrează înălțimea rezultatelor anterioare și le etichetează cu selecția completă a ultimei căutări încheiate: expresie, loc, ani, tip, mod de potrivire, categorie, rol și pagină. Tabul activ, rezultatele, rolul, paginarea și linkul copiat folosesc `data.scope`, nu selecția încă neîncheiată. Navigarea între rezultatele păstrate este dezactivată în timpul încărcării sau după eroare; formularul și reîncercarea permit continuarea.

## Semantica geografică și de acoperire

Catalogul `reference.uat` are 3.181 municipii, orașe/comune și București în copia locală; **nu are un catalog distinct de sate**. Nu s-au inventat sugestii sau asocieri. Județele folosesc județul cumpărătorului, localitățile folosesc `reference.authority_uat`; instituțiile fără asociere UAT pot lipsi din filtrul local. Acest lucru apare în explicația extensibilă, nu ca avertisment permanent sub filtre.

Data este data finalizării achiziției directe / data contractului. Documentele moștenesc selecția contractului legat, nu anul publicării PDF-ului. Filtrarea entităților cu o geografie/perioadă/tip cere activitate în achizițiile corespunzătoare: un furnizor din alt județ poate apărea dacă a furnizat instituțiilor din selecție.

Contractele sunt deduplicate după `contract_id`; lista furnizorilor este păstrată și valoarea integrală apare o singură dată. Valorile rămân `numeric` în DB și șiruri zecimale în API/UI. Nu sunt plăți și nu se formează un total financiar din rezultatele documentelor. Populația contractelor moștenește regulile martului existent (inclusiv valuta RON și tratarea acordurilor-cadru), nu toate anunțurile publicate în SEAP. Atribuirile TED rămân o perspectivă separată, nu sunt adăugate din nou.

Fișierele sunt asociate prin identitatea procedurii + autoritate; fără potrivire pe titlu. Pot privi mai multe loturi. Achizițiile istorice fără titlu sunt păstrate pentru filtrele de activitate, dar nu pot apărea la potrivirea după titlu. Numărul titlurilor căutabile din întreaga arhivă este public în explicația căutării; lipsa unui titlu nu este înlocuită cu o denumire inventată din CPV.

Un fișier cu mai multe pagini găsite este un rezultat de document cu legături la fiecare pagină. Fișierele neprocesate nu intră în potriviri. Acoperirea privește numai metadatele arhivate și legate de selecție, nu toate fișierele SEAP.

## Implementare și operare

Migrația **0039** introduce `marts.topic_acquisitions` și `marts.topic_search_state`, cu schema Drizzle și snapshot generate. Nu modifică istoricul anterior. Indexurile includ GIN full text și furnizori, plus autoritate/geografie/procedură. Migrația **0040** adaugă numărul de titluri disponibile, după constatarea că importurile istorice pot avea `raw_id` nul. Migrația 0039 deja aplicată nu a fost rescrisă. Schema nouă a fost aplicată numai bazei locale.

```sh
DATABASE_URL=postgres://seap:seap_dev@127.0.0.1:5432/seap \
  pnpm --filter ingestion index-topics
```

Construiește exclusiv proiecția pentru căutare din marts/core/raw/reference, fără normalizare, risc, trafic de sursă sau mutații private. O tranzacție și un advisory lock serializează înlocuirea; la eșec se restaurează și datele, și indexurile precedente. Indexurile (inclusiv cheia primară) se construiesc după bulk load; menținerea GIN per rând la primul import s-a dovedit prea lentă și prima încercare locală a fost anulată curat înainte de relansarea optimizată.

Căutările au timeout SQL de 15s și cer restrângerea condițiilor când selecția este prea largă. Nu trimit răspunsuri cu rezultate tăiate prezentate drept complete. Pagina este limitată la 1.000 (10.000 de rezultate navigabile); restrângerea filtrelor este necesară peste această limită.

`index-search` pregătește acum și titlurile, apoi entitățile Meilisearch. Etapa `search` din procesarea coordonată a fost legată de aceeași funcție: mentenanța rămâne activă dacă aceasta eșuează. Această integrare este cod local, **nu o modificare a programului activ de producție**. Costul primei pregătiri și al reconstruirii complete trebuie inclus în planul deploy-ului. Nu declanșa procesarea de noapte pentru a testa interfața.

## Limite față de mockup

Nu se transferă anchetele demonstrative din localStorage. Salvarea citatului folosește anchetele reale. „Urmărește căutarea” nu este afișat: motorul existent de monitorizare urmărește întrebări/selecții înghețate, iar suportul acestui nou tip de căutare ar necesita o integrare distinctă; nu simulăm notificări active.

Documentele sunt căutate în textul public din PostgreSQL la cerere. Catalogul local are doar două documente procesate; acest acces nu este încă un index național de pagini OCR. Extinderea la multe milioane de pagini va necesita indexarea lor și un refresh legat de worker.

## Verificare

- `pnpm --filter web typecheck`
- `pnpm --filter ingestion typecheck`
- `pnpm --filter web exec vitest run lib/topic-search/shared.test.ts lib/documents/documents.test.ts`
- Integrare reală PostgreSQL într-o bază izolată `seap_test_topic_search`, prin `TEST_TOPIC_DATABASE_URL`: deduplicare, precizie zecimală, perioadă inclusivă, localitate vs județ, activitatea furnizorilor, aliasuri/CUI, documente/pagini, lipsa wildcard-urilor accidentale, rollback complet la eșecul indexării.
- Browser local: `pnpm --filter web exec node scripts/topic-search/check-browser.mjs`. Folosește Chrome local, blochează orice origine externă și nu apasă acțiuni de preluare. Capturi/raport în `.impeccable/review/topic-search-live/` (ignorate în Git).

### Rezultate locale măsurate, 28 septembrie 2026

- Indexarea locală completă s-a încheiat: **20.553.037 rânduri**, dintre care **16.068.616 cu titlu căutabil**, dimensiune raportată **6.424 MB**, durată **988 secunde (16m28s)**; `builtAt=2026-09-28T12:49:20.937997Z`.
- Aplicația rulează la `http://localhost:3000` cu `DOCUMENTS_ENABLED=false`. Indexarea și verificarea folosesc arhiva locală; nu au pornit colectorul, workerul de documente sau procesarea nocturnă, nu au accesat SEAP și nu au modificat operațiunile de producție. Branchul `work/topic-search` rămâne necomis; nu s-a făcut deploy.
- Căutarea locală „locuri de joacă” a returnat **1.400** de achiziții. O cerere API cu cache-urile încălzite a durat **0,624s**; este o observație punctuală, nu benchmark sau garanție de latență.
- „iluminat” a găsit un fișier, **HC 127**, cu potriviri pe paginile **4, 5 și 7**. Acoperirea locală observată este **9 fișiere cunoscute, 2 procesate, 28 pagini căutabile**; aceste numere nu descriu acoperirea națională.
- Buildul și verificările de tipuri web/ingestion/db au trecut. Buildul de producție și verificarea de tipuri web au trecut și după corecția finală de stare; preview-ul local `/cauta` a răspuns HTTP 200 după build. Acest build local nu este deploy.
- Au trecut **25 de teste**: **12 de integrare PostgreSQL**, **6 shared**, **7 documents**. Testele de integrare au rulat efectiv în baza izolată, nu au fost omise. Baza de test a fost eliminată după verificare.
- Prima verificare în browser a trecut **37 de verificări**. Repetarea după corecția de stare a trecut **52 de verificări**, fără erori JavaScript și fără cereri externe. Include navigare, URL/Back, geografie, ani inclusivi, reader la pagina potrivită, mobile, stare goală, păstrarea înălțimii și selecția exactă a rezultatelor păstrate când schimbarea paginii/tabului/localității eșuează. Raportul `verification.json` și capturile actualizate sunt în `.impeccable/review/topic-search-live/`, inclusiv `retained-error-desktop.png` și `retained-error-mobile.png`. Sunt dovezi locale pe date reale, nu certificare de producție sau audit complet de accesibilitate.

### Documentarea vizuală și review

Aceasta este o extensie a interfeței existente. `PRODUCT.md`, `DESIGN.md` și `.impeccable/design.json` au fost comparate cu implementarea și păstrate fără modificări. Paleta forest/ivory, temele, Bricolage/IBM Plex, rândurile deschise și readerul de dovezi rămân reperele. Detaliile acestei suprafețe sunt în [fișa `/cauta`](../../.impeccable/surfaces/apps-web-app-cauta-page-tsx.md). Nu există rastere noi sau generate; iconurile folosesc sistemul SVG existent.

Reviewerul independent nu a identificat defecte vizuale materiale, dar a găsit o eroare de adevăr al stării: etichetele unei selecții încărcate sau eșuate puteau descrie incorect rezultatele anterioare păstrate. Corecția leagă prezentarea și copierea de selecția ultimei cereri încheiate și dezactivează navigarea rezultatelor în așteptare/eroare; cele 52 de verificări includ confirmarea corecției. Verdictul final este **SHIP** pentru corecția evaluată, fără remedieri deschise; raportul se află în `.impeccable/review/topic-search-live/finish-review.md`. Reviewerul independent a fost un agent generic substituit rolului specializat indisponibil. Documentarea a folosit aceeași substituție generică, pe baza instrucțiunilor `degraded/documenter.md` și `document.md`.

Detectorul a raportat **15 constatări**: sublinierea activă este **un fals pozitiv** față de convenția existentă, iar **14 sunt recomandări de rampă tipografică/raze**. Dimensiunile locale și razele mici ale marcajelor/contoarelor sunt documentate ca alegeri ale rutei, fără a deveni tokenuri globale și fără a modifica sistemul pentru a elimina artificial constatări. Divergențele canonice preexistente rămân în afara acestei extensii.

## Ajustare locală — conturul de focus al localității

Utilizatorul a semnalat conturul portocaliu desenat în interiorul câmpului „Unde cauți?”. Stilul global de focus se aplica inputului, iar containerul avea un al doilea contur verde. Containerul preia acum conturul global (3px portocaliu, offset 4px) numai când inputul este focalizat; inputul nu mai desenează contur separat. Butonul de ștergere păstrează propriul indicator de tastatură. Verificarea locală acoperă desktop/mobil, ambele teme și Tab către ștergere; capturi în `.impeccable/review/topic-focus/`. Modificare exclusiv CSS, fără mutații de date sau deploy.
