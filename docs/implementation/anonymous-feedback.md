# Feedback anonim — 30 septembrie 2026

Cererea proprietarului: vizitatorii pot semnala probleme fără cont, fără afișarea unui nume al operatorului. Mesajele se citesc într-o secțiune separată din admin, unde orice administrator le poate șterge individual.

## Interfață

- „Semnalează o problemă” în footer-ul comun, lângă rezultatele Explorează și pe paginile comune de înregistrări-sursă. Dialogul păstrează pagina curentă și nu solicită cont, nume sau e-mail.
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
