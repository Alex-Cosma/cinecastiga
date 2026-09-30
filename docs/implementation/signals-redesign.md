# Semnale A — implementare locală, 30 septembrie 2026

Proprietarul a aprobat mockupul A și a autorizat implementarea reală, reluată după pauza solicitată. Pagina `/semnale` folosește acum datele aplicației. Nu s-au cerut commit, push sau deploy pentru acest lot.

## Parcurs

- Listă pe toată lățimea, maximum 10 rezultate, total complet și paginare sus/jos. Explicația se deschide sub un singur rezultat; valorile exacte și accesul direct la surse rămân vizibile.
- Selector căutabil pentru toate cele 13 tipuri, grupate tematic, cu numărări reale. Căutarea ignoră diacriticele. Tipurile exclusive aleg rolul compatibil; schimbarea rolului păstrează o selecție validă și o explică.
- Filtre de rol/județ; pe mobil un dialog etichetat și un rezumat al selecției. URL, Back/Forward și paginarea păstrează contextul. Trecerea între Semnale și CRI reține pagina în sesiunea componentei pentru același rol/județ.
- Loading vizibil imediat, fără rezultate vechi prezentate drept răspuns la filtre noi; stări distincte pentru eroare/reîncercare și selecție goală. Status accesibil separat de aria-busy. Dialogurile gestionează Escape, focusul și scrollul; reduced motion și tema întunecată păstrate.

## Surse și sensul datelor

`SignalSources` citește endpointul existent `/api/evidence/sources?kind=signal&id=…&format=json`. Serverul livrează până la 50 de înregistrări pe lot; dialogul afișează 10 pe pagină și cere lotul următor numai când este necesar. Păstrează avertismentele, totalurile, contextul financiar, metodologia și plafonul existent al selecției. Linkurile către detalii și SEAP/TED se deschid în tab nou; există acces separat la pagina completă de surse și exportul CSV existent. Salvarea în anchetă folosește autorizarea existentă și este ascunsă anonim.

Dialogul are înălțime stabilă la încărcare, rezultate și eroare; arată feedback suplimentar după 7 secunde, permite reîncercarea și anulează citirea la închidere. Timeoutul clientului este 45 secunde; acesta nu elimină limitele SQL existente și nu este o promisiune de performanță pentru orice selecție. Nicio citire nu descarcă documente din SEAP.

`totalExact` transportă valorile numerice ca text, păstrând zecimalele din DB; lipsa valorii rămâne distinctă de zero. Atribuirile arată autoritatea și câștigătorii, etichetează valoarea anunțului și explică limitele filtrării județului furnizorului. Fracționarea păstrează contextul aceluiași an/tip/clase CPV și pragurile fiecărei achiziții. Nu s-au schimbat formulele, populația semnalelor sau apartenența surselor.

## CRI separat

Vizualizarea «Entități după CRI» folosește numărul stocat de criterii `n_flags`: 0–5 pentru autorități, 0–4 pentru furnizori. Graficul și lista folosesc aceeași populație de entități cu minimum 10 achiziții directe. Aceasta înlocuiește vechiul clasament suplimentar care cerea minimum 30 pentru autorități; pragul de 10 este explicit în UI. CRI rămâne exclusiv despre achiziții directe, nu probabilitate de corupție.

Linkurile vechi cu `criMin`/`criMax` deschid vizualizarea CRI și păstrează intervalele și sortările existente. Noul filtru pe numărul exact de criterii folosește `n_flags`, nu o aproximare din scorul rotunjit. Extinderea rândului arată criteriile reale ale entității.

## Verificări

- 51 teste web trecute: 24 pentru starea/navigarea semnalelor, 10 integrări PostgreSQL, 14 pentru prezentarea riscului și 3 regresii pentru sursele radiografiei. Nicio integrare omisă. Fixture-ul `seap_test_signals` a fost creat separat și eliminat după verificare.
- TypeScript și build web optimizat trecute, inclusiv buildul final după corecțiile UI. Buildul temporar `.next-signals-check` și intrările sale tsconfig au fost eliminate.
- 31 verificări browser pe aplicația locală cu date reale: selecții, toate tipurile, CRI și linkuri vechi, paginare, surse, linkuri noi, loading/eroare/reîncercare, filtre mobile și stare goală. Eroarea surselor a fost simulată numai prin interceptarea răspunsului în browser.
- 11 verificări finale: înălțime stabilă, sursele reale paginate 10/10/4, focus, status accesibil, Back și lipsa overflowului la 390/768/1024 px. Fără erori JavaScript sau cereri către SEAP/TED în parcursul verificat.
- Probe locale ignorate de Git: `.impeccable/review/signals-live-20260930/`. Evaluarea finală a fost realizată local deoarece limita de fire a împiedicat reviewerul independent; verdict și documentare consemnate. Nu reprezintă certificare completă de accesibilitate. Detectorul a semnalat sublinierea tabului activ; aceasta este dreptunghiulară și respectă stilul existent. PRODUCT/DESIGN și identitatea vizuală nu s-au schimbat; fără asseturi raster noi.

## Operare și publicare

Aplicația locală rămâne disponibilă la http://localhost:3000/semnale, dev cu HMR. Lotul nu adaugă migrații, nu recalculează riscul, nu pornește colectarea și nu modifică producția. Datele locale încă au baseline-ul istoric documentat anterior.

**Publicarea întregului branch necesită în continuare tranziția `rf-2026.6`**, cu backup, mentenanță, procesarea completă inclusiv risc, reconstruirea indexului și verificarea publicării, conform documentului `acquisition-details-calendar.md`. Acest redesign singur nu cere reprocesare și nu autorizează lansarea branchului.
