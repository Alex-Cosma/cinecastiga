# Produsul și deciziile care trebuie păstrate

## Misiune și public

cinecâștigă? permite investigarea cheltuirii banilor publici din România. Utilizatorii includ persoane fără experiență în achiziții și jurnaliști de tip Recorder, RISE Project sau Snoop. Aceste organizații sunt exemple de public, nu parteneriate sau utilizatori confirmați.

Interfața trebuie să invite la explorare: întrebări inteligibile, filtre ușor de schimbat, rezultate rapide, dovezi la îndemână. „Anchete” rămâne funcționalitate centrală. O analiză nu este suficientă dacă utilizatorul nu poate deschide înregistrările care o compun și verifica suma.

Principiul repetat explicit de proprietar: **„Poți verifica fiecare leu.”** Asta înseamnă selecție exactă, totaluri explicate, paginare, export și linkuri SEAP/TED. Nu justifică promisiuni de completitudine inexistente.

## Reguli semantice

- Contractul înregistrat nu dovedește plata, livrarea sau executarea integrală.
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

„Explorează”/`/intreaba` înlocuiește vechiul builder cu o propoziție românească editabilă. Există 13 tipuri, definite în `apps/web/lib/ask/spec.ts`, nu 13 modele SQL inventate de un LLM:

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

„Întreabă în cuvintele tale / AI” este intenționat dezactivat; API-ul refuză fluxul neimplementat. Nu îl reactiva doar pentru a face un buton să pară funcțional.

Căutarea CPV folosește catalogul oficial plus sinonime, ignoră diacriticele și ordinea cuvintelor. `spatii verzi` trebuie să găsească `77310000-6`. În comparații, divizia 45 include subcodurile sale; „toate domeniile” și „toți anii” sunt opțiuni valide. Nu restrânge implicit o divizie la codul exact.

## Experiență aprobată

- Identitate forest-green/ivory, teme deschis/închis, Bricolage Grotesque + IBM Plex. Reutilizează CSS-ul și iconografia existente.
- Dialogurile de căutare își păstrează dimensiunea în loading/empty/error; rezultate cu scroll intern; cererile vechi nu suprascriu căutarea nouă.
- Drawer-ul de surse păstrează contextul; titlul unui contract deschide detaliul **în tab nou**.
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

## Documente și acces

- Vizitatorii pot vedea originalele/PDF-urile/OCR-ul deja arhivate.
- Doar utilizatorii autentificați pot cere preluarea de pe SEAP; control și în UI și pe backend.
- Un singur fișier descărcat/procesat simultan; minimum 60 secunde între începuturile GET-urilor de fișiere, inclusiv încercările eșuate.
- Nu există crawl automat de PDF-uri.
- Descărcat și procesat sunt stări distincte; originalul se păstrează și la eroare OCR.
- PDF-ul și textul din dreapta trebuie să urmărească aceeași pagină. Citarea unei pagini păstrează hash-ul, textul și metoda de extragere.
- P 7 S/CMS cu conținut încapsulat se poate extrage fără cont/certificat privat. Verificarea integrității nu dovedește încrederea/revocarea certificatului semnatarului.

Detalii tehnice și limite: [arhitectură](02-architecture.md), [documente](../implementation/batch5-documents-implementation.md), [populație](../implementation/peer-population.md), [principii](../../PRODUCT.md).
