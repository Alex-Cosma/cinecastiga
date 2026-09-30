# Audit prin persona unui vizitator Reddit sceptic

Method: dual-agent (A: `/root/admin_queue_documenter` · B: `/root/radiografie_mock_document`).

29 septembrie 2026, producție, vizitator anonim, desktop și mobil 390 px. Evaluările au fost independente; A a fost încheiată înainte de citirea rezultatelor detectorului B în sinteză. Limita de thread-uri a împiedicat crearea a doi agenți noi; au fost reutilizate două contexte distincte, fără acces reciproc la constatări. Promptul complet: [persona-prompt.md](persona-prompt.md). Probe independente: [A](assessment-a.md), [B](assessment-b.md), [verificările suplimentare](evidence-notes.md).

**Verdict: există muniție reală pentru un critic, în continuitatea verificării și în limbajul încrederii. Identitatea vizuală este coerentă și specifică proiectului. Nu am găsit temei pentru a declara produsul o machetă goală sau pentru a atribui vizual originea lui unui AI.**

Promptul operațional: „Ești un român venit de pe Reddit, fără cont, fără cunoștințe interne și cu puțină răbdare. Cauți primăria, o achiziție banală și sursele unui semnal. Ataci promisiunile neacoperite, cifrele neclare și experiențele neterminate. Pentru fiecare obiecție păstrezi URL-ul și dovada; separi defectul observat de interpretarea ostilă. Nu inventezi acuzații, nu publici și nu modifici aplicația.” Postarea Reddit propriu-zisă nu a fost furnizată.

## Ce funcționează

- Poți vedea înregistrările și referințele oficiale fără cont. Există un traseu real până la sursă, export și metodologie.
- Am însumat independent cele 24 de valori din [un semnal](https://cinecastiga.ro/semnale/26401121): **10.523.096,15 lei**, exact totalul declarat. Și numărătorile homepage se reconciliază. Aceste probe nu certifică întreaga bază.
- Căutarea cu/fără diacritice, Back și refresh au funcționat în exemplele testate. Nu au apărut erori JavaScript ale aplicației sau depășirea lățimii paginii pe mobil. Documentația precizează că valorile nu sunt plăți și semnalele nu dovedesc ilegalități.

## Cinci priorități

### 1. P1 — Detaliul trebuie să păstreze și să explice datele din listă

În lista surselor găsesc „Cartuşe de toner”, codul DA39615984, 31.12.2025, CPV 30125100-2 și 2.992 lei. Pe [pagina achiziției](https://cinecastiga.ro/achizitii/121325235) dispar obiectul, data și CPV-ul. Rămân codul, entitățile, suma și linkul SEAP. Pagina există, dar verificarea pierde context.

Mai apare o neconcordanță: rezultatul căutării „locuri de joaca” afișează 21.05.2026, iar [contractul 107706970](https://cinecastiga.ro/contracte/107706970) spune „semnat 22.05.2026”. Un al doilea exemplu apare la [contractul 106652551](https://cinecastiga.ro/contracte/106652551), 15 iulie în tabel și 16 iulie în detaliu. Nu s-a stabilit dacă diferența provine din conversia fusului orar sau din semnificația câmpurilor.

**Obiecția:** „Deschid detaliile și aflu mai puțin. Nici data nu știu pe care s-o citez.”

**Fix:** aceeași fișă minimă în toate traseele: obiect, identificator, dată etichetată precis, CPV, valoare, părți, sursă. Verificarea originii și formatării datelor precede corectarea; nu uniformizăm două date legitime. Nu e nevoie de colectare suplimentară pentru câmpurile deja afișate în listă. Comandă potrivită: `$impeccable harden`.

### 2. P1 — Căutarea găsește primăria, dar o pune prea jos

La [„Primăria Cluj”](https://cinecastiga.ro/cauta?q=Prim%C4%83ria%20Cluj), primele rezultate sunt contracte electrice privind Apahida, Dej și Bonțida. Municipiul Cluj-Napoca este găsit corect, după achiziții și „Documente 0”. Pe mobil, categoria „Instituții și firme” este parțial în afara benzii vizibile de taburi.

**Obiecția:** „Caut primăria și primesc altceva. De ce trebuie să învăț eu cum gândiți căutarea?” Rezultatele nu sunt false; prioritatea lor nu urmărește bine intenția utilizatorului.

**Fix:** la o potrivire puternică, afișăm imediat „Cauți Municipiul Cluj-Napoca?” cu acces la profil și la achizițiile sale. Păstrăm căutarea textuală distinctă. Categoriile rămân complet recognoscibile pe mobil; filtrele secundare pot fi pliate. Comenzi: `$impeccable clarify`, `$impeccable adapt`.

### 3. P1 — Unele explicații de risc spun mai mult decât demonstrează măsura

[Metodologia](https://cinecastiga.ro/metodologie) face distincții bune, dar folosește și „ascunde concentrarea reală”, „aceeași persoană controlează întregul flux” sau „cvasi-totalitatea veniturilor”. Aceeași pagină precizează că administratorii nu sunt neapărat proprietari și contractele nu sunt încasări. Contradicția este de limbaj și inferență, nu o dovadă că formulele sunt greșite.

Pe [profilul Buzăului](https://cinecastiga.ro/entitati/2144364), rotunjirea afișează `270.119 lei = 100.0% din pragul de 270.120 lei (da_ceiling_goods_services)`, deși explicația spune „strict sub”. Identificatorul intern și procentul rotunjit slăbesc credibilitatea unei comparații care poate fi numeric corectă.

**Obiecția:** „Îmi spuneți că sunt doar indicii, apoi scrieți ca și cum ați stabilit controlul și intenția.”

**Fix:** fiecare semnal descrie observația, explicațiile alternative și verificarea necesară. De exemplu: „Firme cu același reprezentant în registrul disponibil au contracte la aceeași autoritate; legătura de proprietate și situația la data contractelor trebuie verificate.” Lângă prag afișăm „cu 1 leu sub prag”, cu tipul în română. Contextualizăm scorul prin criterii și perioadă. Comandă: `$impeccable clarify`.

### 4. P1 — Răspunderea pentru proiect și corecturile nu sunt ușor de găsit

Pe homepage, metodologie și footer-urile inspectate găsesc „Proiect deschis, necomercial”, dar nu găsesc cine îl operează, un contact sau o cale clară de raportare a erorilor. Aceasta este o constatare despre traseele publice testate; nu demonstrează inexistența unei pagini ascunse.

**Obiecția:** „Voi puneți etichete de risc lângă firme. Cine răspunde dacă greșiți?”

**Fix:** „Despre proiect și corecturi” cu informații furnizate de proprietar: operator, finanțare dacă este publicabilă, ce înseamnă „deschis”, contact. „Semnalează o problemă cu aceste date” păstrează URL-ul și identificatorul înregistrării. Nu inventăm identitatea editorială sau un contact. Comandă: `$impeccable clarify`.

### 5. P2 — Prea multe promisiuni de verificare; unele invitații nu se pot executa

După un răspuns din [Explorează](https://cinecastiga.ro/intreaba) se repetă „Vezi înregistrările”, „Verifică tu”, „Datele și exportul CSV”, „Exportă rezultatul afișat”, „Cum s-a calculat răspunsul” și un panou „Deschide sursele”. Distincțiile există, dar cititorul trebuie să le decodeze.

Pe contractele testate, „Citește sursa. Caută o cerință. Păstrează pasajul...” precede mesajul că fișierele nu sunt disponibile în aplicație. Alternativa SEAP există; nu deducem că nu există documente la sursă sau în alte selecții.

**Obiecția:** „Mi-ați spus de șase ori că pot verifica. Arătați-mi simplu ce pot verifica aici.”

**Fix:** un singur acces principal la înregistrări; exporturile grupate cu etichete clare despre ce conțin; explicația calculului lângă rezultat. Când nu avem fișiere, afișăm direct starea și alternativa oficială, fără invitația imposibilă de a selecta un pasaj. Păstrăm identitatea verde/ivoriu. Comenzi: `$impeccable distill`, `$impeccable clarify`.

## Observații secundare

- Pagina [sursei semnalului](https://cinecastiga.ro/semnale/26401121) avertizează că lista poate deveni indisponibilă după reconstrucție. Pentru citare publică durabilă merită o versiune datată stabilă sau un pachet de dovezi exportabil. Nu am observat efectiv ruperea unui link și nu propun publicarea anchetelor private.
- „Înregistrări din 2000–2026” este adevărat pentru intervalul general observat; nu arată singur că achizițiile directe încep în 2018 sau că TED se oprește la 30.06.2026 în inventarul consultat. O precizare scurtă, lângă cifre, reduce interpretarea ca acoperire uniformă. Nu ascundem limitele într-un nou bloc lung de avertismente.
- Butonul homepage pentru numărul de rânduri contract–furnizor deschide o întrebare despre valoare. Numărul și selecția corecte sunt prezente, deci nu este link stricat; focusul poate urma metrica pe care utilizatorul a apăsat.
- Metodologia menționează un buton „citează”, dar traseele inspectate oferă „Copiază întrebarea” sau doar linkul paginii. Copia documentației ar trebui sincronizată cu acțiunile disponibile.

## Încărcare cognitivă și parcurs emoțional

Homepage: două intrări clare și trei exemple. Rezultat: prea multe acțiuni asemănătoare. Semnale: 13 categorii simultane și acronime. Vizitatorul trece de la o primă impresie bună la confuzie în căutare, câștigă încredere din sursele exacte, apoi o pierde când pagina de detaliu elimină contextul. Metodologia recuperează o parte din încredere, dar nu oferă un interlocutor pentru corecturi.

Redditorul sceptic atacă formulările absolute și răspunderea; începătorul se pierde între căutarea titlurilor și găsirea instituției; utilizatorul mobil trece prin filtre și rezultate lungi înainte să ajungă la primărie; watchdog-ul are nevoie de referințe care rezistă unei recalculări.

## Evaluare euristică — 27/40

Scor editorial 0–4 pe criteriu, nu măsurătoare experimentală sau certificare. Toate cele zece criterii se aplică parcursului mixt.

| Criteriu | Scor | Principalul motiv |
| --- | ---: | --- |
| Vizibilitatea stării | 3 | Încărcare și actualizări explicite |
| Limbaj familiar și precis | 2 | Jargon și inferențe categorice |
| Control și revenire | 3 | Back/refresh funcționează în probe |
| Consistență | 3 | Identitate coerentă, câmpuri pierdute în detalii |
| Prevenirea interpretărilor greșite | 3 | Limite explicate, proeminență de îmbunătățit |
| Recunoaștere fără memorare | 2 | Context de reținut între pagini |
| Eficiență | 3 | Filtre/exporturi bune, prioritizare slabă a intenției |
| Estetică și simplitate | 3 | Identitate specifică, acțiuni repetitive |
| Recuperare din erori | 3 | Căutare goală explicată și navigare păstrată |
| Ajutor și documentație | 2 | Metodologie bogată, contact greu de găsit |
| **Total** | **27/40** | **Bază coerentă, fricțiuni importante de încredere** |

## Detector și limite

CLI: zero constatări în `apps/web/app/page.tsx` și `apps/web/app/intreaba/QuestionBuilder.tsx`. Nu demonstrează că UX-ul sau datele sunt corecte și nu determină dacă textul a fost scris de AI. Detectorul și evaluarea umană nu se contrazic: obiecțiile principale țin de semnificație și parcurs, în afara regulilor statice. Nu există false-positive de clasificat.

Nu am validat documentele în SEAP, nu am testat toate paginile sau accesibilitatea exhaustiv și nu am inspectat anchete private. Timpii de navigare sunt observații izolate. Nu am schimbat aplicația, pornit colectări sau publicat vreun comentariu.

## Comentariul Reddit fictiv

> Arată bine, dar deschid un cartuș de toner și pagina uită că era toner: cod, sumă, hai înapoi în SEAP. Caut Primăria Cluj și trec prin contracte electrice din alte localități și „Documente 0” până ajung la ea. La un contract am 21 mai în listă și 22 mai în detaliu — pe care îl citez? Metodologia spune frumos că semnalele nu sunt dovezi, apoi explică cine „controlează întregul flux”. Și cui raportez o greșeală? Mai puțin „poți verifica fiecare leu” repetat peste tot și mai multă grijă la drumul până la date. Sursele chiar există și nu mi-a cerut cont, deci nu e o machetă goală. Tocmai de-aia detaliile astea sunt frustrante.

## Alegeri pentru următoarea intervenție

1. Prioritate: **continuitatea datelor și formulările de risc** sau **căutarea primăriei și simplificarea rezultatelor**?
2. Amploare: **remedieri punctuale în stilul actual** sau **și o pagină „Despre proiect și corecturi”, cu informațiile proprietarului**?

Ordinea recomandată înainte de un val de promovare: detalii/date → formulări de risc → contact/corecturi → prioritatea căutării → eliminarea redundanței. Nu este necesară schimbarea identității vizuale.
