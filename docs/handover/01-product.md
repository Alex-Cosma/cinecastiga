# Produsul și deciziile care trebuie păstrate

## Misiune și public

cinecâștigă? permite investigarea cheltuirii banilor publici din România. Utilizatorii includ persoane fără experiență în achiziții și jurnaliști de tip Recorder, RISE Project sau Snoop. Aceste organizații sunt exemple de public, nu parteneriate sau utilizatori confirmați.

Interfața trebuie să invite la explorare: întrebări inteligibile, filtre ușor de schimbat, rezultate rapide, dovezi la îndemână. „Anchete” rămâne funcționalitate centrală. O analiză nu este suficientă dacă utilizatorul nu poate deschide înregistrările care o compun și verifica suma.

Principiul repetat explicit de proprietar: **„Poți verifica fiecare leu.”** Asta înseamnă selecție exactă, totaluri explicate, paginare, export și linkuri SEAP/TED. Nu justifică promisiuni de completitudine inexistente.

## Reguli semantice

- Contractul înregistrat nu dovedește plata, livrarea sau executarea integrală.
- Titlurile, etichetele și avertismentele numesc sumele „valoare contractată” sau „valoare înregistrată”, nu „cheltuieli”, „s-a cheltuit” sau „încasări” (auditul F36: titlul /harta, avertismentul de județ și exemplele din Întreabă, graficul lunar al achizițiilor directe de pe pagina entității și dependența reciprocă din /metodologie). Formulările care spun ce nu este o valoare („nu o cheltuială”) rămân. Testul `apps/web/lib/ask/value-wording.test.ts` verifică aceste fișiere.
- Un semnal de risc este o pistă de verificat, nu dovadă de corupție.
- Un contract prin procedură nu este automat peste pragul european, competitiv sau publicat în TED.
- Absența unei potriviri automate TED–SEAP nu dovedește absența din SEAP.
- „Fără înregistrări în selecție” nu înseamnă „zero cheltuieli”.
- O persoană care reprezintă o firmă nu este automat proprietar sau beneficiar real; o relație actuală nu se proiectează retrospectiv fără surse.
- Cantitatea și unitatea contează: valoarea medie pe înregistrare nu este preț unitar.
- O publicare tehnic validată nu dovedește colectarea completă a sursei.
- Data achiziției, data colectării, data primei observații și data recalculării sunt concepte diferite.
- Păstrează precizia SQL `numeric`; nu reconcilia sume prin conversii JavaScript în virgulă mobilă.

## Întrebările și sursele

„Întreabă” (în meniu; până la 22 octombrie 2026 „Explorează”)/`/intreaba` înlocuiește vechiul builder cu o propoziție românească editabilă. Există 13 tipuri, definite în `apps/web/lib/ask/spec.ts`, nu 13 modele SQL inventate de un LLM:

| Cod | Utilizare |
|---|---|
| `table` | Clasamente |
| `stat` | Total/indicator |
| `timeseries` | Evoluție în timp |
| `map` | Distribuție geografică |
| `compare` | Comparație |
| `distribution` | Distribuția riscului |
| `breakdown` | Categorii CPV |
| `scatter` | Risc versus volum |
| `sankey` | Fluxuri de bani |
| `network` | Rețea de parteneri |
| `entity_card` | Profil/superlativ |
| `fact_check` | Relație instituție–furnizor |
| `trend` | Diferențe între ani |

Fiecare trebuie să aibă surse verificabile. Selectarea unui segment, județ, partener sau „alte categorii” trebuie să deschidă exact acea populație. Filtrele locale din drawer sunt suplimentare față de întrebarea inițială. Condițiile în curs de editare nu schimbă identitatea rezultatului deja aplicat.

Din 23 octombrie 2026, un link care conține deja o întrebare o și rulează: `?spec=` (carduri, hartă, sugestii, linkuri trimise) deschide direct răspunsul, cu constructorul restrâns sub „Schimbă întrebarea”; `?q=` rulează doar când regulile au o singură lectură (`shouldAutoRun` în `apps/web/lib/ask/answer-text.ts`), iar o alegere între omonime așteaptă clicul. Alegerile și „Sau întreabă altfel” rulează la clic. Titlul răspunsului (`questionTitle` în `lib/ask/filters/title.ts`, din 25 octombrie 2026) e propoziția constructorului urmată de condițiile de sub ea („…, în 2025, fără SYSTRA?”): numește instituția sau primăria, firma, domeniul, locul, perioada și canalul; același titlu apare în panoul de surse, în salvate, în urmăriri și în numele CSV-ului. Clasamentele calculate pe tranzacții primesc în aceeași interogare totalurile întregului clasament (`totals`: valoare, înregistrări, entități, prin funcții fereastră), de unde „% din total” și rândul „Alte N firme”; clasamentul național precalculat (`agg_top_entities`) nu le are și nu le afișează. Defalcarea pe domenii începe cu „În total: … · valoare înregistrată, nu plăți”. Erorile tehnice apar doar sub „Detalii tehnice”, cu „Reîncearcă”.

Din 25 octombrie 2026 (F1b), constructorul fiecărei întrebări e desenat din registrul de filtre: propoziția are frazele întrebării (subiectul primul la clasament și trend), sub ea stau doar fragmentele pe care propoziția nu le are încă („+ Ce s-a cumpărat”, „+ De la cine”, cel mult patru), condițiile unui link vechi („Din link: …”, aplicate ca înainte) și selecțiile altor pagini cu eticheta lor. Nu mai există „Adaugă o condiție” sau „Mai multe filtre”; selecția precisă și pragul de înregistrări rămân doar în „⋯ › Selecție avansată”, pe întrebările care le aplică. Un link cu o condiție pe care motorul o refuză deschide constructorul cu motivul pe cip și nu rulează până la „Scoate condițiile din link”. Lângă răspuns, banda alege canalul (ce se cumpără, comparație), lentila hărții și „Vizual | Tabel”; „Salvează” din constructor salvează ciorna („· neaplicată” când diferă de răspuns), cel din răspuns întrebarea afișată. La rețea și flux, rândul „Furnizorii” sau „Clienții” alege partenerii (linia de total spune „doar furnizorii cu 1–9 angajați”); la verificare perechea nu se poate goli; distribuția își alege grupul în „Față de cine?” (tipul și județul); norul și „Cine conduce?” au subiectul primul și linia de profil, iar la „Cine conduce?” axa („câștigă cel mai mult” / „are cel mai ridicat indice de risc”) pune deoparte ce nu se aplică noii axe, fără să-l piardă. Un consiliu județean într-un județ nu e „primul”: răspunsul spune că e singurul și trimite la poziția lui față de celelalte consilii și la ce cumpără. „Selecție avansată” are doar câmpurile pe care propoziția nu le poate spune (date exacte, valoarea pe câștigător, liste de instituții sau firme, mai multe județe, coduri CPV excluse).

Tot din 25 octombrie 2026 (F1b), textele „Întreabă” folosesc vocabularul trusei: numerele de la 20 în sus au „de” peste tot („124 de înregistrări”, „primele 20 de profiluri din 466”), pastilele spun „toți anii”, „toate achizițiile: directe și din proceduri”, „valoarea înregistrată”, „conduse azi de”, tipurile ca în ferestre („doar primării de oraș și municipiu”), legăturile spre înregistrări „Vezi cele N de înregistrări →” / „N înregistrări →”, iar firmele care câștigă împreună sunt „în asociere” (cu (?) propriu; restul site-ului păstrează „consorțiu”). „Un singur ofertant” scris în cuvinte nu mai devine filtru: interpretorul păstrează contractele din proceduri (sau achizițiile directe, dacă omul le-a numit) și spune de ce: „Numărul de oferte îl știm doar pentru o parte din înregistrările contractelor (18–26% în 2019–2023, ~2% din 2024), deci nu îl folosim ca filtru.” (măsurat pe copia locală, după anul înregistrării: 9,7% în 2018, 17,8–25,6% în 2019–2023, 1,7–2,0% din 2024; nota e aceeași pe orice perioadă) Linkurile vechi cu acest filtru îl aplică în continuare, cu cipul „Din link: doar contractele cu o singură ofertă”. Pe telefon, butoanele și legăturile răspunsului și ale listei de înregistrări au cel puțin 44 × 44 px, iar distribuția are sub grafic „Intervalele indicelui, ca listă”, cu înregistrările fiecărui interval.

După revizia F1b (25 octombrie 2026): graficul „Cum evoluează…” începe în 2018, iar contractele mai vechi stau într-un singur rând sub el, cu înregistrările lor (totalul rămâne același); un singur an apare ca o cifră. Fereastra „Când?” a evoluției are „Toți anii · Ultimii 5 ani compleți · Ultimii 3 ani compleți · Alege anii…”. Pe hartă, atingerea unui județ deschide fișa lui (valoare, înregistrări, cota din selecție și linkul spre înregistrări), nu direct înregistrările. Un răspuns fără înregistrări oferă cel mult trei butoane care lărgesc întrebarea („Toți anii”, „Toată țara”, „Orice domeniu”…). Ferestrele cu căutare arată alegerea curentă bifată, iar titlul unui clasament spune când ordinea e pe locuitor sau după numărul de înregistrări. Pe un link vechi cu „o singură ofertă”, banda rămâne pe „Proceduri”.

„Întreabă în cuvintele tale / AI” este intenționat dezactivat; API-ul refuză fluxul neimplementat. Nu îl reactiva doar pentru a face un buton să pară funcțional.

**„Diferențe între ani” (`trend`), etapa F2, local pe `feat/ask-par-trend`, nepublicat.** Răspunsul împarte selecția celor doi ani în Creșteri, Noi, Scăderi, Nu mai apar (și cele fără schimbare), cu numărul și sumele fiecărei grupe, primii N din fiecare și etichetele rândului (fără CUI valid, prima dată în anul B / activă din …, activă în …, o înregistrare: N%, în asociere). Grupele adună totalul selecției; „Toate” (fără cheia `trend`) rămâne răspunsul de azi pentru linkurile vechi. „Aceleași luni” compară ianuarie → ultima lună completă din ambii ani cât timp anul B nu e încheiat; „Prima dată în B” păstrează firmele noi a căror primă înregistrare din arhivă e în B; ordonarea în procente există doar la creșteri, de la un prag (implicit 1 mil. lei în anul A). Pe un trend al firmelor, angajații (din ultimul bilanț) aleg firmele grupelor, iar răspunsul spune câte firme fără bilanț nu intră în fiecare grupă („Fără bilanț: N firme noi, nu intră”); selecția din antetul surselor rămâne a tuturor firmelor. Sursele unei grupe sunt înregistrările din cei doi ani ale tuturor membrilor ei, nu doar ale celor afișați; „Înregistrări →” pe un rând deschide doar acel rând (și pe un județ). O urmărire pe o grupă fixează membrii la activare (cel mult 5.000): urmărește aceleași firme la fiecare verificare, iar intrările și ieșirile din grupa vie sunt doar o notă. Întrebat în cuvinte („Ce firme noi au apărut în 2025?”, „Ce firme nu mai câștigă în județul Cluj?”, „Ce firme au crescut de câte ori…”), interpretorul alege grupa, compară un an cu cel dinainte și spune în propoziție grupa și lunile. Ecranul trendului (cele cinci butoane, rândurile, antetul sertarului) și propoziția constructorului vin cu etapa constructorului (S2); până atunci răspunsul are toate datele, iar ecranul de azi arată lista aleasă. Termenii grupelor au deja explicația lor, pentru tip-urile (?) ale ecranului: glosarul (`firma-noua`, `nu-mai-apare`, `prima-data`, `aceleasi-luni` în `lib/glossary.ts`) și paragraful „Diferențe între ani” de pe `/metodologie` (partiția, „nou” față de selecție, contractul întreg în anul atribuirii, aceleași luni). Semnalele sunt piste, nu dovezi; sumele sunt valori înregistrate, nu plăți.

Căutarea CPV folosește catalogul oficial plus sinonime, ignoră diacriticele și ordinea cuvintelor. `spatii verzi` trebuie să găsească `77310000-6`. În comparații, divizia 45 include subcodurile sale; „toate domeniile” și „toți anii” sunt opțiuni valide. Nu restrânge implicit o divizie la codul exact.

## Experiență aprobată

- Identitate forest-green/ivory, teme deschis/închis, Bricolage Grotesque + IBM Plex. Reutilizează CSS-ul și iconografia existente.
- Dialogurile de căutare își păstrează dimensiunea în loading/empty/error; rezultate cu scroll intern; cererile vechi nu suprascriu căutarea nouă.
- Drawer-ul de surse păstrează contextul; titlul unui contract deschide detaliul **în tab nou**.
- În rest (23.10.2026): paginile interne (`/entitati`, `/contracte`, `/achizitii`, `/anunturi`, `/semnale`, `/metodologie`, drill-urile „X tranzacții”) se deschid **în același tab**, marcate cu „→”. „↗” + tab nou rămâne numai pentru site-uri externe (e-licitatie.ro, TED, ANAF, termene.ro, listafirme.ro, INS) și pentru fișiere/PDF.
- Navigarea principală: „Descoperă” e activ pe prima pagină, `/cauta` (breadcrumb „Descoperă / Caută”), `/semnale`, `/harta`, `/domenii`, `/supra-prag` și paginile de entitate/contract/achiziție/anunț; „Întreabă” numai pe `/intreaba`; „Ghid” pe `/ghid` și `/metodologie`. Ghidul are un singur nume, „Ghid”, în header, meniul mobil și footer. Regulile sunt în `apps/web/lib/site-nav.ts`, cu teste.
- Barele sticky de sub header (tab-urile entității) citesc `--site-header-h`, măsurat de `SiteNav`; pe telefon rândul de tab-uri se derulează lateral, cu estompare la marginea care ascunde tab-uri.
- Erorile de pagină arată o frază în română, „Încearcă din nou”, linkuri spre prima pagină și Semnale, iar codul tehnic doar pliat; textul excepției nu ajunge pe ecran (nici în tabelele entității).
- Actualizarea de noapte (decizia din 23.10.2026): site-ul rămâne deschis cititorilor cât timp procesarea încheie lucrul în curs și face copia de siguranță. Pagina 503 „Actualizăm datele” apare după ce copia este verificată, chiar înainte să se schimbe datele, și rămâne până la redeschiderea verificată; la eroare rămâne. Ce scriu utilizatorii în minutele copiei (autentificări și sesiuni, feedback, anchete, întrebări salvate) rămâne în bază, dar nu intră în copia acelei rulări. O rulare care pornește pe un site deja închis (recuperare, rularea de după un eșec) îl ține închis. [Detalii](05-operations.md#procesarepublicare).
- Redirectul de la ID intern trebuie să fie relativ: nu construi linkuri publice din originea internă `0.0.0.0:3000`.
- `/domenii`: atlas CPV interactiv. Click pe părinte = drill-down în atlas; click pe frunză = detaliu; săgeata↗ = detaliu indiferent de nivel. Tooltip imediat pentru dreptunghiurile mici și listă lizibilă alături.
- `/supra-prag`: „Atribuiri publicate în TED”, nu „toate achizițiile peste pragul european”.
- `/admin`: Colectare, Procesare, Fișiere, Jurnal, Feedback și Conturi au rute consistente, cu navigare comună. Rezumat persistent, modificări păstrate, maximum 10 rânduri/pagină. Problemele pot fi semnalate anonim, fără nume sau e-mail; feedbackul este vizibil numai administratorilor, care pot șterge individual intrările după confirmare.
- Feedback explicit pentru procesare: coadă, așteptare, descărcare, procesare pagini, gata, eroare; utilizatorul nu trebuie să ghicească dacă se întâmplă ceva.

## Anchete, dovezi și urmăriri

Implementat în loturi, nu doar mockup:

1. Integritatea datelor, definițiile și navigarea către surse.
2. Anchete cu roluri owner/editor/viewer, cronologie, note, sarcini, invitații, întrebări salvate și capturi imuabile ale surselor.
3. Urmărirea privată a unei selecții: prima execuție stabilește reperul fără alerte; următoarele versiuni validate produc diferențe. Copierea într-o anchetă păstrează înainte/după și nu oferă acces la urmărirea privată originală.
4. Legături de achiziții între entități, comparații contextualizate și grupuri editabile.
5. Prima parte din documente: listare explicită, descărcare la cerere, PDF/P 7 S, OCR, căutare și citate legate de pagină în anchete.

Exporturile dovezilor păstrează metoda, sursele, versiunile, manifestul și hash-urile. Originalele PDF nu sunt automat încorporate în ZIP-ul unei anchete. Nu confunda un link salvat către date live cu o captură completă înghețată.

## Comparații între administrații — decizii explicite

Pentru primării, populația primează asupra rangului administrativ. Comune, orașe și municipii sunt în același grup de candidați. Sugestii: cele mai apropiate 10 administrații ca populație, cu diferența procentuală afișată. Consiliile județene sunt comparate separat după populația județului. Date: populație rezidentă INS/RPL2021, cu sursă și dată.

Identificarea autorității trebuie să fie sigură (nume, județ, CUI, rol); nu asocia o societate subordonată doar pentru că are numele orașului. Utilizatorul poate adăuga/elimina manual până la 50 comparatoare, inclusiv când populația nu este cunoscută. Lista explicită rămâne păstrată la schimbarea filtrelor. Membrii fără date rămân vizibili, dar nu intră în mediană. Sunt necesari cel puțin 5 alți membri eligibili pentru interpretarea comparației.

Pentru alte instituții/furnizori există metoda explicată prin activitatea observată. Linkurile și capturile vechi păstrează semantica veche; nu reinterpretăm retrospectiv o comparație salvată. Bugetul ca filtru suplimentar a fost discutat, nu livrat.

Tipul instituției (D1, local pe `feat/ask-par-d1`, nepublicat): comparația după activitate folosește același tip ca „Întreabă”, deci „spitalele” sunt aceleași instituții pe clasament și în comparație. Primăriile vin din registrul localităților, spitalele includ institutele clinice, restul se clasează după nume; un nume cu două tipuri nu are tip. Versiunea metodei devine `peers-2`. Comparația după populație și grupul ales manual nu depind de tip. O captură făcută rămâne neschimbată; o captură sau o recaptură legată de grupul de dinainte de D1 este refuzată, nu salvată cu alt grup. Urmăririle pe primării sau spitale primesc o singură alertă de metodologie (și în rezumatul prin e-mail, ca metodologie, nu ca înregistrări de verificat); cele pe școli, consilii județene sau fără tip, niciuna, fiindcă instituțiile lor nu se schimbă. Regula pentru vizitatori e pe `/metodologie#tip-institutie`. Detalii: [arhitectură](02-architecture.md), paragraful „Tipul instituției”.

## Documente și acces

- Vizitatorii pot vedea originalele/PDF-urile/OCR-ul deja arhivate.
- Doar utilizatorii autentificați pot cere preluarea de pe SEAP; control și în UI și pe backend.
- Actualizare 11 octombrie: pool automat de până la 10 downloaduri / 4 procesări, cu bugetul comun și ritm per IP; manualul păstrează controlul separat. Automat se descarcă strict caiete de sarcini identificate, recentele întâi, fără fallback la toate fișierele. [Politica actuală](20261011/operations.md).
- Nu există crawl automat de PDF-uri.
- Descărcat și procesat sunt stări distincte; originalul se păstrează și la eroare OCR.
- PDF-ul și textul din dreapta trebuie să urmărească aceeași pagină. Citarea unei pagini păstrează hash-ul, textul și metoda de extragere.
- P 7 S/CMS cu conținut încapsulat se poate extrage fără cont/certificat privat. Verificarea integrității nu dovedește încrederea/revocarea certificatului semnatarului.

Detalii tehnice și limite: [arhitectură](02-architecture.md), [documente](../implementation/batch5-documents-implementation.md), [populație](../implementation/peer-population.md), [principii](../../PRODUCT.md).
