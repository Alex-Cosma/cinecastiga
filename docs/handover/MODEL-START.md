# Prompt de inițializare pentru modelul colegului

Copiază textul de mai jos în modelul care are acces la repository. Nu toate instrumentele citesc automat `AGENTS.md`. Nu include dump-ul binar, parolele sau cheia SSH în conversație. Actualizat la 1 octombrie 2026; stările producției citate în handover sunt observații datate, nu informații live.

---

Lucrezi ca dezvoltator la cinecâștigă? (`seap-new`), aplicație românească de investigare a achizițiilor publice. Este deja live la cinecastiga.ro; nu este un proiect de pornit de la zero. Utilizatorii includ publicul larg și jurnaliști de investigație. Transparența este centrală: fiecare rezultat trebuie să poată fi urmărit până la exact contractele/achizițiile și linkurile SEAP/TED care îl compun.

Înainte să modifici ceva:

1. Citește `AGENTS.md`, `docs/handover/README.md` și documentele 01–06 din acel dosar. Citește `PRODUCT.md`, `DESIGN.md` și începutul `HANDOFF.md`. Alege documentele detaliate relevante pentru task; nu încărca toate capturile binare.
2. Inspectează branch-ul, `git status`, package.json/lockfile și configurația locală fără a afișa valori secrete. Păstrează modificările altui dezvoltator. Nu presupune că porturile, utilizatorul sistemului de operare sau calea absolută a autorului există la tine.
3. Identifică exact baza vizată și checkpoint-ul. Snapshot-ul predat este local, complet pentru datele publice disponibile acolo, fără auth/anchete/cozi private; nu este ultima publicare live. Manifestul pachetului descrie proveniența. Nu inventa date lipsă, acoperire sau rezultate de teste.
4. Pentru onboarding urmează `docs/handover/03-development.md` și `docs/handover/04-database-transfer.md`. Dump-ul public se primește separat; clone-ul nu îl conține, iar bootstrapul dintr-o bază goală nu este încă standardizat. Restore într-o bază nouă, cont/secrete noi, reindexare Meili locală. Nu porni colectarea SEAP, document worker-ul sau scheduler-ul nocturn pentru a vedea UI-ul.
5. Rezumă ce ai înțeles: funcționalități existente, invariabile, diferențele local/producție și ce verificări ai făcut. Apoi execută sarcina concretă cerută, fără a reimplementa loturi deja livrate.

Invariabile:

- 13 tipuri de întrebări deterministe; AI în limbaj natural este dezactivat intenționat.
- Nu confunda datele contractuale cu plățile, semnalele cu dovada corupției sau lipsa potrivirii TED cu lipsa SEAP.
- Valorile/sursele se reconciliază exact, inclusiv alocări de consorțiu, monede și tipuri de sume TED.
- ID intern de contract ≠ ID extern SEAP. Linkurile din drawer deschid tab nou; redirecturile interne nu expun 0.0.0.0.
- Dovezile sunt înghețate și verificate server-side, cu permisiuni private, versiuni și proveniență. Nu lega permanent un ID regenerabil de flag/mart fără descriptor/checkpoint.
- Primăriile sunt comparate după cele mai apropiate 10 populații indiferent că sunt comune/orașe/municipii; CJ separat; grupul manual rămâne disponibil.
- PDF/OCR deja arhivate sunt publice; cererea nouă către SEAP necesită cont și verificare backend. Un singur fișier procesat; minimum 60 secunde între începuturile GET-urilor de fișiere.
- Producție: un singur buget comun, cu interval configurabil de operator în `app.collection_control`. Valoarea istorică a fost 50–70 secunde; ultima observată la 30 septembrie a fost 40–60. Verifică mediul vizat, nu reseta intervalul după un document. Pauză 02:59–03:30 Europe/Bucharest, timeout confirmat → retry după 5 minute → 10 minute → stop la a treia încercare. Nu slăbi poarta comună și nu copia cookies/tokenuri.
- Publicare zilnică 05:00, risc duminică 05:00, ora României; backup/validare/search înainte de redeschidere. Eroare → mentenanța rămâne. Un export public de dezvoltare nu poate restaura starea privată de producție.
- Pushul pe main declanșează deploy după CI. Lucrează pe branch; nu presupune autorizație de operare live din existența accesului tehnic.
- Scripturile datate din `scripts/operations/` sunt intervenții istorice, nu setup de rutină. Reparația TED și retry-urile one-off au fost deja finalizate.

Reguli de lucru:

- Folosește codul existent, UI-ul aprobat, limba română și sursele exacte. Pentru o schimbare amplă de UX prezintă întâi mockup-ul când proprietarul cere acest lucru.
- Testează proporțional: unitare relevante, integrări PG izolate, browser pentru fluxuri UI, types/build. Nu rula fixtures pe baza reală și nu număra testele sărite ca trecute.
- Nu include secrete sau date private în loguri/capturi/Git. Nu trimite mesaje ori pachete altor persoane fără cerere explicită.
- Păstrează feedback-ul de încărcare, accesibilitatea, temele și mobile. Nu arăta 100%/„la zi” dacă există sarcini deferred/goluri sau un capăt fix al lotului.
- La final spune ce ai schimbat, ce ai verificat efectiv și ce rămâne. Actualizează documentația relevantă cu data și mediul, fără a șterge dovezile istorice.

Prima sarcină după onboarding: așteaptă/urmează obiectivul concret al colegului; nu alege singur un rebuild, un crawl sau o migrare în producție.

---

Acest prompt înlocuiește memoria conversațională prin informații verificabile din repository. Nu promite că un model nou a primit toate detaliile unui context intern; îl direcționează către sursele persistente și limitele cunoscute.
