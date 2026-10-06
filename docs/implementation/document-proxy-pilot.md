# Proxy pentru documente — pilot local

6 octombrie 2026. Branch `feat/document-proxy-pilot`. Integrare locală; fără deploy, cont de furnizor creat de agent sau schimbare a ritmului. Utilizatorul a furnizat ulterior un export cu 10 proxy-uri: importat local, cu unul singur activ pentru pilot. Verificarea reală a acelui proxy a trecut: o navigare HTTPS la endpointul Webshare, IP-ul observat corespunde endpointului configurat. Ulterior, pilotul SEAP autorizat a reușit: **5 cereri, toate HTTP 200, un PDF și 10 pagini OCR**. Vezi rezultatul de mai jos. Producția nu a fost modificată; workerul local s-a oprit.

Linkul de export furnizat inițial a fost respins de Webshare cu HTTP 400 / `download_token` (două încercări). Nu este păstrat în documentație, fiind un secret. Importul s-a făcut din `Webshare 10 proxies.txt`; fișierul original și cele două configurații au permisiuni 0600 și sunt ignorate de Git. Lista completă este `apps/web/seap-proxies-pool.local`, iar selecția de test `apps/web/seap-proxies.local`. Pentru configurare: două încercări pentru export și o verificare prin proxy la Webshare. Pilotul ulterior adaugă exact cinci cereri SEAP, fără reîncercări.

## Comportament

`apps/web/lib/documents/seap.ts` încarcă opțional configurația proxy înainte de browser. Alege un endpoint o singură dată pentru întreaga sesiune: pagina anunțului → toate paginile listei → POST de verificare → GET al fișierului. Cookie-urile rămân în același context Chromium. O listă cu mai multe endpointuri permite alegerea aleatoare **între joburi**, niciodată între cererile aceluiași job. Nu se încearcă alt proxy după o eroare.

Prima versiune acceptă endpointuri HTTP(S) cu IP fix și autentificare username/parolă, compatibile cu Webshare **Proxy Server / Datacenter, Direct Connection**. Nu acceptă hostname-uri pentru gateway-uri rotative. Configurarea presupune că furnizorul oferă o ieșire fixă pentru endpoint; un IP de gateway nu garantează singur acest lucru. Preflight-ul verifică IP-ul observat înainte de pilot. Nu se folosește cheia API Webshare.

- `DOCUMENTS_PROXY_FILE`: calea către lista JSON privată.
- `DOCUMENTS_PROXY_REQUIRED=true`: absența listei oprește achiziția, înainte de rețea. O listă configurată, dar invalidă, oprește achiziția chiar dacă flagul nu este true.
- Fără aceste opțiuni, instalațiile existente păstrează transportul direct. Pilotul trebuie să seteze explicit REQUIRED.
- Workerul verifică configurația la pornire, înainte să preia vreun job. Sesiunile recitesc lista înainte de alegerea endpointului.
- Nu există fallback la transport direct când un proxy configurat nu funcționează. Erorile păstrează numai coduri de transport acceptate, fără credentiale sau diagnostic brut Playwright. Jurnalul cererii și `collection_requests.diagnostics.context.transport` păstrează doar `mode` și `proxyId`.
- Rămân active bugetul comun PostgreSQL, maximum un document simultan, minimum 60 de secunde între începuturile GET-urilor de fișier, pauza nocturnă și opririle existente. Nu am introdus un buget separat per IP.
- Colectorul achizițiilor/anunțurilor/atribuirilor nu este modificat. Citirea documentelor deja arhivate nu folosește proxy.
- Corecție descoperită prin test: filtrul Playwright de rute nu intercepta URL-urile următoare dintr-un redirect de navigare. Pagina inițială se preia acum prin `route.fetch` în același context/proxy, cu `maxRedirects:0` și `maxRetries:0`, apoi răspunsul se livrează browserului cu cookie-urile sale. Răspunsurile 3xx sunt oprite înainte de următoarea cerere. Cererile listei/fișierului folosesc în continuare fetch-ul browserului cu `redirect:manual`.

Aceasta este protecție de transport verificată pentru browserul documentelor, **nu un firewall la nivelul serverului**. Înaintea folosirii în producție, configurarea REQUIRED, montarea secretului și restricțiile de egress ale workerului trebuie stabilite separat. Nu modifica ritmul pentru a compensa proxy-uri refuzate și nu presupune că IP-urile comune sunt acceptate de SEAP.

## Ce completează operatorul

Din lista Webshare, conexiune Direct, ia pentru un singur proxy: IP, port, username și password. Pune-le în `apps/web/seap-proxies.local`. Fișierul este ignorat prin regula `*.local`; copia pregătită local are permisiuni 0600. Nu lipi credentiale în chat, comandă, log sau repo.

Exemplul fără secrete este [proxies.example.json](../../apps/web/scripts/documents/proxies.example.json). `id` rămâne `proxy-1`; `server` devine `http://IP:PORT`. Username-ul și parola se completează separat, în JSON, fără URL encoding. Nu înlocui schema cu SOCKS5. Pentru prima verificare păstrează **un singur element** în listă.

Într-un clone nou, creează fișierul numai dacă nu există:

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('apps/web/seap-proxies.local')
with p.open('x') as f:
    f.write(Path('apps/web/scripts/documents/proxies.example.json').read_text())
p.chmod(0o600)
PY
```

## Test de conectivitate, fără SEAP și fără bază de date

După completarea fișierului, din rădăcina repo-ului, cu Node 22:

```sh
DOCUMENTS_CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  pnpm --filter web documents:proxy-check
```

Pe Linux setează calea Chromium corespunzătoare; implicit `/usr/bin/chromium`. Scriptul folosește automat `apps/web/seap-proxies.local`, sau calea explicită din DOCUMENTS_PROXY_FILE. Permite o singură navigare HTTPS la `https://ipv4.webshare.io/`, blochează alte destinații/subresurse și nu urmărește redirecturi. Nu accesează DB, nu pornește coada și nu cere IP-ul conexiunii directe. Poate exista handshake de autentificare cu proxy-ul înaintea cererii HTTPS; contorul reprezintă navigarea aplicației, nu pachetele/handshake-urile.

Succesul cere HTTP 200, răspuns IP valid și egal cu IP-ul endpointului fix. Afișează ID-ul proxy-ului, IP-ul observat și contoarele; nu afișează parola. Nu demonstrează încă faptul că SEAP acceptă acel IP sau că poate livra un document.

## Pilot SEAP autorizat: maximum un document și 6 cereri

Pilotul explicit este `apps/web/scripts/documents/pilot-proxy.ts`. Fără `--run` face numai inspecție locală și nu schimbă DB. Cu `--run`, verifică DB loopback `seap`, proxy obligatoriu cu un singur endpoint, colectare inițial oprită, nicio coadă/reîncercare/cerere activă, lipsa originalului și identitatea sursei. Este o procedură concretă pentru sursa aprobată, nu un worker de lansat în producție sau periodic.

Ținta este **HC-127-2025.pdf**, document ID SEAP `110778324`, cod `SCN1168231/00054`, anunț `100231768`, Municipiul Buzău. Metadatele inițiale provin din raportul pilotului din 26 septembrie. Nu reutilizează URL-ul temporar vechi: lista proaspătă trebuie să confirme ID-ul, codul și numele înainte de descărcare.

Workerul primește explicit ID-ul jobului. Nu preia alte joburi și, în acest mod, nu curăță joburi running ale altora. Limita de șase cereri se verifică folosind `app.document_requests`, inclusiv încercările eșuate; reluarea aceluiași job nu îi resetează bugetul. Ritmul local verificat este **40–60s**, păstrat; GET-urile fișierelor au în continuare minimum 60s între începuturi.

Numai pe durata pilotului, scriptul scoate pauza generală locală și pune în pauză toate fluxurile în afară de `documents`. În `finally` restabilește `paused=true` și lista inițială de fluxuri; păstrează orice eroare/blocare nouă și jurnalul. Nu lasă jobul în așteptarea unei reîncercări automate. Procesarea nocturnă rămâne dezactivată.

Raportul este obligatoriu, prin `DOCUMENTS_PILOT_REPORT`, într-un director privat. Include fiecare cerere, status/bytes/timpi, hash-urile documentului, paginile și rezultatul OCR. Nu include proxy password, cookie-uri sau tokenul fișierului. Artefactele locale sunt în `infra/prod/dumps/document-proxy-pilot-20261006/`, ignorat de Git.

Containerul local existent `seap-documents-local` conține Chromium, Poppler și Tesseract ron+eng. Codul actual și `packages/db/dist` sunt montate read-only, la fel configurațiile locale. Conectarea folosește numai rețeaua containerului PostgreSQL local. Când containerul rulează cu UID-ul gazdei, configurația/cache-ul Chromium necesită directoare temporare accesibile (`XDG_CONFIG_HOME=/tmp/seap-chromium-config`, `XDG_CACHE_HOME=/tmp/seap-chromium-cache`). Pornirea fără aceste directoare a eșuat înainte de orice cerere; raport separat `browser-startup-failure.json`. Lansarea corectată a fost verificată întâi cu `--network none`.

**Limită a verificării în interfață:** copia locală nu mai are răspunsurile raw `93821` și `121928` folosite de `contractNotice(107063311)`. Asocierea standard a paginii contractului întoarce null. Pilotul verifică exact anunțul și instituția din core împotriva manifestului istoric, fără să inventeze o asociere generică sau să modifice core/raw. Accesul direct la document/PDF/text poate fi verificat separat; afișarea în pagina contractului necesită recuperarea provenienței și nu trebuie raportată ca trecută.

## Verificare

Testele unitare validează endpointurile, lipsa configurației obligatorii, fișierul invalid și absența secretelor din erori. Testele opt-in folosesc Chromium real, un proxy CONNECT local cu autentificare și un server HTTPS local: aceeași sesiune/cookie la GET → POST → GET, absența credentialelor proxy la origine, oprirea redirectului înainte de a doua cerere și lipsa accesului direct când proxy-ul este indisponibil sau parola este greșită. Excepția pentru certificatul autosemnat există numai în fixture; producția validează TLS normal.

```sh
DOCUMENTS_PROXY_BROWSER_TEST=true \
DOCUMENTS_CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  pnpm --filter web exec vitest run lib/documents/proxy.test.ts lib/documents/proxy.browser.test.ts lib/documents/documents.test.ts
pnpm --filter web typecheck
```

Nu sunt necesare migrări, dependențe noi sau teste cu fixture-uri scrise în baza reală. Testele Chromium sunt sărite fără flagul explicit.

Rezultat local: **24 teste trecute**, inclusiv cele patru verificări cu Chromium real; TypeScript trecut. Ambele CLI-uri au fost verificate și cu configurație obligatorie lipsă: exit 1, zero cereri și niciun job preluat. Testul comercial de conectivitate a trecut ulterior cu primul proxy din export. Aceste verificări preced pilotul real documentat mai jos. Ulterior au trecut cele trei teste de buget, șapte regresii documente și testul PostgreSQL de selectare a jobului pe `seap_test_references_guards`; TypeScript trecut. Vechea bază `seap_test_documents` nu are `collection_control`, astfel că prima încercare a testului pe ea s-a oprit fără fixture-uri scrise; nu a fost migrată pentru acest pilot.

Referințe: [Playwright HTTP proxy](https://playwright.dev/docs/network#http-proxy), [Webshare Direct Connection și endpointul de verificare](https://apidocs.webshare.io/proxy-connection).

## Rezultat final al pilotului — 6 octombrie 2026

[Raport verificabil, fără secrete](previews/document-proxy-pilot-20261006/result.json).

- Job `17453eb2-225f-463b-9ee7-656c93d5c866`, încheiat `complete` în **222 secunde (3m42s)**.
- **5/6 cereri permise**, toate HTTP 200: GET anunț, două POST-uri pentru lista completă de 9 fișiere, POST de pregătire și GET fișier. Fără retry, alt proxy sau transport direct.
- Intervalele dintre începuturile cererilor: **43,09 / 46,12 / 46,13 / 47,09 secunde**. Ritmul configurat 40–60s a fost respectat.
- PDF **632.876 bytes**, 10 pagini; SHA-256 `9b305927ede6acf7a831ecde2a111df668bac20e046d61fefdf33f879b3cb4da`, identic cu originalul verificat în septembrie.
- **10/10 pagini OCR**, procesare după arhivare **37,33s**. Antetul primei pagini, Decizia 766 / 24 noiembrie 2025 a Curții de Apel Ploiești, a fost confruntat vizual cu OCR-ul. Nu reprezintă verificarea umană integrală a transcrierii.
- API local: PDF 200 și hash identic; byte range 206; text disponibil distinct pentru paginile 1, 2 și 10. Nicio cerere SEAP produsă de aceste verificări.
- Document local `54d11bff-5905-4d53-8f68-7f2d3887d6aa`; PDF: `http://localhost:3000/api/documents/54d11bff-5905-4d53-8f68-7f2d3887d6aa/file?kind=pdf`.
- La final: `paused=true`, `processing_enabled=false`, `maintenance=false`, fără blocked_reason, zero joburi active și zero cereri running; containerul pilot nu mai există. Ratele și paused_streams inițiale au fost restabilite/păstrate. Originalul, OCR-ul și metadatele reale rămân local.

Pornirea preliminară a Chromium a eșuat fără trafic (job `a842822c-2c0a-4dc5-afc6-1049fe1842ff`, 0 cereri), din cauza directoarelor crashpad inaccesibile UID-ului gazdei. Corectarea directoarelor XDG a fost verificată offline înaintea pilotului reușit. Aceasta nu a fost o reîncercare SEAP.

**Rămâne deschisă asocierea paginii contractului**, descrisă mai sus: `contractAssociationAvailable=false`. Nu am reparat/importat raw și nu am pretins că întregul UI al contractului a trecut verificarea. Reușita unui singur proxy/document nu garantează disponibilitatea celorlalte nouă proxy-uri ori comportamentul la volum mai mare. Nicio accelerare sau schimbare în producție, nici commit/push/deploy în acest pas.
