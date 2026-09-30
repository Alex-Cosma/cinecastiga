# Semnale — propunere de reorganizare

30 septembrie 2026. **Varianta A aleasă de proprietar; mockup interactiv separat, fără modificări în aplicație.**

Mockup: [instrucțiuni și limitări](../../mockups/signals/README.md), disponibil local la <http://127.0.0.1:4185/signals/> când serverul static rulează. Alegerea „Build this” a autorizat mockupul, nu implementarea în aplicația reală.

## Promptul de explorare

> Ești designer de produs pentru cinecâștigă?, o aplicație românească pentru investigarea achizițiilor publice. Reorganizează complet /semnale pentru două situații: un cetățean curios care vrea să găsească repede o pistă inteligibilă și un reporter care trebuie să verifice și să poată cita exact datele. Lucrează în identitatea existentă: verde pădure, fildeș, Bricolage Grotesque și IBM Plex, inclusiv tema întunecată. Modul acestei pagini este Operate.
>
> Începe prin a inspecta pagina reală pe desktop și mobil, registrul celor 13 semnale, populațiile, perioadele, sortarea și traseul spre surse. Identifică informația care întârzie accesul la rezultate, conceptele amestecate și filtrele care produc rezultate înșelătoare. Explorează structuri diferite, nu doar variante de culori. Recomandă o structură și explică ce sacrifică fiecare alternativă.
>
> Primul ecran trebuie să arate ce este selectat și cel puțin un rezultat inteligibil, fără a cere înțelegerea CRI. Păstrează toate cele 13 tipuri, populațiile complete, URL-urile distribuibile și traseul spre fiecare sursă. Folosește maximum 10 rezultate pe pagină, cu total și navigare sus/jos. Distinge aparițiile de entități și contracte, valorile înregistrate de plăți, valoarea anunțului de valoarea lotului, lipsa datelor de zero. Nu transforma semnalele în acuzații, scoruri de corupție sau un total de bani suspecți.
>
> Fiecare rezultat trebuie să răspundă: cine, ce observație a declanșat semnalul, pentru ce perioadă, ce valoare reprezintă și cum verific. Explicația scurtă și limitele importante trebuie să rămână vizibile; metodologia lungă poate fi deschisă la cerere. Arată onest lipsa surselor exacte sau a reconcilierii. Nu fabrica liste de contracte pentru semnale istorice care nu le-au păstrat.
>
> Separă navigarea prin semnale de analiza entităților după CRI, fără eliminarea vreunei funcționalități. Asigură selecție clară, întoarcere fără pierderea filtrelor, încărcare stabilă, eroare cu reîncercare, rezultate goale explicate, tastatură, ecrane înguste și reduced motion. Salvează în anchetă doar pentru utilizatori autentificați. Identifică explicit ce se poate face cu backendul existent și ce presupune capabilități noi. Livrabilul curent este propunerea de design, nu implementarea.

## Ce am verificat

- `/semnale` local, Chrome la 1440×1000 și 390×844. Capturile sunt în `.impeccable/review/signals-redesign-20260930/` (artefacte locale ignorate).
- Pagina desktop are 7.159px înălțime la verificare: 50 de rezultate, apoi încă un clasament. Pe mobil primul ecran nu ajunge la rezultate; afișează antetul și începutul sidebarului cu CRI.
- Selecția implicită: autorități / toate județele / posibilă fracționare. 17.807 apariții locale, 357 de pagini la 50. Aceste numere descriu copia locală, nu producția sau acoperirea completă a SEAP.
- 13 tipuri în `lib/flags.ts`. Semnalele exclusive firmelor apar cu zero în modul autorități; zero nu explică incompatibilitatea.
- Pagina combină trei sarcini: lista de apariții, distribuția CRI și topul CRI. Histogramă și top au chiar populații diferite: minimum 10 achiziții directe pentru distribuție, minimum 30 pentru topul autorităților.
- `lib/signals.ts` folosește populația completă materializată. Semnalele au sortare fixă după valoare/severitate; controalele de sortare existente se aplică listei CRI. Perioada, căutarea unei entități și localitatea nu sunt filtre disponibile aici.
- `/semnale/[id]` oferă dovezi și export; unele versiuni istorice nu au liste exacte. Această limită trebuie păstrată vizibilă în noua experiență.

## Direcția recomandată: rezultate cu explicație la cerere

O singură suprafață de lucru, pe întreaga lățime. Antet compact „Semnale”, o frază „Observații din date, puncte de pornire pentru verificare”, link de metodologie și data reală a recalculării când există. Data recalculării nu înseamnă date colectate până atunci; lipsa ei nu trebuie înlocuită cu o dată inventată.

Două vizualizări explicite: **Semnale** și **Entități după CRI**. Sunt schimbări de conținut, nu ancore care sar pe aceeași pagină. Păstrează rolul și județul în URL. Revenirea la Semnale restaurează tipul și pagina anterioară.

În Semnale, o singură bandă de filtre: **Tipul semnalului**, **Autorități / Firme**, **Județ**. Tipul este un selector cu căutare, grupat în patru familii de mai jos; toate tipurile rămân descoperibile. La alegerea unui tip exclusiv firmelor, rolul se schimbă vizibil în Firme, cu mesajul „Acest semnal se calculează pentru firme”. Controlul incompatibil nu permite un zero artificial. Nu amestecăm județul firmei cu cel al autorității; eticheta câmpului reflectă rolul, fără un paragraf suplimentar.

Sub filtre, titlul tipului ales, o explicație scurtă și „Criterii și limite”. De exemplu, la fracționare rămâne la vedere că sunt achiziții din aceeași clasă CPV, același tip și an, fiecare sub plafonul propriu. Nu dispare limita interpretării juridice în favoarea unui slogan.

Rezultatele sunt rânduri aerisite despărțite prin linii, nu 10 carduri mari. Structura: **entități și perioadă | observația concretă | valoare contextualizată | Verifică**. Numele entităților sunt linkuri distincte, pe linii separate dacă sunt lungi. Anul nu se repetă de două ori. Sumele sunt aliniate cu antetul și păstrează valoarea exactă accesibilă fără hover obligatoriu.

**Verifică** deschide sub rând o explicație cu „Ce a declanșat semnalul”, „Ce merită verificat” și „Înregistrările sursă”. Se deschide un singur rând odată; restul listei rămâne în context. Linkul explicit „Vezi înregistrările sursă” rămâne disponibil și din rândul închis, către pagina dedicată. Nu este necesar să deschizi explicația pentru a ajunge la dovezi. Linkurile spre contracte și sursele externe se pot deschide în alt tab.

Expansiunea afișează starea de încărcare când aduce date suplimentare. Nu numește toate sursele „contracte”: poate avea achiziții directe, anunțuri/loturi, bilanțuri sau registrul ONRC. Dacă lista exactă lipsește, spune asta explicit și oferă detaliile semnalului; nu promite o reconciliere imposibilă. Salvarea în anchetă folosește fluxul existent, cu acces autentificat, nu un buton decorativ.

Sus și jos: „1–10 din 17.807 apariții” și paginare. Numărul este exemplul verificat local, nu text fix. Ordinea implicită rămâne explicit „După valoare”; nu numim această ordine „cele mai suspecte”. Nu încărcăm restul listei în browser pentru a o ascunde vizual și nu înlocuim totalul complet cu primele rezultate.

## Toate cele 13 tipuri

| Familie de navigare | Tipuri existente, păstrate distinct |
| --- | --- |
| Praguri și calendar | Posibilă fracționare sub prag; Valoare aproape de prag; Finalizare rapidă; Achiziții concentrate în decembrie |
| Concentrarea achizițiilor | Concentrare pe un furnizor; Dependență de o autoritate; Concentrare pe un câștigător; Contracte concentrate la o autoritate |
| Proceduri și oferte | Negociere fără publicare prealabilă; O singură ofertă raportată în TED |
| Firme și legături | Puțini salariați, valori contractate mari; Valori contractate raportate la cifra de afaceri; Reprezentant comun, aceeași autoritate |

Familiile sunt organizare vizuală, nu scoruri sau formule noi. Directele și procedurile rămân etichetate distinct. Nu însumăm valorile semnalelor: pot avea aceleași înregistrări la bază. Numărările sunt apariții pentru selecția indicată, nu entități unice.

## Vizualizarea CRI

Mută aici distribuția și lista completă de entități. Explicația „criterii îndeplinite din 5 / 4, exclusiv achiziții directe” stă lângă indicator. Scorul nu este probabilitate de corupție. Păstrează filtrarea pe interval și sortările existente, plus total și 10 rânduri pe pagină. Fără clasament suplimentar sub lista semnalelor. Nu schimbăm implicit pragurile de includere ale populațiilor: la trecerea de la vechiul top la lista completă, explicăm minimum 10 achiziții directe și documentăm diferența față de vechiul top cu minimum 30 pentru autorități.

## Două alternative de structură

- **Listă + panou de detalii:** la desktop rezultatele ocupă stânga și explicația selecției dreapta; navigarea între rezultate schimbă panoul. Avantaj pentru un reporter care verifică multe apariții consecutiv. Cost: lista devine mai îngustă, sursele cu mulți câștigători sunt mai greu de citit; pe mobil panoul trebuie să devină un ecran cu revenire clară.
- **Explorare ghidată:** intrarea este prin „Ce vrei să verifici?”, cu cele patru familii, apoi tipul și rezultatele. Bună pentru cine nu știe ce este un semnal; introduce un pas suplimentar pentru utilizatorul recurent. URL-urile cu selecție trebuie să sară direct la rezultate.

Lista cu explicație sub rând este recomandarea: rezultatele sunt disponibile imediat, păstrează lățimea pentru nume și observații, funcționează natural pe mobil și nu adaugă încă un drawer peste traseul surselor.

## Stări și limite de implementare

- Pe mobil: tipul selectat vizibil și buton „Filtre”; celelalte controale într-un dialog. Rezultatele se rearanjează vertical, fără scroll orizontal; primul rezultat trebuie să înceapă în primul ecran la 390×844. Nu afișăm întâi cele 13 opțiuni.
- La filtrare păstrăm dimensiunile zonei și anunțăm „Se încarcă semnalele…”. La eroare nu afișăm date vechi sub filtre noi fără etichetare. Back/forward restaurează selecția. La paginare revenim la începutul rezultatelor, nu la începutul documentului.
- Starea goală descrie selecția și oferă resetarea ei. Lipsa datelor, lipsa surselor și lipsa eligibilității sunt stări distincte. Controlul de reîncercare repetă citirea aplicației, nu pornește colectarea SEAP.
- Tranziții discrete pentru expansiune/încărcare; fără animații ale numerelor, clasamente animate sau culori care pretind gravitate juridică. Tastatură, focus și reduced motion obligatorii.
- Primul lot poate refolosi datele și formulele existente: layout, 10 rezultate, selector grupat, roluri compatibile, separarea CRI, texte și traseul dovezilor. Extinderea inline a dovezilor necesită reutilizarea/adaptarea încărcătorului existent, nu doar CSS.
- Filtru pe interval de ani, typeahead pentru o instituție, localități, sortări noi sau căutare textuală sunt extensii backend separate. Nu se desenează ca și cum ar funcționa deja. Semnalele `all` și CRI nu trebuie recalculate implicit pentru un an ales.
- Nu rulăm recalculări, migrații sau trafic SEAP pentru acest redesign. Problemele de date observate se urmăresc separat.

## Ce trebuie validat înainte de implementare

Proprietarul a ales explicația în listă (A), cu mockup code-led. Urmează feedbackul și aprobarea mockupului înainte de implementarea în aplicație. Nu sunt înlocuite DESIGN.md, formulele, pagina /semnale/[id] sau aplicația live.

## Rezultat ulterior — implementare aprobată

După evaluarea mockupului A, proprietarul a autorizat implementarea reală și apoi reluarea după pauză. Aceasta este terminată local: [comportament, verificări și limite](../implementation/signals-redesign.md). Nota anterioară privind aprobarea în așteptare este istorică. Fără publicare sau modificarea identității vizuale.
