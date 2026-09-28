# Radiografie B — implementare locală, 28 septembrie 2026

Utilizatorul a ales mockupul B, cu zoom pentru furnizori și o vizualizare mai compactă pentru achizițiile directe, apoi a cerut implementarea în aplicație. Ruta reală este `/entitati/[id]/radiografie`; CNAIR: `/entitati/2146146/radiografie`. Branch: `work/topic-search`. Etapa inițială a fost locală. Ulterior, utilizatorul a cerut commit, push și deploy pentru întregul branch, inclusiv căutarea 5B. Starea verificată a lansării este consemnată în documentul release-ului.

## Interfață și comportament

- Trei perspective în aceeași pagină: **Furnizori**, **Loturi**, **Achiziții directe**. Prima se randează pe server; celelalte se montează la prima vizită și își păstrează filtrele când schimbi perspectiva.
- Furnizori: căutare fără diacritice, 12/25/toți furnizorii din selecția existentă (maximum 150), detalii persistente, clasament de 10 rânduri/pagină. Pragul existent rămâne `max(500.000 lei, 0,1% din valoarea contractelor autorității)` și este explicat.
- Grafic SVG cu zoom 1–12×, +/− în jurul furnizorului ales, Ctrl/⌘ + scroll în jurul cursorului, drag pentru deplasare și resetare. Cu focus pe grafic: +/−, săgeți, 0. Axele se recalculează; dimensiunea cercurilor rămâne fixă. Numărul punctelor vizibile este explicit. Pe mobil, lista de furnizori înlocuiește graficul, iar selecția duce la detalii.
- Contextul financiar, perioada bilanțurilor, acordurile-cadru, acoperirea numărului de oferte și cotele estimate ale asocierilor sunt păstrate într-o explicație extensibilă. Nu se sugerează că portofoliul public observat este întreaga activitate a firmei.
- Loturi: căutare/selectare CPV și interval inclusiv de ani, implicit toți anii. Matrice cu 8 proceduri/pagină, etichete fixate și derulare proprie; celula selectată are rezumat și contracte verificabile. Membrii unei asocieri formează un singur câștigător; contractul integral este numărat o singură dată. Verdele închis indică toate contractele câștigate, nu ofertant unic. Numărul de oferte necunoscut rămâne necunoscut.
- Tiparele repetate, legăturile prin administratori și aparițiile în alte domenii rămân accesibile sub matrice, 5 tipare/pagină, cu sursele și amprenta selecției originale.
- Achiziții directe: selector compact de grup, cifre într-un rând și grafic de 220px înălțime, adaptat lățimii. Fereastra calculului este implicită; întregul istoric este opțional. Selectarea unui punct arată achiziția. Plafonul urmărește regulile existente, inclusiv schimbările istorice. Dacă aproximația numerică a graficului diferă de selecția canonică, apare avertizarea; sursele folosesc reconstrucția exactă existentă.
- Deschiderea surselor nu pierde selecția; dialogul are focus protejat, Escape și revenire la buton. Detaliile achizițiilor/contractelor și SEAP se deschid în tab nou. Stări explicite de încărcare, eroare/reîncercare și lipsă de date.

## Date, surse și limite

Interfața citește datele aplicației prin `getRadiografie`; nu importă snapshotul mockupului. Nu schimbă algoritmii semnalelor, pragurile, marturile sau schema DB. Headerul arată contracte distincte și valori înregistrate, nu plăți. Vechiul modul Headlines nu mai este randat.

Matricea primește metadate publice suplimentare din `core.contracts`: identificator SEAP pentru ruta de detalii, titlu, anunț și valoare decimală exactă. Ruta folosește identificatorul extern (`ca_notice_contract_id`), nu cheia internă. Catalogul CPV al matricei rămâne selecția de clase cu tipare repetate din backend, nu întregul catalog național; limita este vizibilă. Procedurile afișate au cel puțin trei contracte în intervalul ales.

`GET /api/evidence/sources` păstrează CSV-ul implicit și adaugă `format=json&page=0`. Aceeași reconstrucție canonică rulează într-o tranzacție repeatable-read/read-only, cu limita existentă de 30 secunde. JSON-ul livrează 50 de surse/pagină și **totalul exact al întregii selecții**, păstrat ca șir decimal; titlurile celor maximum 50 de înregistrări sunt îmbogățite ulterior din date publice locale. Răspunsul este `no-store`; paginile invalide sunt respinse înainte de deschiderea bazei. Membrii, valorile și avertizările nu se deduc din punctele vizibile ale graficului.

Furnizorii folosesc drawerul existent de dovezi al relației. Grupurile de achiziții și tiparele folosesc JSON-ul canonic, CSV-ul existent și `ClipButton` cu selecția/amprenta existente. Drawerul unei celule din matrice arată contractele integrale, 10/pagină; salvarea unei întregi celule ca grup nou nu a fost adăugată. Detaliile fiecărui contract păstrează traseul propriu de salvare.

## Corecție de randare descoperită în verificare

În buildul optimizat, `HeaderUserNav` putea primi sesiunea rezolvată de un alt abonat înainte de hidratarea propriului fragment HTML. Serverul trimitea `<span>`, iar prima randare a browserului cerea `<nav>`, producând React 418 intermitent. Stackul recuperabil a identificat exact meniul comun, nu graficul. Headerul și linkul de cont din footer păstrează acum starea inițială până la montare, apoi arată sesiunea reală. Nu se schimbă autentificarea sau autorizarea. Două teste verifică un snapshot inițial identic când sesiunea este deja rezolvată, anonimă sau cu utilizator fictiv.

## Verificare

- 44 teste unitare relevante: radiografie-view 5, radiografie-sources-route 3, ask/evidence 22, source-evidence 6, evidence-captures 6, auth-navigation 2. Testele rutei acoperă totalul decimal exact peste limita de precizie Number, paginarea, validarea și eliberarea conexiunii. Nu sunt teste de ingestie.
- Build de producție și TypeScript verificate local. După corecția meniului comun, scenariul final pe build optimizat (inclusiv navigări repetate 2146445/2146107) a avut zero erori JavaScript.
- Browser Chrome la 1440×1000 și 390×844, light/dark: cele trei perspective, zoom/reset/tastatură, căutare, interval și paginare, detalii, surse exacte, eroare simulată 503/reîncercare, Escape și focus restaurat, stări goale. Selecția 2022–2024 CNAIR produce 75 de proceduri în familia inițială; pagina a doua arată 9–16.
- Exemple locale: relația SA & PE CONSTRUCT are 12 surse / 4.047.347.294,23 lei; VALURO are 7 / 532.200,00 lei; primul tipar verificat 21 alocări / 3.841.789.738,78 lei. Prima celulă verificată are 3 contracte și link `/contracte/1045996`. Sunt observații ale copiei locale, nu constatări juridice sau promisiuni de actualitate.
- Verificate și instituțiile 2146445, 2146107 și cazul fără selecții 2159422. Pagina nu depășește lățimea de 390px; tabelele se derulează în regiunea lor.
- Capturi și review local: `.impeccable/review/radiografie-live/`. Reviewul și documentarea au fost făcute în același fir deoarece delegarea era blocată de limita agenților; nu reprezintă un review independent. PRODUCT.md, DESIGN.md și design.json rămân neschimbate.
- Nu s-a testat salvarea cu un cont autentificat printr-o scriere într-o anchetă reală. Mecanismele existente și testele de captură sunt reutilizate; nu se pretinde un nou audit complet de accesibilitate.

## Starea serverului la predare

La încheierea acestei etape, portul **3000** servește buildul optimizat verificat, din `/tmp/seap-radiografie-verified-20260928/standalone/apps/web/server.js`, cu `DOCUMENTS_ENABLED=false` și fișierul `.env.local` citit la pornire. Este preview local, fără HMR; nu este deploy în producție. Serverul dev temporar 3115 a fost oprit. Mockupurile 3112 au fost păstrate. Oprește numai procesul preview de pe 3000 înainte de a porni modul dev de mai jos. Buildul de verificare din `/tmp` poate fi șters după oprirea previewului; nu face parte din repo.

## Pornire locală

Din `apps/web`, Node 22 și configurația locală existentă:

```sh
DOCUMENTS_ENABLED=false NEXT_DIST_DIR=.next-radiografie-dev pnpm dev --webpack --port 3000
```

Pentru verificarea buildului se folosește `.next-radiografie-build`, ignorat în Git. Nu porni colectorul, workerul de documente sau procesarea de noapte ca test UI. Această implementare a făcut zero cereri SEAP, zero scrieri în baza cu date reale, zero migrări și zero acțiuni în producție.
