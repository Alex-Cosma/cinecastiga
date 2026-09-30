# Căutare: instituția înaintea potrivirilor din titluri

30 septembrie 2026, implementare locală pe `fix/acquisition-details-dates`, după aprobarea următorului pas din auditul de încredere. Fără migrații noi, reindexare, trafic SEAP sau intervenție în producție.

## Comportament

- În „Toate”, o potrivire puternică de nume/CUI apare înaintea rezultatelor din titluri. „Primăria Cluj” evidențiază Municipiul Cluj-Napoca, cu județ/CUI și acces la profil sau secțiunea „Toate achizițiile”.
- Identificarea folosește reguli explicite: CUI exact (acceptă și prefixul RO), nume normalizat exact sau denumire administrativă la începutul numelui, folosind aliasurile existente Primăria/CJ/Prefectura. Un subiect precum „iluminat”, un județ simplu sau un fragment de CUI nu declanșează sugestia.
- Relevanța numelui/CUI precede valoarea achizițiilor în ordinea entităților; nu căutăm doar printre primele trei rezultate ordonate anterior după bani. Filtrele de loc/perioadă/tip/rol și modul de potrivire rămân aplicate.
- Nu se aleg automat instituții și nu se rescrie căutarea textuală. Totalurile achizițiilor/documentelor rămân cele ale expresiei introduse. Într-o categorie aleasă explicit, sugestia nu ocupă spațiu deasupra rezultatelor.
- Entitățile cu nume identice rămân separate după ID/CUI. Prima potrivire este vizibilă; celelalte din previzualizare sunt într-un disclosure nativ. CUI-ul absent este explicit. Nu deduplicăm sau reparăm identități prin asemănarea numelui.
- „Toate achizițiile” duce la `/entitati/:id?rol=autoritate#achizitii` (sau furnizor), lista completă existentă. Nu transmite filtrul textual ca și cum acesta ar selecta toate achizițiile instituției. Când sunt aplicate filtre de activitate, o precizare arată că profilul deschis este complet.
- Categoriile sunt Toate / Instituții și firme / Achiziții / Documente. Pe mobil formează o grilă 2×2 fără categorie ascunsă lateral. Filtrele secundare sunt pliate sub un buton accesibil; selecția activă rămâne în rezumat. Desktopul păstrează câmpurile vizibile.
- La încărcare/eroare nu afișăm o sugestie de instituție din căutarea precedentă ca fiind nouă. Restul mecanismului de rezultate păstrate rămâne etichetat cu selecția precedentă.

## Verificare

22 de teste trecute, inclusiv 16 integrări PostgreSQL reale în `seap_test_search_intent`: identități distincte cu același nume, relevanță înaintea volumului, aliasuri/CUI, filtre, categorii explicite, subiecte fără sugestii și regresiile existente pentru documente, geografie, perioade, precizie și deduplicarea contractelor. TypeScript și build web trecute; build separat de dev, în `.next-search-intent-check`.

Browser Chrome real, anonim: verificat la 1440, 390 și 320 px, cu categoriile complet vizibile, filtre accesibile din tastatură, selecția păstrată în rezumat, Back, navigare către secțiunea reală de achiziții și sugestii absente pentru subiecte/categorii explicite. Fără overflow sau erori JS; temele light/dark și reduced motion verificate. Baza izolată și build-ul temporar au fost eliminate după verificare.

Dovezile browserului sunt păstrate local în `.impeccable/review/search-intent-20260930/` (ignorate de Git). Nu reprezintă verificare în producție sau pe dispozitive fizice.

Redesignul `/semnale`, simplificarea traseului de verificare și pagina despre proiect/corecturi rămân sarcini separate. Publicarea întregului branch are în continuare condițiile tranziției calendarului descrise în HANDOFF.
