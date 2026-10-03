# Feedback anonim — 30 septembrie 2026

Cererea proprietarului: vizitatorii pot semnala probleme fără cont, fără afișarea unui nume al operatorului. Mesajele se citesc într-o secțiune separată din admin, unde orice administrator le poate șterge individual.

## Interfață

- Din 2 octombrie 2026 (branch `feat/floating-feedback`): un singur punct de intrare, butonul plutitor „Feedback”: tab lipit de marginea dreaptă de la 1360px în sus, buton rotund în colțul din dreapta jos sub 1360px; ascuns în `/admin` și la tipărire. Înlocuiește cele trei linkuri „Semnalează o problemă” (footer, lângă rezultatele Explorează, paginile de înregistrări-sursă). Dialogul păstrează pagina curentă și nu solicită cont, nume sau e-mail. Detalii în secțiunea de la final.
- Tip: problemă cu datele, funcționare, sugestie, altceva. Descriere de20–3.000 caractere. Pagina publică atașată este vizibilă în formular; nu atașăm titlul paginii, parametrii URL, fragmente sau identificatori de anchete/invitații/private. Pentru detaliile întrebării ori filtrului, vizitatorul le poate descrie în mesaj.
- Trimiterea are loading, eroare și confirmare; textul rămâne disponibil după eroare, iar reîncercarea unei trimiteri identice nu creează duplicate. ID-ul client UUID este o cheie de idempotență, nu o identitate. Nu există răspuns prin e-mail pentru raportul anonim.
- `/admin/feedback` este a șasea secțiune a navigării admin, nu un anchor într-o pagină lungă. Mesaje recente primele, maximum 10 pe pagină, total și paginare sus/jos, text expandabil și link către pagina raportată în tab nou. Ștergere cu confirmare explicită, feedback de succes/eroare și revenire pe pagina precedentă dacă ultima se golește.
- Mesajele nu sunt publicate; sunt afișate ca text, nu HTML. Pagina și API-ul de citire/ștergere sunt accesibile numai administratorilor. Conturile watchdog nu au acces.
- Secțiunea nu depinde de succesul colectării; rămâne utilizabilă la eroarea statusului și în mentenanță. Excepția exactă `/api/admin/feedback` din proxy păstrează autorizarea endpointului.

## Date și confidențialitate

Migrația `0045_anonymous_feedback` adaugă `app.feedback` (UUID, categorie, mesaj, cale publică, dată) și `app.feedback_limits`. Fără FK de utilizator, e-mail, adresă IP brută sau user-agent în mesaje. Chiar dacă expeditorul are sesiune, POST-ul public nu citește identitatea contului.

În mod voluntar, expeditorul ar putea scrie date personale în mesaj; formularul îi cere să nu le includă. Nu promitem anonimitate la nivel de furnizor de internet/CDN/loguri existente. Mecanismul de export pentru colaboratori are allowlist de date app publice; ambele tabele noi rămân excluse automat.

DELETE elimină rândul din baza activă. Nu introduce un jurnal separat care să copieze conținutul șters. Backup-urile operaționale existente au propriul ciclu de retenție.

## Protecții

- Validare server-side, body citit incremental cu limită 16 KiB, originea verificată față de public URL configurat, honeypot, câmpuri necunoscute refuzate, căi publice pe allowlist. Nu se fac cereri server către linkurile din mesaje.
- Rate limiting în PostgreSQL, cu tranzacție și advisory lock comun: 5 mesaje pe bucket client de 10 minute și 100 global pe bucket de 60 minute. Cheia client este HMAC cu secretul aplicației, rotită orar; o schimbare de oră poate începe un bucket nou. Nu este o garanție de plafon glisant exact pentru fiecare persoană și nu împiedică un atac distribuit.
- Cheile sunt separate de mesaje și nu sunt expuse în admin. Bucket-urile expirate nu mai limitează cereri și sunt curățate la următoarea trimitere acceptată; nu există un worker separat de ștergere la secundă.
- Identitatea tehnică a clientului este stabilită de Caddy: proxy-urile Cloudflare deja acceptate, `client_ip_headers CF-Connecting-IP`, apoi `header_up X-Feedback-Client-IP {client_ip}` suprascrie orice valoare trimisă de vizitator. Aplicația nu are încredere în X-Forwarded-For arbitrar. Fără noul header, producția folosește conservator un bucket comun `unknown`; local, un bucket `local`.
- Configurarea se bazează pe [Caddy: trusted proxies și client_ip_headers](https://caddyserver.com/docs/caddyfile/options#trusted_proxies) și [suprascrierea headerelor upstream](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers). Restricția existentă Cloudflare-only și portul web nepublicat trebuie păstrate.
- La deploy, configurația Caddy este validată și reîncărcată înainte de înlocuirea aplicației. Eroarea validării/reîncărcării oprește publicarea noii aplicații. Nu sunt repornite DB/Meilisearch/Caddy.

## Verificări și stare

- 30 teste unitare/API: validare, căi private/unsafe, body prea mare, HMAC, acces anon/watchdog/admin și protecție origin. 4 integrări PostgreSQL pe `seap_test_feedback_20260930`: idempotență/concurență, plafon, expirare, paginare/ștergere.
- 12 teste ale scriptului deploy trecute, inclusiv oprirea înaintea înlocuirii web la eroarea validării/reîncărcării proxy-ului. Configurația Caddy a trecut și validarea reală într-un container local `caddy:2-alpine`, fără rețea, cu domeniu/range-uri fixture. Nu este o verificare a Caddy-ului live.
- Build și TypeScript web, build DB trecute. Browser Chrome pe build de producție separat, numai DB sintetică: raport anonim real, răspuns pierdut/reîncercare fără duplicat,429 cu text păstrat, anon/watchdog refuzați, admin autorizat, 10 rânduri/pagină, confirmare/cancel/delete, text HTML inert, mentenanță și colectare indisponibilă, desktop/mobil 390/dark fără overflow sau erori JS. 30 verificări browser trecute. Probe în `.impeccable/review/feedback-20260930/`, ignorate de Git. Preview-ul3118, baza fixture și build-ul temporar au fost eliminate; serverul dev3000 rămâne pornit.
- Migrația 0045 a fost aplicată și bazei locale principale după verificarea istoriei: 46 intrări. Nu s-au inserat mesaje de test sau conturi în baza principală. Nu s-au făcut cereri SEAP, nu s-au pornit workeri și nu s-a schimbat producția.
- Fără commit/push/deploy în acest lot. Publicarea întregului branch cere în continuare tranziția calendarului `rf-2026.6` documentată în HANDOFF; feedback-ul în sine nu cere recalculări de date publice.

## Buton „Feedback” plutitor — 2 octombrie 2026

Cererea colaboratorului (cu acordul proprietarului privind alegerea funcționalităților): linkul din footer devine un buton plutitor pe partea dreaptă. [Mockup](../../mockups/floating-feedback/README.md) cu date fictive; aleasă varianta **A, lipit de marginea dreaptă, stil discret**. Decizii explicite: butonul este **singurul** punct de intrare (dispar și linkurile de lângă rezultate/surse), ascuns în `/admin`, compact pe telefon.

- `components/feedback/ReportProblem.tsx` randează butonul (pictogramă balon cu semn de exclamare + „Feedback”; nume accesibil „Feedback: semnalează o problemă sau trimite o sugestie”), într-un `<aside aria-label="Feedback">` pentru navigarea cu cititor de ecran, și același dialog. Montat o singură dată în `app/layout.tsx`, după footer.
- ≥1360px: tab vertical, centrat pe marginea dreaptă, unde shell-ul de 1256px lasă o margine reală (42–82px între tab și conținut). Sub 1360px: buton rotund de 48px, doar pictograma, în colțul din dreapta jos (24px; 16px sub 700px, plus zona sigură); footerul primește 72px jos ca finalul paginii să nu fie acoperit. Motiv: la 710–1340px tabul acoperea marginea conținutului și tăia o valoare exactă („3.919,40” → „3.919,4”) la 710px. Tokenuri existente (`--surface`, `--accent`, `--accent-line`, `--shadow2`), focus portocaliu comun desenat în interior ca să nu fie tăiat de marginea ecranului. `z-index:30`: peste subnavigațiile sticky (≤20), sub popover-e (40), tooltipuri și mesaje temporare; dialogurile modale îl acoperă.
- Corecție separată: `feedback.css` folosea variabilele inexistente `--ink-secondary` și `--line-strong`; câmpurile dialogului nu aveau contur, iar textele secundare aveau culoarea textului principal. Înlocuite cu `--ink2` și `--line2`.
- Comparații înainte/după (desktop 1440, mobil 390, întunecat) în [previews/floating-feedback](previews/floating-feedback/compare.md), capturate pe baza locală restaurată; `compare.json` consemnează HTTP 200, zero overflow și zero erori JS pe ambele variante.

Verificări (Windows, Node 22, baza locală `seap_collab_20261001`): TypeScript web; testele unitare web; build de producție; detectorul Impeccable (un avertisment de tranziție pe padding, eliminat; rămân doar observații consultative preexistente ale dialogului); critică Impeccable 31/40 (rulare într-un singur context, marcată „degraded”), cu acoperirea marginii pe telefon rezolvată ca mai sus; categoria „Problemă cu datele” era deja preselectată în dialog; verificări browser pe mockup (13 capturi, tastatură Tab/Enter/Escape cu revenirea focusului, contrast 9,6–10,1:1) și pe aplicație (un singur buton, niciun link vechi, z-index 30, fără overflow). Integrările PostgreSQL ale feedbackului nu au fost rerulate: logica de trimitere și API-ul nu s-au schimbat. Fără migrare, fără SEAP, fără deploy.

### Corecții după critica cu doi evaluatori (2 octombrie 2026)

Critica Impeccable a fost rerulată cu doi evaluatori independenți (recenzie de design, respectiv detector + browser): 26/40. Corectate în același branch:

- **Pagina atașată rămânea veche** după navigarea în aplicație (o singură instanță în layout actualiza calea doar la o ciornă nouă). Acum calea se recitește la fiecare deschidere; ciorna se păstrează. Verificat: `/intreaba` → Escape → navigare client la `/` → „Pagina atașată: /”, ciorna păstrată.
- **Validare în română:** formularul are `noValidate`, deci apare mesajul existent „Descrie problema în cel puțin 20 de caractere…” în locul bulei de validare a browserului (în engleză). Nota de sub câmp anunță din start „Cel puțin 20 de caractere.”
- **Placeholder** cu `--muted`, ca restul aplicației (cu `--ink2` părea text deja completat; efect secundar al corecției variabilelor). Contrast aproximativ 4,5:1 pe fundalul câmpului.
- **Poziționare** pe praguri, ca mai sus; pictogramă de raportare (vezi mai jos), eticheta „Feedback” păstrată la cererea utilizatorului; reperul `<aside>`.

Verificare browser (Chrome, 8 lățimi 1440–320): tab doar ≥1360px, fără suprapunere cu conținutul; sub prag buton rotund, niciun element din footer sub buton la finalul paginii; zero overflow și zero erori JS. Rămân neschimbate: focusul inițial pe butonul de închidere, comportamentul „Renunță” (păstrează ciorna), atașarea doar a căii `/intreaba`, fără parametrii întrebării (alegere de confidențialitate).

### A treia critică și ultimele ajustări (2 octombrie 2026)

A treia rulare cu doi evaluatori: 27/40, fără P0/P1. Decizii ale utilizatorului:

- **Pictograma:** un balon cu semn de exclamare (raportare) în locul steagului. Steagul putea fi citit ca „marchează acest contract” pe paginile „Semnale de risc”.
- **Notă când pagina se schimbă:** dacă o ciornă păstrată este redeschisă pe altă pagină, dialogul spune „Ai început mesajul pe … ; se atașează pagina de acum.”, ca raportul să nu indice tăcut altă pagină.
- **Focus și erori accesibile:** dialogul se deschide cu focusul în câmpul de text. Eroarea de lungime marchează câmpul `aria-invalid` și este legată prin `aria-describedby`.
- **Butonul rotund pe telefon rămâne neschimbat.** În timpul derulării poate trece peste conținut, ca orice buton plutitor; finalul paginii rămâne liber. Comentariul din CSS a fost corectat în acest sens.

Verificări: focus în câmp la deschidere; nicio notă pe aceeași pagină; nota corectă după navigarea client (`/semnale/24086173` → `/intreaba`), cu ciorna păstrată; `aria-invalid` activ doar cât eroarea e valabilă; zero erori JS. TypeScript, 370 teste unitare web (148 integrări sărite), build, detector (markup curat) și comparațiile reluate. Rămân pentru proprietar: atașarea întrebării publice din Explorează (regula de confidențialitate existentă) și eventual un link de salt pentru tastatură.
