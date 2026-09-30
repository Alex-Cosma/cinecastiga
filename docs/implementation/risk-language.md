# Limbajul semnalelor de risc — 30 septembrie 2026

Implementat local, pe `fix/acquisition-details-dates`, peste lotul de detalii/calendar încă nepublicat. Cererea utilizatorului: corectarea limbajului semnalelor după auditul scepticului, păstrând identitatea vizuală și sursele. Fără commit, push, deploy, cereri SEAP sau recalculări.

## Ce s-a schimbat

- Revizuite cele 13 definiții în registrul web și registrul ingestion; titlurile/descriptions/rationale/caveat sunt sincronizate. Sunt eliminate afirmațiile despre intenție, venituri încasate sau control care nu rezultă din date.
- „Posibilă fracționare sub prag”, „Finalizare rapidă”, „Puțini salariați, valori contractate mari”, „Reprezentant comun, aceeași autoritate” numesc observația/pista. Documentele/metodologia explică ce se verifică și limitele interpretării. Nu sunt schimbate codurile semnalelor, formulele, pragurile sau clasificarea CRI.
- Banii contractați și cifra de afaceri sunt comparați ca mărimi distincte. Raportul poate depăși 100%; nu descrie ponderea încasărilor de la stat. Media salariaților din bilanț nu dovedește singură capacitatea de execuție. Eliminat indicatorul aparent „per salariat” când calculul intern împărțea la cel puțin 1, inclusiv pentru zero salariați.
- `lib/risk-presentation.ts`: explicații comune pentru profil și lista semnalelor. Perioada `all` înseamnă întreaga perioadă disponibilă la calcul, nu anul curent; lipsa perioadei/valorilor este explicită.
- Apropierea de prag arată diferența exactă. Exemplu local: semnal **26357414**, 270.119 lei, **cu 1 leu sub 270.120 lei**, tip „produse / servicii”; codul tehnic nu mai este textul principal.
- Pentru diferență, cele două valori sunt extrase din PostgreSQL ca text (`->>`) înaintea conversiei JSON în numere JS. Scădere decimală cu BigInt, fără rotunjire la 100%. Modificarea e doar în proiecția pentru afișare; nu rescrie JSON-ul stocat, capturi sau selecții de surse.
- Profilul explică scorul lângă valoare: numărul criteriilor din **5 pentru autorități / 4 pentru furnizori**, exclusiv achiziții directe. Disclosure cu toate criteriile și starea lor; linkul de lângă scor deschide nativ disclosure-ul prin ținta fragmentului. Filtrul anului din tabel nu schimbă CRI.
- Profilurile fără un rând CRI calculat afișează „necalculat”, nu zero ca rezultat al unei evaluări. La scor zero, eticheta precizează că nu e îndeplinit niciun criteriu; alte tipuri de semnale pot exista.
- `/metodologie#indice` explică numitorul fix, populația, pragurile de agregare pentru rapid/aproape de plafon, perioadele istorice și faptul că celelalte tipuri de semnale nu intră în CRI. „De ce e un risc” devine „Ce merită verificat”.
- Pagina surselor afișează observația și perioada, plus limitele semnalului; linkurile SEAP, salvarea și exportul rămân disponibile.

## Verificare

- **54 teste web trecute**, fără teste DB sărite în aceste suite: risk-presentation 14, signals 15, ResultComparison 5, format 8, source-evidence 6, evidence-captures 6.
- Typecheck web și ingestion trecute. Build optimizat web trecut cu `NEXT_DIST_DIR=.next-risk-check`, separat de dev. Directorul temporar și cele două includeri TypeScript generate au fost eliminate.
- Browser Chrome real, anonim, desktop 1440 și mobil 390; confirmare și în dark/reduced-motion. Profil Buzău `/entitati/2144364`: 3/5 și 0,60 corespund rândului local; linkul din card deschide explicația. Metodologia și sursa `/semnale/26357414` răspund 200, fără overflow/erori JS. Exemplul de un leu și linkul oficial sunt prezente. Nicio navigare la SEAP/TED.
- Dovezi locale ignorate de Git: `.impeccable/review/risk-language-20260930/`, inclusiv `checks.json` și `confirmation.json`.

## Problemă observată în acest lot; rezolvată ulterior local

`/semnale?tip=da_round` și `/semnale?tip=fin_public_reliance&rol=supplier` au răspuns **500 local**. PostgreSQL raportează `canceling statement due to statement timeout` pentru numărările populației de semnale (limita de 20s). Codul acestor numărări nu a fost modificat în acest lot; schimbarea din `readSignalPage` este numai proiecția valorilor exacte după selecția paginii.

La încheierea lotului de limbaj, lista generală nu fusese verificată vizual cu succes. **Intervenția ulterioară din 30 septembrie rezolvă local aceste timeouturi**, cu o vedere materializată completă, integrată în procesarea zilnică/săptămânală și verificată în browser: [implementare și măsurători](signal-timeout.md). Limita web de 20s și totalurile complete sunt păstrate. Producția nu a fost modificată.

## Publicare

Acest lot de limbaj, luat separat, nu cere recalculare sau migrare. **Branchul mai conține însă schimbarea calendarului și `rf-2026.6` din lotul precedent**, care cere tranziția controlată descrisă în [detalii/calendar](acquisition-details-calendar.md). Nu publica întregul branch ca un simplu update de texte și nu porni reprocesarea fără autorizarea intervenției.

Capturile private/frozen și etichetele istorice deja salvate nu sunt rescrise. Exporturile și sursele păstrează valorile și metodologia înregistrată.
