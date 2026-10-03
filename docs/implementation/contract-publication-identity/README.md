# DQ-02 — contracte repetate între publicații

Început la 3 octombrie 2026, după pregătirea reparației monetare. **Diagnostic local; nu face parte din operațiunea de producție programată pentru 4 octombrie.**

## Ce am verificat suplimentar

[Interogarea](triage.sql) restrânge întâi domeniul la numerele de anunț repetate, apoi compară instituția, numărul/data/valoarea/moneda contractului, titlul, loturile și setul de câștigători. Verifică separat CPV-ul, multiplicitatea în interiorul aceleiași publicații și arhiva disponibilă. [Rezultat](triage.json), 13,927 secunde, conexiune read-only, work_mem 8 MB, fără paralelizare.

- 8.069 perechi candidate; fiecare conține exact un contract din fiecare dintre două ID-uri de anunț.
- Toate sunt declarate RON; nu am găsit conflicte de CPV între membri sau lipsa listei câștigătorilor.
- Nicio pereche nu are mai mulți membri identici în aceeași publicație; cazurile ambigue de tip „două contracte identice într-un lot” nu apar în acest set.
- 7.312 perechi au ambii membri incluși în statistica originală.
- **Nicio pereche nu are ambele răspunsuri contractuale în arhiva locală.** Existența documentului a fost verificată prin raw_id și endpoint, nu presupusă din prezența ID-ului. Confirmarea semantică a unei republicări rămâne limitată de această lipsă.

Cifra de 7.310.553.827,47 lei din audit este în continuare impact candidat pe snapshotul original. Nu este o reducere aplicată și nu reprezintă prejudiciu. Corecția monetară poate modifica populația eligibilă; diferența finală trebuie măsurată după acea corecție.

## Implementarea propusă pentru următorul pas

1. Registru de candidați, cu amprenta exactă a câmpurilor comparate, ID-urile ambelor publicații și motivul potrivirii. Separat de datele brute; sursele rămân accesibile.
2. Decizie explicită pentru fiecare grup: confirmat același contract / distinct / insuficient documentat. Regula nu se bazează numai pe număr și valoare, nici pe alegerea automată a celui mai nou anunț. Diferențele de dată, monedă, valoare, lot, CPV sau câștigători blochează potrivirea automată; câmpurile esențiale lipsă și multiplicările interne cer revizuire.
3. Pentru grupurile confirmate: identitate canonică stabilă și aliasuri pentru fiecare ID SEAP, o singură contribuție în calcule, toate publicațiile disponibile ca dovezi. Pagina contractului explică gruparea și permite deschiderea fiecărei surse. Nu ștergem rânduri și nu rescriem capturile istorice ale anchetelor.
4. Teste negative pentru contracte subsecvente/loturi distincte care au aceeași sumă și pentru republicări cu valori diferite; idempotență la import, invalidarea unei decizii dacă se schimbă datele relevante.
5. Simulare separată pe copie: fiecare reducere cu ID-uri și motiv, diferențe pe instituție, furnizor, an și CPV; abia apoi recalculare și publicare controlată.

Mai întâi trebuie inspectate relațiile de procedură/anunț din arhiva disponibilă și originea importului vechi. Dacă nu există dovezi pentru echivalență, păstrăm candidatul de verificat; nu transformăm similitudinea într-o certitudine. Nu pornim recrawl SEAP implicit.
