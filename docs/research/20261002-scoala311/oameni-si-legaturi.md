# Oameni, roluri și fapte — completare din 2 octombrie 2026

Cererea utilizatorului: relatarea nu se poate opri la sume. Cercetarea trebuie să identifice cine deține/reprezintă furnizorii, cine decide în instituție și ce relații pot fi demonstrate. Nu avem încă o investigație completă sau dovada unei ilegalități. Textul rămâne preview local.

## Rezultate care intră în articol

| Persoană / fapt | Dovada consultată | Limita exactă |
| --- | --- | --- |
| Nicolae Cristian Bosolac și Dragoș Ștefan Micu, administratori înscriși la BNC | Fișierul ONRC original `OD_REPREZENTANTI_LEGALI`, snapshot 08.07.2026; legătură cu CUI prin `OD_FIRME` | Nu oferă participații sau datele numirii/revocării; nu certifică mandatul la o altă dată |
| Bosolac, administrator înscris și la M&M Company Construct, CUI 16617020 | Aceleași fișiere: nume, dată de naștere normalizată și localitate de naștere concordante | Nu publicăm identificatorii personali; nu transformăm administrarea în proprietate |
| Două achiziții M&M ale Școlii 311, 161.436,39 lei | DA38610396 / 120247609 / 29.07.2025 / 148.296,39; DA39350427 / 121041537 / 21.11.2025 / 13.140. Ambele `Oferta acceptata` | Date normalizate, fără payload/titlu original în copia locală. Nu susținem că sunt pentru bazin. Excluse din totalul celor șapte BNC |
| Daniela Sandu este prezentată ca directoare | [Pagina oficială a echipei](https://scoala311bucuresti.ro/echipa-scolii-4/), consultată 02.10.2026; [hotărârea CA 5/08.10.2025](https://scoala311bucuresti.ro/wp-content/uploads/2025/12/Hotarare-CA-5-08.10.2025.pdf) o numește și președintă CA la acea dată | Nu avem actele care identifică persoanele ce au aprobat/evaluat/recepționat cele șapte achiziții din septembrie 2026 |
| Numele directoarei apare pe anunțul de selecție din decembrie 2025 | [Anunț oficial, pp. 1 și 5](https://scoala311bucuresti.ro/wp-content/uploads/2025/12/anunt-public-1.pdf) | Este pentru 19–31.12.2025, nu îl prezentăm ca documentație a achizițiilor din 01.09.2026 |
| BNC: CA 6.196.738 lei, profit net 999.104 lei, 9 salariați medii în 2025 | Fișierul MF `WEB_UU_AN2025.txt`, CUI 30976819, I13/I18/I20, confruntat cu dicționarul `.csv` | Număr mediu anual, nu total colaboratori/contracte sportive sau personal la bazin. Nu comparăm mecanic cu cerința de personal din anunț |
| Instructorii și antrenorii au roluri distincte în regulament | [Regulament aprobat 09.09.2025, pp. 8–10](https://scoala311bucuresti.ro/wp-content/uploads/2025/09/REGULAMENT-DE-ORGANIZARE-SI-FUNCTIONARE-BAZIN-311-VERS-finala-2.pdf) | Nu avem anexele contractelor din 2026; documentul corectează sugestia că diferența de denumire ar fi inexplicabilă |

Fișa de control este [company-evidence.json](company-evidence.json): nume/roluri/CUI, numere de linii din CSV, checksum-urile fișierelor complete și rezultatul boolean al verificărilor de identitate. Nu conține datele de naștere sau domiciliile. [verify-company-sources.py](verify-company-sources.py) reproduce extracția numai din cache-ul public local, fără rețea sau scrieri în baza de date. [mm-selection.sql](mm-selection.sql) și [mm-records.json](mm-records.json) păstrează achizițiile suplimentare și lipsa payloadurilor explicită.

Surse primare pentru reproducere:

- [ONRC, setul din 08.07.2026](https://data.gov.ro/dataset/firme-08-07-2026): [firme](https://data.gov.ro/dataset/6f73f5a0-f981-4676-85fa-3a66a963984e/resource/fc12eb5c-ce0f-46f1-8ef9-216925d3009d/download/od_firme.csv), [reprezentanți](https://data.gov.ro/dataset/6f73f5a0-f981-4676-85fa-3a66a963984e/resource/74103c0f-71c6-47be-a873-d78f18d5c8e3/download/od_reprezentanti_legali.csv). Fișierele mari se păstrează în cache-ul extern, nu în Git.
- [MF, situații financiare 2025](https://data.gov.ro/dataset/situatii_financiare_2025): [date UU](https://data.gov.ro/dataset/e2266fdc-0a6b-43b8-9c9f-7a6943d85b28/resource/eeecc692-d914-4d3b-b7f5-d1a8a9791979/download/web_uu_an2025.txt), [dicționar](https://data.gov.ro/dataset/e2266fdc-0a6b-43b8-9c9f-7a6943d85b28/resource/f5e400c8-3bfa-42fc-8d7b-01d389ac9e07/download/web_uu_an2025.csv).

## Proprietatea și pistele istorice

[Bianca Albu, Buletin de București, 14.06.2021](https://buletin.de/bucuresti/ce-afaceri-are-si-cat-de-bogat-este-primarul-ilfovean-cercetat-intr-un-dosar-de-viol/) îi identifică pe Micu și Bosolac drept deținătorii BNC. Articolul nostru atribuie explicit această informație presei și anului 2021. Nu avem extrasul actual sau cotele. Titlul articolului-sursă privește un alt caz: acuzațiile de acolo nu sunt atribuite administratorilor BNC sau școlii.

Aceeași sursă și [B365, 04.04.2012](https://b365.ro/in-sectorul-lui-poteras-un-apropiat-al-pdl-face-curat-in-piete-pe-bani-grei-155162/) descriu o relație de afaceri istorică Bosolac–Ionuț Raicu. Nu am găsit actul primar al cesiunii și nici o legătură demonstrată cu selecția de la Școala 311 în 2026. Pista nu este inclusă ca explicație a atribuirilor. Alte cauze penale și relații politice din aceste articole nu au fost adăugate pentru efect retoric.

Micu are nume normalizat și dată de naștere concordante între BNC și M&M, dar forma localității diferă. Articolul folosește conexiunea mai bine documentată prin Bosolac. Nicio persoană cu nume asemănător din alte instituții, găsită în căutările după declarații, nu a fost atribuită școlii fără identificare.

## Documente de selecție și ce urmează

Anunțul din decembrie include cerințe de experiență, personal inclusiv prin contracte sportive și afiliere la două federații. Avem nevoie de documentația aplicabilă efectiv în septembrie 2026 și de dovezile de îndeplinire, nu de o presupunere că regulile vechi au rămas identice. Cele nouă persoane din bilanț nu dovedesc neîndeplinirea unei cerințe care include alt tip de contracte și alt reper temporal.

A fost consultat și [anunțul 863/03.09.2025](https://scoala311bucuresti.ro/wp-content/uploads/2025/09/Anunt-public.pdf): prima pagină a fost verificată vizual, interval 03–05.09.2025. PDF scanat; nu afirmăm că am verificat vizual toate cele trei pagini. Nu îl folosim în articol în locul documentului complet lizibil din decembrie. Documentele externe au linkuri în articol; nu pretindem că întreaga arhivă PDF este disponibilă prin aplicație.

Priorități: actele de proprietate/mandate la datele relevante; circuitul nominal al deciziei de achiziție; criteriile/ofertele și evaluarea; subcontractanții și relațiile declarate; dovada prestațiilor. Solicitările au fost extinse, **nu trimise**. Nu a fost demonstrată o relație personală/de afaceri între conducerea școlii și administratori. Absența unei dovezi în căutările făcute nu certifică absența oricărei relații.

## Observații tehnice descoperite, nereparate în această documentare

1. Importatorul ONRC `roDate` acceptă numai `DD/MM/YYYY`, dar fișierul conține și `DD/MM/YYYY HH:MM:SS`. La reprezentanții BNC, data devine NULL în `reference.company_reps`, iar `person_key` diferă de cel al reprezentanților M&M. De aceea interogarea după cheia identică nu a găsit legătura. Documentarea folosește CSV-ul original și normalizează ora numai pentru comparație. Este un posibil fals negativ în grafurile/semnalele de conexiuni; remedierea importatorului și reimportul necesită un task separat cu verificarea impactului. **Nicio modificare de DB sau recalculare făcută aici.**
2. `reference.company_financials.profit_net` este NULL pentru BNC 2025, însă fișierul original are I18=999104. Dicționarul scrie „Profit net”, iar expresia importatorului `profitul?` nu acoperă această formă. Articolul citează fișierul primar și dicționarul, nu valoarea NULL din tabel. Reparația importului rămâne separată.

Nu s-au făcut cereri SEAP, accesări ale datelor private, operațiuni pe producție, mesaje către persoane sau publicări.
