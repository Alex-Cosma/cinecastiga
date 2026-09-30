# Verificarea unui răspuns, fără acțiuni repetitive

30 septembrie 2026, implementare locală pe `fix/acquisition-details-dates`. Următorul pas aprobat din auditul de încredere; păstrează identitatea vizuală, Anchetele, urmărirea și dovezile exacte. Nu schimbă formule, selecții sau permisiuni și nu pornește preluări SEAP.

## Explorează

- Ajustare de încadrare: titlul întrebării are 30 px pe desktop (anterior 32), astfel încât întrebarea implicită și semnul întrebării încap pe un singur rând la 1200–1440 px. Mobilul păstrează 26 px și rearanjarea naturală. Verificat în Chrome la 320/390/1024/1200/1280/1440 px, fără overflow; stilul „Toate întrebările” nu se schimbă.
- Întrebarea inițială folosește acum „toți anii disponibili”, fără filtru anual implicit. Topul național de 10 furnizori folosește astfel agregatele existente. Întrebările salvate/linkurile și anii aleși explicit rămân păstrate; nu s-au adăugat agregate anuale sau execuție automată la intrarea pe pagina fără parametri. Verificat local: 38 teste ale constructorului și TypeScript trecute; browser cu răspuns real pe varianta implicită (139 ms raportate de calcul, nu SLA) și link 2025 cu răspuns interceptat, perioada păstrată.
- Un singur acces principal la întreaga selecție: „Vezi cele N achiziții” pentru achiziții directe cu număr cunoscut; „Vezi cele N înregistrări” pentru surse mixte/contracte. Un contract cu mai mulți câștigători poate produce mai multe rânduri, deci nu promitem N contracte distincte.
- Pentru clasamente și celelalte rezultate care nu expun numărul complet al surselor: „Vezi înregistrările sursă”, fără a însuma greșit un top N. Zero rezultate păstrează posibilitatea de inspectare a selecției goale.
- Eliminat panoul „Verifică tu”, invitația mare „Deschide sursele”, eticheta redundantă „Verificabil, până la sursă” și butonul separat „Datele și exportul CSV”. Eliminate și stilurile decorative devenite nefolosite.
- Rândurile/barele/graficele continuă să deschidă sursele **propriei selecții**; aceste acțiuni locale nu sunt redundante cu accesul la populația completă și au fost păstrate.
- „Cum s-a calculat” este un disclosure lângă rezultat, înaintea vizualizării; metodologia și SQL-ul avansat rămân disponibile. Precizările importante despre selecție și profilurile istorice nu sunt eliminate.
- „Exportă” grupează două descărcări reale: rezultatul afișat (agregate/rândurile curente/exemple, după tipul răspunsului) și înregistrările sursă (valorile exacte și legăturile oficiale). Nu există un al doilea pas obligatoriu prin drawer pentru exportul nefiltrat.
- Exportul surselor folosește endpointul public existent, cu limita existentă de 100.000 de rânduri. Componenta explică limita înainte de descărcare și folosește numerele returnate de server pentru confirmarea exportului parțial/integral. Erorile JSON cu HTTP200 nu sunt salvate ca CSV. Numărători absente/invalide împiedică o confirmare falsă.
- Helperul de descărcare este comun cu drawerul. În drawer se păstrează exportul selecției complete/filtrate, sortarea și suportul pentru comparații/legături. Cererile vechi sunt anulate la schimbarea rezultatului sau închiderea componentei.
- Copierea întrebării rămâne disponibilă tuturor. Din actualizarea [întrebărilor locale](local-saved-questions.md), salvarea în Anchete și urmărirea sunt vizibile doar după autentificare. Exporturile folosesc întrebarea **aplicată**, nu modificările încă nerulate.

## Încărcarea drawerului de surse

Actualizare locală, 30 septembrie: la deschidere, un indicator animat cu „Se încarcă înregistrările sursă…” apare sub antet, în afara zonei care derulează. Lista și totalurile au un schelet vizual până la primul răspuns; nu apar totaluri goale sau un mesaj fals de absență a rezultatelor. Filtrarea, sortarea și paginarea păstrează lista anterioară, estompată și `inert`, cu mesajul „Se actualizează lista…”. După 8 secunde, textul explică faptul că selecțiile mari pot dura mai mult, fără procente inventate. Indicatorul folosește `role=status`; animația respectă preferința de mișcare redusă. Închiderea, anularea cererii și reîncercarea după eroare rămân disponibile.

TypeScript trecut. Chrome desktop 1440 și mobil 390: răspuns real local reținut prin interceptare pentru simularea latenței; încărcare inițială, mesaj lent, rezultate, filtrare fără micșorarea tabelului, eroare/reîncercare, Escape/închidere în timpul cererii și mișcare redusă verificate. Fără overflow sau erori JS. Probe în `.impeccable/review/drawer-loading-20260930/`, ignorate de Git. Fără trafic SEAP ori modificări DB.

## Fișierele contractului

Invitația de a căuta/cita apare numai când există documente procesate. Formularul de căutare apare când există text pregătit, în loc să ocupe spațiu cu câmpuri inactive. Când nu avem asociere verificată cu un anunț compatibil, afișăm starea și linkul anunțului de atribuire în aceeași secțiune, dacă este disponibil. Nu deducem că SEAP nu are documente. Fișierele existente și descărcarea/procesarea autorizată rămân neschimbate.

## Verificare și publicare

41 de teste unitare trecute: exportul comun, selecții/surse, filtre și documente. TypeScript și build web validate separat de serverul dev. Browserul folosește arhiva locală pentru rezultatul/CSV-urile reale; răspunsurile de export parțial/eroare sunt fixture-uri de rețea, fără modificări în DB. Browser Chrome real, anonim, desktop 1440 și mobil 390/light/dark: descărcări CSV reale, identitate între exportul din răspuns și cel din drawer, selecția proprie a unui rând din clasament, acces la metodologie/SQL, tastatură, stări fără documente și arhivă publică. Fără overflow ori erori JS. Ancora secțiunii Fișiere păstrează titlul sub antetul fix. Probe locale în `.impeccable/review/answer-actions-20260930/` (ignorate de Git).

Fără migrare, reprocesare, commit/push/deploy sau trafic către SEAP. Publicarea întregului branch cere în continuare tranziția calendarului deja documentată în HANDOFF. Redesignul `/semnale` rămâne amânat; despre proiect/corecturi este următoarea propunere.
