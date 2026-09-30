# Reluare după compactare — 30 septembrie 2026

**Notă ulterioară:** loturile descrise aici au fost publicate și tranziția calendarului a fost încheiată în producție la 30 septembrie. Vezi [raportul final](../implementation/release-20260930.md). Condițiile pending de mai jos sunt istorice; nu relansa procesarea one-off. Copia locală rămâne nereprocesată.

**Actualizare Git ulterioară:** proprietarul a cerut commit pentru toate modificările. Acest checkpoint este inclus în commit-ul de consolidare de pe `fix/acquisition-details-dates`; referințele de mai jos la HEAD8935af5 și fișiere necomise sunt fotografia anterioară. Consultă `git log -1` pentru commit-ul actual. Fără push/deploy.

Acesta este checkpoint-ul sesiunii, nu o instrucțiune de deploy. Cererea finală a proprietarului este să salvăm contextul. Ultimele ajustări cerute sunt terminate local; nu există o implementare nouă de pornit automat după compactare.

## Repository și medii

- Branch verificat: `fix/acquisition-details-dates`; HEAD `8935af5` (`docs: record verified Explore and saved questions release [skip ci]`). Multe modificări și fișiere noi sunt încă **necomise**, inclusiv loturile de mai jos. Nu le elimina și nu le suprascrie.
- Niciun commit/push/deploy în această etapă. Cererile vechi de publicare au fost executate în etapele lor și nu reprezintă o cerere nouă de publicare a acestui branch.
- Ultima confirmare documentată de producție: aplicație `137b4e5`, 28 septembrie, [release](../implementation/release-20260928-explore-saved-questions.md). Producția nu a fost reverificată în acest checkpoint. Tabelele de stare din handover datate 28 septembrie dimineața sunt mai vechi decât acel release.
- Director de lucru: `~/Desktop/Personal/code/seap`.
- Node22: `~/.nvm/versions/node/v22.22.2/bin`; pnpm9.4 launcher: `~/.cache/node/corepack/v1/pnpm/9.4.0/bin/pnpm.cjs`.
- Dev pe `http://localhost:3000`, proces listener observat `16949` la checkpoint. Lansarea folosește `WATCHPACK_POLLING=true NEXT_DIST_DIR=.next-explore-dev DOCUMENTS_ENABLED=false`, Next dev cu `--webpack --port 3000`. Watcherul nativ servise cod/CSS vechi; polling a rezolvat. Nu opri procesele altor proiecte. În general serverul poate rămâne pornit.
- DB principală locală este arhiva mare a utilizatorului. Fără teste seed/truncate aici; fixtures de scriere exclusiv în baze noi `seap_test_*`. Bazele temporare ale loturilor încheiate au fost eliminate. Nu porni colectori/workeri SEAP/documente/scheduler pentru verificări UI.
- Chrome local: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; Playwright importabil din `apps/web/node_modules/playwright-core/index.mjs`.
- Build-urile de verificare s-au făcut cu directoare `.next-...-check` separate și apoi curățate, inclusiv include-urile lor din `apps/web/tsconfig.json`. Păstrează include-urile existente pentru `.next-explore-dev` și celelalte medii de dezvoltare.

## Condiția critică de publicare

**Nu publica întregul branch ca pe un simplu deploy UI.** Corecția calendarului introduce `rf-2026.6`, față de baseline-ul vechi `rf-2026.5`. Arhiva locală și producția NU au trecut prin reprocesarea completă de tranziție; datele materializate și indexul încă pot avea zilele vechi.

Prima publicare cere procedura coordonată: backup verificat, mentenanță, migrații, procesare `scope: full` cu noul calendar și risc, refacerea indexului de căutare, validare și redeschidere. O simplă publicare urmată de procesarea zilnică ar refuza baseline-ul vechi și ar lăsa mentenanța activă. După tranziție rămâne programul agreat: zilnic date/statistici/Radiografie, risc duminică la 05:00, Europe/Bucharest. Nu începe această operațiune fără o cerere aplicabilă a proprietarului.

Migrațiile0042–0044 sunt deja aplicate LOCAL, 45 intrări în istoric; păstrează fișierele/checksum-urile. Detalii în [calendar](../implementation/acquisition-details-calendar.md) și [signal lookup](../implementation/signal-timeout.md).

## Ce s-a terminat local

### Detalii și calendar

[Document](../implementation/acquisition-details-calendar.md). `/achizitii/[id]` afișează datele normalizate chiar fără brut, CPV ca titlu de rezervă declarat, valori exacte și link SEAP. Contractele păstrează precizia și proveniența CPV/cotelor. Ziua civilă a achizițiilor este Europe/Bucharest în builder-ele de marts/risc/Radiografie/inventar; nu reparăm printr-un +1 zi în UI. Core și dovezile înghețate rămân intacte.

Validări consemnate: 67 teste web, 93 unitare ingestion și 13 integrări PG; TypeScript, build și browser desktop/mobil/light/dark. Nu confunda validarea pe baze izolate cu reprocesarea arhivei principale.

### Limbajul semnalelor și alinierea valorilor

[Document](../implementation/risk-language.md). Semnalele sunt piste, nu acuzații; definițiile celor 13 semnale sincronizate, formularea pragurilor și CRI explicită (5 indicatori pentru autorități, 4 pentru furnizori). Reprezentarea ONRC nu este etichetată drept control/acționariat. Sumele înregistrate nu sunt plăți. Coloana numerică din tabelele de surse are antetul aliniat la dreapta. 54 teste, TypeScript/build/browser consemnate.

### Timeout `/semnale`

[Document](../implementation/signal-timeout.md). `marts.signal_lookup` este o vedere materializată completă, fără sampling ascuns. Citirile surselor late se fac după paginare. Refresh + analyze în tranzacția builder-ului zilnic și după risc duminica. `validateSignalLookup` verifică integral corespondența înainte de publicare.

2.417.827 rânduri, zero diferențe în verificarea locală integrală (44,7s); citiri DB măsurate 1,35–6,14s. 36 teste web + 11 integrări ingestion, types/build/browser trecute. Limita web de 20s nu a fost crescută. **Redesignul listei rămâne amânat**; cele 50 de rânduri nu au fost schimbate în acest lot.

### Intenția căutării

[Document](../implementation/search-intent.md). Potrivirile puternice de nume/CUI ale instituțiilor sunt vizibile înaintea contractelor; linkuri distincte „Vezi instituția” / „Toate achizițiile”, alternative cu CUI. Aliasuri administrative, fără comasarea identităților cu nume identic, fără schimbarea tacită a categoriei/filtrelor. Mobil: patru categorii 2×2, filtre secundare pliabile și rezumat activ. 22 teste (16 integrări PG), types/build/browser trecute.

### Explorează: surse, exporturi și fișiere

[Document principal](../implementation/answer-actions.md). Un singur acces principal la sursele răspunsului; eliminat surplusul „Verifică tu”/„Deschide sursele”/„Verificabil, până la sursă”. „Cum s-a calculat” înaintea vizualizării; „Exportă” grupează rezultatul afișat și sursele exacte. Acțiunile locale de pe bare/rânduri păstrează selecția proprie.

- `AskPanel.tsx`, noul `AnswerExports.tsx`, `question-results.css`.
- `lib/ask/source-csv.ts`: helper comun cu drawerul; tratează JSON cu HTTP200 ca eroare, verifică headerele de numărători, indică exportul parțial și păstrează zecimalele. Limita existentă:100.000 rânduri. Teste în `source-csv.test.ts`.
- Numerele pentru contracte/proceduri se numesc **înregistrări**, nu contracte distincte: un contract cu mai mulți câștigători poate avea mai multe rânduri. Top N nu este populația completă.
- `ContractFiles.tsx`: căutarea/citarea sunt invitate numai pentru text pregătit; starea fără asociere suportată are linkul oficial disponibil, fără afirmația că SEAP nu conține fișiere. Ancora `#fisiere` are scroll margin120px pentru antetul fix.
- 41 teste, TypeScript/build și browser cu CSV real/verificarea identității exporturilor, desktop/mobil/light/dark; erorile/parțialitatea simulate doar în rețea. Build-ul a trecut înainte de micile ajustări ulterioare de loading/default/font.

### Drawer: încărcare vizibilă

`EvidenceDrawer.tsx` + `evidence-drawer.css`: bandă cu spinner și status sub antet, în afara scrollului; scheletul listei la prima încărcare. La filtrare/paginare păstrează tabelul anterior estompat și `inert`. După 8s explică așteptarea, fără procent inventat. Exporturile rămân disabled până există rezultat. Nu afișează prematur „Nicio înregistrare”. Închidere/Escape, anularea cererii și retry după eroare păstrate. `role=status`, `aria-busy`, reduced motion.

TypeScript și 16 verificări browser trecute, pe răspuns local cu latență/eroare simulate. Probe: `.impeccable/review/drawer-loading-20260930/`; harness `/tmp/seap-drawer-loading.mjs` (temporar, nu necesar produsului).

### Întrebarea implicită rapidă și încadrarea ei

Ultimele două cereri ale proprietarului, **terminate**:

1. `defaultQuestion()` în `lib/ask/question-ui.ts` nu mai introduce anul precedent; top10 furnizori, toate fluxurile, `filters: {}`. Textul existent afișează **„toți anii disponibili”**. Se folosește `marts.agg_top_entities` existent, nu o scanare anuală. Linkurile și întrebările salvate își păstrează perioadele. Intrarea pe `/intreaba` fără parametri doar pregătește întrebarea; „Vezi răspunsul” o execută. Linkul cu `spec` se execută automat.
2. `explore-compact.css`: titlul desktop32→30px. Întrebarea implicită, inclusiv `?`, încape pe un rând la1200/1280/1440px. La1024 se împachetează firesc; mobilul rămâne26px. Nu folosi `nowrap` global sau text tăiat pentru a forța nume lungi. **Butonul „Toate întrebările” și stilul său sunt păstrate**, cerință explicită a proprietarului.

38 teste existente ale constructorului actualizate/trecute și TypeScript trecut. Browser: rezultat real implicit (139ms calcul în ultima probă; anterior59ms/116ms răspuns HTTP, nu SLA), permalink2025 cu răspuns interceptat și perioada păstrată. CSS verificat la320/390/1024/1200/1280/1440px, fără overflow. Probe `.impeccable/review/question-line-20260930/`. Niciun nou build complet pentru simpla ajustare CSS; verificarea relevantă a fost în browser.

## Probe și scurtături pentru reluare

- Audit original: [raport](../reviews/reddit-skeptic-20260929/report.md), persona și evaluări în același dosar. Identitatea vizuală a fost aprobată pentru păstrare.
- Capturi/rezultate ignorate de Git: `.impeccable/review/` cu directoare pentru fiecare lot (answer-actions, search-intent, signal-timeout, acquisition-details, drawer-loading, question-line).
- Harness-uri temporare: `/tmp/seap-answer-browser.mjs`, `/tmp/seap-files-anchor.mjs`, `/tmp/seap-drawer-loading.mjs`; nu se presupune că `/tmp` persistă și nu trebuie comise.
- Întrebare locală mică pentru testarea reală a surselor: `{block:'stat',measure:'value',dataset:'da',filters:{authorityId:2144364,yearFrom:2026,yearTo:2026,monthFrom:7,monthTo:7}}`. Ultima verificare:4rânduri/588500lei. Nu folosi `filters.year` sau `limit` în spec; câmpurile sunt `yearFrom/yearTo` și `topN`.
- Permalink: `/intreaba?spec=` + encodeURIComponent(base64(JSON.stringify(spec))). Păstrează validarea existentă.
- Fișiere locale: `/contracte/107706970#fisiere` pentru lipsa unei asocieri suportate; `/contracte/107063311#fisiere` pentru documentul deja arhivat. Nu apăsa butoane care pornesc descărcarea SEAP pentru teste UI.
- Pentru testele de latență/eroare, interceptează cererile Playwright; nu modifica baza și nu declanșa național/anual repetat doar pentru capturi.
- Skill Impeccable a fost citit și contextul încărcat în această sesiune. PRODUCT/DESIGN reprezintă identitatea existentă. Nu relansa contextul în aceeași sesiune după compactare. Nu există subagent activ necesar continuării; nu relua agenții vechi listați în mediu.

## Ce urmează numai la cerere

- „Despre proiect și corecturi”: următoarea propunere din audit, dar încă neîncepută. Operatorul și contactul trebuie furnizate/confirmate de proprietar, nu inventate.
- Redesign `/semnale`: ulterior aprobat și implementat local, varianta A. [Starea actuală și verificări](../implementation/signals-redesign.md). Nu mai este sarcină în așteptarea alegerii layoutului.
- Clasamente precalculate **pe ani**: doar propunere ulterioară pentru întrebările anuale, nu implementată prin schimbarea defaultului.
- Citare durabilă și explicații compacte ale acoperirii: ulterior.
- Dacă proprietarul cere commit/push/deploy, revizuiește **toate** modificările necomise și pregătește concret tranziția operațională de mai sus. Nu presupune că branch-ul conține numai ultimele trei ajustări UI.

Nu este nevoie să repeți toate verificările deja trecute după compactare. Reia documentul relevant sarcinii următoare, verifică starea curentă și continuă de acolo.

## Continuare ulterioară checkpoint-ului: întrebări fără cont

Cerere nouă implementată local: [întrebări locale și acțiuni autentificate](../implementation/local-saved-questions.md). Folosește acest document pentru comportamentul actual; nota de release din28septembrie despre refuzul salvării anonime descrie vechea versiune. 53 teste, types/build și24verificări browser trecute. Fără commit/push/deploy. Niciun alt element din backlog pornit.

## Continuare: feedback anonim

După commit-ul de consolidare `07eaee8`, proprietarul a cerut raportare anonimă fără afișarea vreunui nume public, cu inbox separat în admin și ștergere individuală de către administratori. Implementat local, încă necomis: [feedback anonim](../implementation/anonymous-feedback.md). Migrația0045 aplicată local (46intrări), Caddy/deploy actualizate pentru header client de încredere și reload verificat. Nu relua solicitarea de nume/contact. Fără schimbări în producție sau SEAP.

## Continuare: Semnale A

Proprietarul a aprobat mockupul și implementarea reală; reluată după pauză și terminată local. [Documentul implementării](../implementation/signals-redesign.md) conține comportamentul, limitele și verificările. 51 teste, 42 verificări browser, types/build trecute; fără commit/push/deploy. Review final local din cauza limitei de agenți. Baza izolată și buildul temporar eliminate; dev3000 rămâne activ.
