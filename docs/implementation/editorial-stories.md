# Ce bate la ochi — implementare editorială

**15 octombrie 2026 — în producție, numai pentru administratori.** La cererea proprietarului, funcționalitatea este pe `main` și deploy-ată, dar până la prima poveste publicată întreaga secțiune există doar pentru conturile `admin`: pentru vizitatori și watchdogi fiecare rută `/ce-bate-la-ochi/...` dă interfața not-found (noindex), iar linkul din meniu lipsește. Verificarea rolului se face pe server la fiecare cerere ([access.ts](../../apps/web/lib/stories/access.ts)); ascunderea linkului din `SiteNav` este doar cosmetică.

Poveștile în lucru **nu mai sunt în repository**. Fiecare este un fișier JSON cu un `Story` (schema din [types.ts](../../apps/web/lib/stories/types.ts)), citit la fiecare cerere din `STORIES_PREVIEW_DIR` de [preview-files.ts](../../apps/web/lib/stories/preview-files.ts). Producție: `/srv/seap/stories/*.json`, montat read-only în containerul web ca `/stories`. Copia de lucru locală: `../seap-research/docs/research/20261012-claude-stories/preview-stories/` (exportul exact al celor cinci povești din fișierele TS eliminate). Se acceptă numai `status: "preview"`; un fișier nevalid (JSON stricat, alt status, validarea `validateStory`) este omis și logat, fără să oprească secțiunea. Adăugarea sau corectarea unei povești înseamnă copierea fișierului pe server; nu cere build, deploy sau restart. Publicarea pentru toți rămâne pasul editorial din codul `published.ts`, descris mai jos.

În development (`NODE_ENV=development`) previzualizările sunt vizibile fără autentificare, dacă `STORIES_PREVIEW_DIR` indică directorul local. Testele editoriale ale conținutului real ([stories-content.test.ts](../../apps/web/lib/stories/stories-content.test.ts)) rulează numai cu această variabilă; în CI sunt omise, iar testele generice folosesc o poveste sintetică.


**3 octombrie 2026 — păstrat separat (depășit de nota din 15 octombrie):** întregul lot (implementare, machetă, propuneri, cercetare și verificări) este pe branch-ul `feat/ce-bate-la-ochi`, la cererea proprietarului. Branch bazat pe `c40becf`, cu feedbackul plutitor al colegului inclus. Reluate după separare: cele 11 teste ale poveștilor și TypeScript, ambele trecute. Fără merge în main sau deploy; pentru continuare se revine pe acest branch. PDF-urile mari și OCR-ul din `infra/data/research/` rămân locale, ignorate de Git; dosarele versionate includ referințele și hashurile lor.

2 octombrie 2026. Implementarea locală aprobată transpune [macheta editorială](../../mockups/ce-bate-la-ochi/README.md) în React / Next.js App Router. Nu este o publicare în producție. Intrarea din `SiteNav` apare după „Explorează”; ajustarea mobilă din `approved.css` acomodează cele patru destinații. Identitatea din `DESIGN.md` rămâne autoritatea vizuală.

## Traseul cititorului

Harta duce la indexul editorial al județului, apoi la povestea ilustrată, cronologie și surse. Intensitatea culorii reprezintă numărul poveștilor publicate, nu un nivel de risc. Căutarea acceptă nume fără diacritice; indexul oferă filtre tematice și ordine descrescătoare după publicare. Un județ fără povești are o stare goală explicită, fără concluzii despre achizițiile sale.

| Rută publică | Conținut |
| --- | --- |
| `/ce-bate-la-ochi` | Hartă și povești recente |
| `/ce-bate-la-ochi/judet/:key` | Poveștile unui județ, inclusiv București; cheile cu spații devin segmente cu cratimă, precum `satu-mare` |
| `/ce-bate-la-ochi/poveste/:slug` | Articol, capitole, cronologie, întrebări și dosar |
| `/ce-bate-la-ochi/poveste/:slug/surse/:id` | Fișă editorială a sursei, accesibilă direct |

Sursele se deschid și într-un dialog care păstrează locul lecturii și restaurează focusul la închidere. Fișa are adresă proprie; legăturile originale se deschid separat. Back/Forward, capitolele și copierea linkului susțin reluarea lecturii. Tranzițiile județului și ilustrației au fallback fără View Transitions și respectă reduced motion. Tema folosește infrastructura aplicației.

## Catalog și autorare

Schema este [types.ts](../../apps/web/lib/stories/types.ts), conținutul editorial este [published.ts](../../apps/web/lib/stories/published.ts), iar selecția pe server se face în [catalog.ts](../../apps/web/lib/stories/catalog.ts). `publishedStories` este momentan gol. Prima poveste reală este o previzualizare locală: [dosarul Școlii 311](../research/20261002-scoala311/README.md), cu achiziții din septembrie 2026. Nu este publicată în producție.

- `published` este vizibil în toate mediile; `draft` este ascuns întotdeauna, inclusiv la accesarea directă a articolului sau sursei.
- Poveștile fictive și fișierul `demo.ts` au fost eliminate la cererea utilizatorului. Statusul `preview` înseamnă documentare reală în lucru, cu marcaj vizibil și noindex, citită din fișierele de pe server și afișată numai administratorilor (vezi nota din 15 octombrie). Macheta statică rămâne doar arhivă de design.
- `counties` acceptă mai multe județe. Aceeași poveste este numărată o dată în fiecare județ asociat și are o singură adresă de articol.
- `Story` permite secțiuni narative cu referințe validate la surse și păstrează autorul, data publicării și opțional actualizării, introducerea, selecția constatării, cronologia, întrebările, răspunsul instituției cu referințe, metodologia și corecturile datate.

Autorarea inițială se face în fișiere din repository. Nu există editor admin, flux automat de aprobare sau previzualizare a drafturilor. Utilizatorul a confirmat explicit că editorul admin va fi construit ulterior.

## Surse și valori păstrate

Sursele sunt de tip `procurement`, `external` sau `note`, fiecare cu ID propriu și `observedAt`. Fișa de achiziție păstrează data, valoarea zecimală ca șir, moneda RON, instituția și furnizorii observați la documentare. Câmpurile opționale păstrează codul SEAP, CPV-ul, momentele publicării/finalizării (afișate inclusiv cu secunde, în ora României) și nota de proveniență. Fișele Școlii 311 au fost confruntate cu exportul public read-only din arhivă. Acesta este un snapshot editorial: nu se actualizează automat când înregistrarea publică se schimbă și nu reprezintă o copie arhivată a întregului document extern.

Referința `direct` produce legătura internă `/achizitii/:id` și legătura SEAP canonică. Referința `contract` produce `/contracte/:id` și linkul SEAP al anunțului, folosind separat `awardNoticeId`. Sursele externe acceptă numai adrese absolute HTTP(S), fără credențiale. Textul este redat ca text React, nu HTML editorial arbitrar.

Totalul include exclusiv sursele de achiziție din `finding.sourceIds`. Achizițiile de context sunt afișate separat în dosar, cu marcaj explicit că nu intră în total; la Școala 311 sunt șapte în total și trei de context. Aritmetica zecimală din `shared.ts` păstrează precizia stocată, fără însumare în virgulă mobilă. Valorile sunt contractate/înregistrate, nu plăți; suprapunerile și limitele selecției trebuie explicate în metodologie.

Validarea respinge identități/date nevalide în câmpurile verificate, județe necunoscute, referințe către surse inexistente, achiziții duplicate și selecții de total duplicate sau neeligibile. Orice poveste, inclusiv preview, cere referințe de achiziție și URL-uri externe nenule. Validarea structurală nu verifică existența înregistrărilor prin HTTP și nu certifică adevărul afirmațiilor sau calitatea reviziei editoriale.

Exemplu de **structură**, cu substituenți intenționat nevalizi; nu poate fi copiat pentru publicare și nu descrie o achiziție reală:

```ts
const sursa: StorySource = {
  id: 'achizitie-verificata', kind: 'procurement',
  title: '<titlul exact verificat>',
  observedAt: '<AAAA-LL-ZZ: data documentării>',
  date: '<AAAA-LL-ZZ: data înregistrării>',
  amount: '<valoarea zecimală exactă, cu punct>', currency: 'RON',
  authority: '<instituția din înregistrare>',
  suppliers: ['<furnizorul din înregistrare>'],
  record: { type: 'direct', id: '<ID-ul public verificat>' },
};
// În Story: sources: [sursa], finding.sourceIds: [sursa.id].
// Pentru contract: record: { type: 'contract', id, awardNoticeId }.
// Pentru presă: kind: 'external', url, publisher, summary,
// împreună cu id, title și observedAt.
```

## Publicarea în repository

1. Documentează sursele publice reale, verifică legăturile, valorile și afirmațiile și separă observațiile de interpretări. Nu importa automat anchete, acces sau dovezi private în catalogul public.
2. Construiește un `Story` tipizat, inițial `draft`, cu autor, date, județe, referințe exacte, limite, metodologie și eventual răspunsul instituției. Recitește editorial întregul articol; lipsa unui răspuns nu dovedește un refuz.
3. După verificarea editorială, include în `publishedStories` versiunea cu `status: 'published'`. Schimbarea statusului este făcută de autor/reviewer în cod; nu constituie o aprobare automată. La corecturi, păstrează explicația în `corrections` și actualizează `updatedAt`.
4. Rulează verificările relevante și urmează separat procesul autorizat de publicare al repository-ului. Introducerea locală în catalog nu este un deploy; push-ul pe `main` declanșează CI/deploy.

## Limite și verificare locală

Această funcționalitate nu introduce migrări, scrieri în DB, import din anchete private, cereri automate către surse, colectori sau workers. Linkurile SEAP/externe fac navigare numai la acțiunea cititorului. Nu a fost făcut deploy în cadrul acestei implementări locale. Ilustrațiile vectoriale și harta existente sunt reutilizate; proveniența și avertismentul GADM sunt consemnate în README-ul machetei și rămân aplicabile.

Verificare finală locală, 2 octombrie 2026: `pnpm --filter web test lib/stories/stories.test.ts` — 9 teste trecute, niciunul omis; `pnpm --filter web typecheck` și build-ul optimizat (`NEXT_DIST_DIR=.next-stories-check pnpm --filter web build`) au trecut. Directorul temporar de build a fost eliminat după verificare. Unitățile acoperă filtrarea publicării, referințele, sumele exacte, URL-urile, mai multe județe și fixture-urile.

Scriptul [editorial-stories.mjs](../../scripts/checks/editorial-stories.mjs) a trecut pe desktop și mobil: cele 42 de regiuni, tranziții efective de județ/ilustrație, filtre, reîncărcare directă, surse în tab separat, total exact, Escape/focus/scroll, capitole sub headerul fix, căutare fără diacritice, stări goale, tema întunecată, tastatură și reduced motion. Verificarea include lățimea de 320px; nu s-au observat erori JavaScript sau depășiri orizontale. Rutele inexistente afișează interfața not-found și noindex; în răspunsul streaming App Router testat, statusul HTTP este 200.

Revizia vizuală independentă a celor 12 capturi finale: **SHIP LOCALLY**, fără blocante materiale rămase. Rezultatele și raportul local sunt în `.impeccable/review/ce-bate-la-ochi-local/`. Aceste verificări locale nu sunt validare a producției, a surselor reale sau certificare completă de accesibilitate.

## Verificarea primei povești reale — 2 octombrie 2026

Nouă teste trecute după eliminarea exemplelor: inclusiv corelarea celor opt fișe cu payloadurile publice, intervalul de 99 secunde, totalul exact, subtotalul instructorilor și separarea preview/producție. Typecheck și build optimizat trecute. Verificare HTTP pe build-ul de producție pornit temporar pe loopback: atlas gol, articolul și fișa preview excluse, fără datele poveștii în răspuns. Rutele inexistente au răspuns streaming HTTP 200 cu interfață not-found; nu pretindem 404 HTTP. Serverul temporar și artefactele build au fost eliminate; aplicația de dezvoltare rămâne la 3000. Scriptul browser actualizat pentru povestea reală a trecut desktop, mobil și 320px: surse, date, total de șapte cu a opta în afara totalului, navigare, tranziții, noindex, exemple eliminate. Capturi/rezultate în `.impeccable/review/ce-bate-la-ochi-real-story/`. Revizia independentă menționată anterior privește implementarea inițială; verificarea editorială a acestui text a fost făcută de agentul principal, nu de o redacție. Solicitările către părți sunt pregătite în dosar și netrimise.

## Standard editorial cerut de utilizator — completare 2 octombrie

Poveștile trebuie să documenteze și oamenii din spatele achizițiilor: proprietari, reprezentanți, decidenți, faptele și actele care îi leagă de subiect. Pentru fiecare legătură păstrează persoana, rolul, data și sursa; nu echivala administratorul cu proprietarul, numele identic cu identitatea sau funcția publică cu semnarea unui contract. Cercetează relațiile între firme și instituții, dar publică doar ce poate fi susținut și separă pistele de constatări. O relație veche nu explică automat o atribuire actuală. Include și dovezile care slăbesc ipoteza inițială. Întrebările precise și limitele rămân vizibile; nu umple textul cu nume fără relevanță sau acuzații din alte cazuri.

[Completarea Școlii 311](../research/20261002-scoala311/oameni-si-legaturi.md) aplică acest standard: ONRC/MF primar, legătura Bosolac–M&M și două achiziții suplimentare, Daniela Sandu în documentele școlii, criteriile istorice de selecție și delimitarea rolurilor din regulament. Nu s-a demonstrat o relație personală cu școala, nu s-au trimis solicitări, nu s-a publicat în producție. Nu am modificat UI-ul sau modelul de publicare.

Validarea completării: 10 teste trecute, typecheck trecut și browser desktop/mobil/320px trecut. Achizițiile M&M au test separat pentru datele normalizate și lipsa arhivei; cele opt fișe inițiale păstrează verificarea după payload. Totalul principal rămâne 919.661,16 lei.


## A doua poveste reală — Aquapark Buzău, 2 octombrie 2026

[Dosarul](../research/20261002-aquapark-buzau/README.md) adaugă a doua previzualizare development; Școala 311 rămâne, `publishedStories` rămâne gol. Articolul combină o achiziție din septembrie 2026 cu documentare anterioară atribuită presei, auditul de conformitate, cronologia și proprietatea firmei. Include pozițiile publice și măsurile de remediere; nu prezintă factura drept prejudiciu definitiv sau cercetarea relatată în aprilie drept stadiu penal actual.

Totalul articolului include **doar achiziția de 882.174,93 lei**. Contractul principal este context. UI-ul folosește acum singularul pentru un total cu o singură înregistrare. Nu au fost schimbate schema sau publicarea.

Verificare: 11 teste editoriale trecute, TypeScript trecut; browser pentru noul articol desktop/390/320, hartă → județ → articol, opt evenimente, total exact, contract exclus din total, dialog și fișă externă, linkuri SEAP inspectate fără accesare și ambele pagini locale de achiziții deschise. Fără erori JS sau overflow în aceste probe. Rezultate/capturi `.impeccable/review/aquapark-buzau/`, script `scripts/checks/aquapark-story.mjs`. Regresia primei povești a produs raportul complet fără erori; procesul de test a necesitat oprire după scrierea raportului la închiderea browserului. Nu s-a repetat build-ul de producție; filtrarea celor două preview-uri este verificată în testele de catalog.

## Trei previzualizări noi — 12 octombrie 2026

Adăugate inițial în `local-preview.ts`, status `preview`; din 15 octombrie sunt fișiere JSON numai pe server: `antigrindina.ts` (opt acorduri-cadru AASNACP din 2 iulie 2026, 65.503.241,82 lei în plafoane), `aeroclub.ts` (două atribuiri Authentic Blue pentru salvare și stingere incendii, 29.402.778,22 lei) și `a7-buzau.ts` (acordul-cadru CNAIR nr. 1191, 49.462.662,10 lei). Totalurile sunt plafoane sau valori maxime, nu plăți; contractele de comparație rămân în afara totalului.

Documentarea de lucru nu este în repository, care este public: `../seap-research/docs/research/20261012-claude-stories/`, cu instantaneul read-only al înregistrărilor din producție. Persoanele fizice nu sunt numite. Datele de semnare sunt din `contractDate` al payloadului SEAP, în ora României: `core.contracts.contract_date` stochează miezul nopții românesc ca 21:00 UTC în ziua precedentă, iar o citire naivă a datei UTC dă o zi mai devreme. Testul nou verifică ID-urile, sumele, conversia datelor și totalurile față de instantaneu.

Verificare locală: 12 teste editoriale trecute, typecheck trecut; dev pe 3102, desktop 1440 și mobil 390 fără erori JS sau depășire orizontală. Nicio solicitare trimisă părților, nicio revizie editorială independentă, fără push sau deploy.

### Prezentare cu impact — 12 octombrie 2026

Câmpuri opționale noi în `Story`, toate validate față de sursele poveștii:

- `keyFacts`: 2–4 cifre-cheie, afișate într-un rând sub titlu (din 20 octombrie; înainte, în dreapta titlului în locul ilustrației). Sunt text de afișare; sumele trebuie să existe și ca surse.
- `visual`: o figură proprie poveștii, sub titlu. `map` colorează județele după un grup (de exemplu câștigătorul), cu `unlocated` pentru elementele fără localizare verificată. `compare` pune două documente rând cu rând; rândurile identice se unesc într-o singură celulă. `bars` desenează valori la aceeași scară. Fiecare element deschide o sursă.
- `actors`: fișe de furnizor, cu ce arată registrele (ONRC, MF) lângă valoarea câștigată și cu link către `/entitati/:id`.
- `sections[].quote`: un citat scos în evidență, cu sursă.
- `finding.groupBySupplier`: barele constatării se grupează pe primul furnizor.
- `timeline[].highlight` și `gapBefore`: momente-cheie și intervalul dintre ele.
- Citare în text: `[[source-id]]` în paragrafe, introducere și cronologie devine o notă numerotată care deschide dosarul. Listele de surse din secțiuni și cronologie sunt acum note numerotate compacte, nu câte un buton pentru fiecare document; schimbarea se aplică tuturor poveștilor.

Validarea respinge citările către surse inexistente, regiunile cu grupuri nedeclarate sau județe necunoscute, sumele nezecimale din fișe și listele goale de cifre-cheie. Cele trei previzualizări din 12 octombrie folosesc noile câmpuri; Școala 311 și Aquapark rămân neschimbate, cu note numerotate în loc de butoane. Verificare: 13 teste, typecheck, capturi desktop 1440 și mobil 390 pentru toate patru articolele, fără erori JS și fără depășire orizontală.

### Parcursul cititorului — 20 octombrie 2026

Local, pe ramura `feat/stories-reader-flow`; fără push sau deploy. Toate câmpurile noi sunt opționale, deci fișierele JSON vechi de pe server rămân valide.

**Ilustrații: o scenă desenată pentru fiecare poveste.** Cele trei desene fixe (`illustration`) se repetau: patru din cinci povești aveau același desen. O primă variantă cu coperți desenate din date (bare, hartă, ceas, linie a timpului) a fost respinsă de owner ca neatractivă, la fel ca fragmentele de document. Owner-ul a ales ilustrații: fiecare poveste are scena ei, desenată în paleta site-ului.
- `scene` este o cheie din `STORY_SCENES` ([scenes.ts](../../apps/web/lib/stories/scenes.ts)), unde stă și descrierea scenei. Validarea respinge cheile necunoscute.
- Desenele sunt componente SVG statice în [StoryScenes.tsx](../../apps/web/app/ce-bate-la-ochi/StoryScenes.tsx), pe o pânză de 640×400. Subiectul stă în x 40–600 și y 50–350, zonă vizibilă la orice decupaj (carduri 1,6:1, articol desktop 1,4:1).
- Scenele arată locuri și obiecte (autostrada, aerodromul, stația antigrindină, aquaparkul, școala cu bazin), niciodată persoane sau verdicte. Pe tema închisă sunt ușor estompate.
- O poveste nouă primește scena ei prin cod (componentă + descriere), deci printr-un deploy. Până atunci, `illustration` rămâne rezerva generică.
- În articol, scena ocupă dreapta titlului, iar `keyFacts` trec într-un rând de patru cifre sub el (două pe mobil).
- Testul de conținut cere ca fiecare previzualizare să aibă o scenă proprie, diferită de a celorlalte.

**Index.**
- `teaser` (cel mult 200 de caractere) înlocuiește pe carduri rezumatul articolului.
- Poveștile cu mai mult de două județe afișează „București și 6 județe”; lista completă apare la hover.
- `patterns` (vocabular fix în `STORY_PATTERNS`; validarea respinge cheile necunoscute) apar ca etichete și ca filtru „Tipar” în lista tuturor poveștilor. Un tipar descrie ce arată documentele, nu un verdict.

**Articol.**
- `summary` rămâne standfirst-ul, de cel mult două fraze. Testul de conținut verifică lungimea și că valorile din `keyFacts` nu se repetă în el.
- `brief` („Pe scurt”) are trei coloane: ce arată documentele, ce nu știm, ce urmează. Ultima coloană numără întrebările și starea cererilor din `requests`.
- „Povestea în timp” pune cronologia pe o scară reală. Momentele `highlight` sunt numite, iar intervalul dintre ele se calculează („după 1 an și 2 luni”). Punctele duc la intrarea din cronologie (`#t-<id>`).
- Ordinea: secțiunile cu `lead` vin înaintea constatării. `sections[].actors` mută fișele firmelor în secțiunea respectivă. Când harta grupează câștigătorii (`groupBySupplier`), ea înlocuiește barele în caseta constatării. O singură înregistrare nu mai primește o bară.
- Cuprinsul folosește secțiunile reale și arată minutele rămase. Pe mobil e un meniu „2/8 · capitol ▾”, fără derulare orizontală.
- Barele hașurate marchează plafoanele de acord-cadru. Recunoașterea se face după titlul sau nota sursei, per înregistrare, așa că un contract simplu rămâne bară plină.
- `actors[].revenue` arată raportul dintre valoarea câștigată și veniturile raportate (de exemplu „3,3× cifra de afaceri din 2025”). Raportul are o notă: plafonul poate acoperi mai mulți ani.
- Glosar ([glossary.ts](../../apps/web/lib/stories/glossary.ts)): 13 termeni explicați o singură dată, la prima apariție în ordinea lecturii, prin [StoryPeek.tsx](../../apps/web/app/ce-bate-la-ochi/StoryPeek.tsx). Hover sau focus de la tastatură deschide explicația, tap o deschide și o închide. Definițiile sunt generale, nu constatări.
- Numerele de sursă din text arată o previzualizare (titlu, sumă, dată, părți, rezumat) la hover sau focus. Click-ul deschide în continuare dosarul.
- Coloana din dreapta listează sursele capitolului curent. „Ce arată cifrele” se adaptează la lucrări, servicii sau produse, după CPV.
- Întrebările sunt grupate după destinatar (prefixul „AASNACP: …”) și numerotate continuu. `requests[].status` afișează „Cerere pregătită, netrimisă”, „trimisă”, „răspuns” sau „fără răspuns”.
- Dosarul are trei grupuri: înregistrări, documente oficiale și presă, observațiile noastre. O serie de cel puțin trei înregistrări cu aceeași dată și instituție se strânge într-un rând expandabil, cu total exact.
- Finalul cuprinde:
  - fișele firmelor (`/entitati/:id`);
  - căutarea altor achiziții ale instituției (`/cauta?q=`);
  - „Trimite o informație”, care deschide formularul anonim de feedback existent, cu pagina poveștii atașată;
  - citarea copiabilă.
- „Alte povești” se aleg după tipar comun, apoi județ, apoi temă, cu motivul afișat.

**Amânat.** Nu am adăugat o imagine de distribuire (Open Graph): cât timp poveștile sunt doar pentru administratori, crawlerele nu le pot vedea. Fonturile vin din `next/font/google`, iar generarea la cerere ar adăuga trafic extern din producție.

**Conținut.** Câmpurile noi (`scene`, `teaser`, `brief`, `patterns`, `requests`, `lead`, `actors`, `revenue`, momente-cheie) au fost adăugate numai în copia locală din `../seap-research/.../preview-stories/`. Copia dinaintea modificării este în `preview-stories-before-20261020/`. Textele reformulează doar fapte deja prezente în fiecare poveste și în sursele ei. Pe server, poveștile rămân cum erau până la copierea fișierelor.

**Verificare locală (dev, `STORIES_PREVIEW_DIR` la copia locală).**
- `vitest` web, după trecerea la scene: 465 de teste trecute, 227 omise (cer bază de date), inclusiv 22 de teste editoriale pe conținutul real.
- `pnpm turbo run typecheck lint --filter=web` a trecut.
- Capturi desktop 1440 și mobil 390, pentru index, cele cinci articole și București, fără erori JS și fără depășire orizontală; 320px fără depășire.
- Interacțiuni verificate: previzualizarea sursei, termen la click și la tap, Escape, dosarul la click, capitolul activ și coloana din dreapta, rândul expandabil cu 8 înregistrări, saltul din banda de timp, formularul de feedback, filtrul „Tipar”, meniul de capitole pe mobil, tema întunecată.
- `scripts/checks/editorial-stories.mjs` se oprește înainte de pașii de poveste, la linkul de meniu „Ce bate la ochi”: din 15 octombrie linkul este ascuns pentru vizitatorii neautentificați. Problema exista dinainte; scriptul a fost adaptat doar pentru meniul de capitole de pe mobil.
