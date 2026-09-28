# Explorează — propunere compactă, 28 septembrie 2026

Utilizatorul cere eficientizarea părții de sus din `/intreaba`: prea mult spațiu și prea multe introduceri înaintea instrumentului. Propunerea este o **schiță vizuală**, obținută prin rearanjarea DOM-ului într-un browser temporar; nu modifică sursele aplicației și nu execută interogări sau mutații. Catalogul, AI-ul, filtrele, rețetele și motorul real sunt neschimbate.

Deschide `http://127.0.0.1:3112/explore-compact/` pe serverul existent de mockupuri sau servește `mockups` cu `python3 -m http.server 3112 --bind 127.0.0.1 --directory mockups`.

## Propunere

- Titlu scurt Explorează, cu Caută un subiect și Rețetele mele în antet.
- Eliminarea din această pagină a sloganului, breadcrumbului decorativ, rândului redundant Construiește/AI dezactivat și etichetei Întrebarea ta/01 din13.
- Păstrarea frazei editabile ca element principal; explicație scurtă lângă ea.
- Trei scurtături și Toate întrebările13 pe desktop; un singur selector pentru tipul întrebării pe mobil, cu acces la toate13.
- Gruparea pragului minim și selecției precise în Mai multe filtre. **La implementare, condițiile deja active trebuie să rămână vizibile în rezumat, iar erorile trebuie să deschidă secțiunea; schița arată numai starea inițială fără astfel de condiții.** Controalele interne trebuie aplatizate, fără încă un nivel de foldere unul în altul.
- Sursele, metodologia, populația efectivă, datele necunoscute și mesajele despre modificări neaplicate rămân lângă rezultat. Nu simplificăm semantica în numele densității.
- Păstrarea tuturor scenariilor builderului, a rețetelor private, a accesibilității și a modului AI dezactivat pe backend. Eliminarea tabului inactiv nu îl activează.

## Măsurători și limite

Desktop1440×1000: prima alegere598→282px, Vezi răspunsul989→528px. Mobil390×844: prima alegere712→339px, buton1151→744px, în întregime vizibil. Nicio lățime de pagină peste viewport. Coordonatele sunt ale stării inițiale reprezentate, nu o garanție pentru toate13formele de întrebare.

Capturile sunt vizuale, nu un mockup al motorului. Datele nu au fost fabricate, anul2025 este alegerea inițială reală a constructorului existent, nu o afirmație despre actualitatea arhivei. Nu au fost introduse rezultate simulate. Varianta dark corectează în schiță suprafețele constructorului, care folosește încă culori light fixate în CSS; acest lucru va trebui tratat la implementare.

Review vizual în același fir: desktop/light și mobil/light-dark inspectate; aprobabil la scopul discuției de layout. Canonul PRODUCT/DESIGN nu se schimbă. Nu reprezintă validare funcțională, implementare sau deploy. Capturile sunt servite fără dependențe de aplicație după generare.

## Aprobare și implementare

Schița a fost aprobată cu cerința explicită de a păstra stilul „Toate întrebările”. Implementarea locală păstrează butonul original, iconița plus și numărul 13 și pe mobil; selectorul mobil din schiță nu este autoritatea finală. Vezi [implementarea](../../docs/implementation/explore-compact.md) și http://localhost:3000/intreaba. Imaginile acestei schițe rămân documente istorice ale propunerii.
