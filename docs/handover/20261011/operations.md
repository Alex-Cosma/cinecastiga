# Colectare, documente și operare în producție

Consolidat la 11 octombrie 2026. Valorile live se citesc din mediul vizat; exemplele istorice nu sunt setări care trebuie reinstalate. Acest document explică procedurile, fără a acorda autorizație permanentă de restart, deploy sau intervenție în date.

## Infrastructură și secrete

- Aplicație: `https://cinecastiga.ro`; VPS Debian/Docker; SSH `cinecastiga`.
- Checkout: `/srv/seap/src`; compose/configurație: `/srv/seap/src/infra/prod`.
- Containere cunoscute: `cinecastiga-web-1`, `cinecastiga-postgres-1`, `cinecastiga-meilisearch-1`, `cinecastiga-caddy-1`, `cinecastiga-collection-1`, `cinecastiga-documents-1`. Confirmă numele cu `docker ps`.
- Bază/rol owner: `seap`; aplicația și documentele folosesc rolul limitat `seap_web`. Verificarea cu owner nu dovedește că granturile aplicației sunt corecte.
- Backup-uri: `/srv/seap/backups`, inclusiv `processing/<UUID>/`. Reparații cu dovezi montate separat sub `/srv/seap/repairs` / `/repairs` în container.
- `.env`, cheile, proxy-urile cu parole și sesiunile nu sunt în Git. Colegul primește acces individual, numai dacă îi este necesar. Nu trimite un `.env` de producție ca pachet de onboarding.
- Caddy/Cloudflare servesc 80/443. Nu expune PostgreSQL/Meilisearch public pentru transfer; folosește mecanismul local/SSH existent.

Verificări inițiale numai în citire:

```sh
git status --short
git branch --show-current
git log -5 --oneline
ssh -o BatchMode=yes -o ConnectTimeout=12 cinecastiga \
  'cd /srv/seap/src && git rev-parse HEAD && docker ps --format "{{.Names}} {{.Status}}"'
curl -fsS https://cinecastiga.ro/api/health
```

Pentru SQL live folosește o tranzacție `READ ONLY`, `statement_timeout`, `lock_timeout` și interogări indexate. Nu afișa DSN-ul/parola în output. Exemplu de cadru pentru o interogare cunoscută:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '1s';
SET LOCAL max_parallel_workers_per_gather = 0;
SELECT paused, maintenance, revision, blocked_reason
FROM app.collection_control WHERE id = 1;
COMMIT;
```

Un query național de diagnostic poate fi mai costisitor decât traficul utilizatorilor; copiază o cohortă publică delimitată și analizeaz-o local când este posibil. Nu lansa mai mulți agenți cu scanări grele independente pe aceeași producție.

## Ce rulează în fundal

| Proces | Intrare | Rezultat / control |
|---|---|---|
| Colector date | Sarcini persistente și ferestre până ieri | Arhive brute și inventare; control în `/admin` |
| Supervisor documente | Inventare suportate și fișiere eligibile | Descoperire, download, OCR; `/admin/fisiere` |
| Clasificator documente | Nume și text deja existent | Categorii și prioritate, fără cereri SEAP suplimentare |
| Procesare nocturnă | Frontiera brută înghețată după drenare | Core, marts, Radiografie, risc după calendar, căutare și checkpoint |
| Urmăriri / digest-uri | Checkpoint-uri validate și configurare | Comparații/mesaje private; verifică activarea reală, nu presupune cron/SMTP din existența codului |

Pornirea web locală nu trebuie să pornească aceste procese externe. Pentru UI sunt suficiente serviciile locale și baza restaurată; documentele deja arhivate se citesc fără contactarea SEAP.

## Calendarul aprobat

Toate orele sunt `Europe/Bucharest`, inclusiv trecerea vară/iarnă:

- **02:00:** extinderea colectării de date până ieri inclusiv. Worker-ul verifică periodic orizontul și păstrează sarcinile existente, retry-urile și revizitările.
- **02:59–03:30:** nu se admit cereri SEAP noi. Cererile deja admise pot termina; ora 03:30 nu anulează un blocaj sau o pauză manuală.
- **05:00 zilnic:** procesare, statistici și Radiografie.
- **Duminică 05:00:** și recalcularea semnalelor de risc.
- O reparație sau schimbare de metodologie poate cere o singură rulare completă suplimentară. Asta nu mută permanent calculul riscului în fiecare zi.

Cele trei ore dintre 02:00 și 05:00 includ pauza de 31 de minute. Nu promite terminarea colectării într-un interval fix. O coadă incompletă poate continua după publicarea frontierei verificate. Ziua curentă nu este declarată completă.

## Colectarea datelor SEAP

Sunt trei fluxuri principale: achiziții directe, participare, atribuiri. Mai există detalii, loturi, formulare eForms și inventare istorice. „Colectat 100%” pentru un lot nu înseamnă toate datele și toate documentele SEAP din toți anii.

Identitatea anunțurilor include familia/namespace-ul: ID numeric egal în două familii nu autorizează suprascrierea. Repararea acestui defect este documentată în [notice-identity-20261009](../../implementation/notice-identity-20261009/README.md). Nu relansa activările de atunci.

Achizițiile directe recente folosesc lista națională filtrată pe zi, cu partiționare CPV pentru zilele care depășesc plafonul endpoint-ului; apoi se preiau detaliile. Nu există soluție de completitudine bazată pe ignorarea plafonului de 2.000. Strategia a fost demonstrată pe zece zile aglomerate înainte de înlocuirea interogărilor pe fiecare instituție. Păstrează reconcilierea totalului, ID-urile distincte, acoperirea partițiilor și verificarea vocabularului. [Demonstrație](../../research/da-busy-days-20261010/README.md), [activare datată](../../../scripts/operations/20261010-da-national/README.md).

Paginarea anunțurilor/contractelor poate întoarce suprapuneri, surplus variabil sau altă ordine a câștigătorilor. Completitudinea se verifică prin inventarul distinct reconciliat cu sursa, nu prin `număr pagini × take`. Remediul pentru o zi mică suprapusă este limitat și testat; nu transforma un caz particular în „ignoră diferențele”. [Paginare](../../implementation/notice-pagination-20261010/README.md), [incident cu 1.041 contracte](../../implementation/recovery-20261007/FOLLOW-UP.md).

Lotul istoric poate păstra numele `recovery-2026-09-25`, în timp ce `follow_latest` îi extinde ținta. Data din numele lotului nu este orizontul real. În admin, ETA se bazează pe ritmul măsurat și munca cunoscută; descoperirea de sarcini copil poate mări numitorul. Asta poate coborî procentul fără să se fi pierdut progresul.

## Proxy-uri, concurență și retry

`app.collection_control` gestionează controlul comun; `collection_proxy_control` și endpoint-urile pool-ului gestionează ritmul/concurența per IP. Interfața separată este `/admin/conexiune`.

- Plafonul configurabil acceptă până la **200 porniri/minut**; concurența, până la **10 cereri**. Sunt limite acceptate, nu dovada setării live.
- Maximum o cerere în curs pe fiecare IP, cu intervalul configurat per IP. Setările istorice recente au inclus 35–45 secunde/IP și 94 din 100 proxy-uri active; verifică situația actuală.
- Bugetul total este comun datelor și documentelor. Numărul de proxy-uri nu elimină limita totală, durata răspunsului, limitele de conexiune sau costul arhivării în PostgreSQL.
- Un eșec de transport al unui proxy se izolează; ceilalți sănătoși pot continua. Lipsa de rute sănătoase și defectele de integritate sunt blocaje diferite.
- Nu există fallback ascuns către IP-ul serverului. Sesiunea unui download păstrează același IP pentru întreg lanțul.
- Cererile admit lock-uri/revizii în PostgreSQL. Un `sleep` local în fiecare worker nu înlocuiește poarta globală.
- Timeout de date: 45 de secunde. Retry pentru cazurile eligibile: după 5 minute, apoi 10 minute; a treia încercare e terminală. Cererea, parametrii, diagnosticul și istoricul rămân păstrate.
- 403/429/challenge, răspuns nevalid, problemă SQL și timeout nu sunt același lucru. Nu marca o sarcină eșuată „reușită” pentru a elibera un IP.

Ritmul afișat trebuie să separe pornirile, finalizările, succesul și estimarea din configurare. La latență medie mare, zece sloturi pot fi limita chiar dacă există 100 de IP-uri. Diagnosticul folosește distribuția duratelor și cererile efective, nu un răspuns rapid izolat. [Implementare completă și incidente](../../implementation/seap-proxy-pool.md), [debit](../../implementation/collection-throughput-20261009.md).

## Documente: listare, download, extragere

Lanțul real este: asociere contract–anunț → listă de fișiere → sesiune Chromium → POST de validare → GET în aceeași sesiune → arhivarea originalului → extragere/conversie/OCR → publicarea rezultatului verificat. Hash-ul din URL nu este identitate durabilă. Se refac metadata și Referer-ul familiei corecte; nu se copiază cookies din browserul proprietarului.

Adaptorul automat verificat este pentru anunțuri simplificate, namespace `rfq`, tip 17, identitate publică și număr cunoscute. Alte familii sau asocieri neclare sunt raportate separat. Inventarul nu actualizează periodic toate atașamentele adăugate ulterior pe orice anunț vechi. Nu promite completitudinea tuturor documentelor din toate familiile.

Politica actuală de download automat este strictă: **numai caiete de sarcini identificate din întregul istoric, recentele întâi**. Dacă nu există caiete eligibile, nu se trece automat la toate PDF-urile. Un nume generic de arhivă poate ascunde un caiet necunoscut; este o limită declarată a regulii, nu motiv de a descărca automat tot.

- Utilizatorul autentificat poate cere manual și alte fișiere; anonimul vede originalele și PDF/text deja arhivate. Endpoint-ul de enqueue impune autentificarea și cota, nu doar butonul.
- Cererea manuală are prioritate și poate prelua un job automat ținut în `specifications_only`, fără duplicare. Păstrează istoricul, retry-ul și originalul.
- Supervisor-ul automat are până la **10 sloturi de rețea și 4 de procesare**, cu frontiere limitate pentru inventare/fișiere. Limitele rețelei comune rămân active.
- Regula veche de un fișier/minut rămâne pentru traseul manual/serial relevant; pool-ul automat autorizat o depășește controlat prin proxy-uri. Nu descrie întreg sistemul ca serial.
- Pauza colectării de sursă permite procesarea originalelor deja arhivate. Pauza automată de documente oprește admiterea automată; cererile manuale sunt controlate separat. Mentenanța oprește în siguranță munca incompatibilă și păstrează reluarea.
- O descărcare completă și OCR-ul complet sunt stări distincte. Retry-ul OCR refolosește originalul, fără un nou GET inutil.
- Controlul discului arată spațiul real și volumele arhivate. Nu s-a impus limita de 10 MiB cerută să fie evitată.

PDF, CMS/P7S/P7M, Word/Excel și arhive ZIP/RAR/7z sunt tratate prin toolchain-ul documentat. Descărcarea este transmisă/stocată pe bucăți; lectura HTTP Range permite documente mari. Extragerea semnăturii CMS nu necesită cheia privată a semnatarului pentru conținutul inclus, dar nu trebuie numită validare juridică a semnăturii.

Textul nativ este preferat, apoi OCR `ron+eng`. Fișierele și paginile mari se procesează reluabil; vechile limite de 50 MiB / 150 pagini nu mai descriu comportamentul actual. Originalul și PDF-ul derivat au hash-uri distincte; nu se schimbă ordinea paginilor pentru a prioritiza OCR-ul unui caiet. Publicarea documentului combinat așteaptă finalizarea cerută de poarta existentă. Arhivele multipart rămân o problemă deschisă; gruparea numelor volumelor nu este implementarea extragerii.

Surse de adevăr: [controlul colectării](../../implementation/document-collection-controls-20261010.md), [formate și limite actuale](../../implementation/document-formats-20261011.md), [categorii și politica strictă](../../implementation/document-categories-20261011.md). Secțiunile de release cele mai noi înlocuiesc vechile note „nepublicat”.

## Clasificare și interfață

Clasificatorul determinist are versiune și probe: nume de fișier preliminar, apoi antet relevant în prima pagină/text. O simplă mențiune în corpul textului nu este suficientă. Categoriile sunt: caiete; clarificări/modificări; tehnic; participare/formulare; modele de contract; evaluare/atribuire; contracte/acte; neclasificate.

Arhivele mixte pot apărea în mai multe categorii, dar se numără o singură dată în toate fișierele. Membrii păstrează paginile reale din PDF-ul combinat. Biblioteca contractului are șase originale/pagină, căutare și filtre; admin are paginare de zece rânduri. Clasificarea poate termina cu documente neclasificate; 100% clasificat nu înseamnă categorie certă pentru toate.

Backfill-ul clasificării folosește metadata/text existent, fără trafic SEAP și fără re-OCR. Nu există editor manual complet de clasificare în UI, chiar dacă modelul persistat păstrează eventualele override-uri. Nu confunda clasificarea cu verificarea documentelor ori aprobarea publicării unei investigații.

## Publicare nocturnă și recuperare

Orchestratorul host și deploy-ul folosesc un lock comun. Fluxul esențial este:

1. Claim al rulării, cu revizia controlului și starea anterioară.
2. Mentenanță și drenarea activității care ar modifica frontiera.
3. Înghețarea `raw_boundary`; backup privat și verificarea lui.
4. Normalizare și reparații programate autorizate pentru acea rulare.
5. Calitatea banilor, tipurilor și identităților; reconciliere; statistici/Radiografie; risc dacă scope-ul o cere.
6. Validări și checkpoint analitic; indexare/verificare căutare.
7. Redeschidere numai dacă toate condițiile sunt îndeplinite și operatorul nu a schimbat controlul între timp.

Eroarea păstrează mentenanța. Codul poate relua doar arhivarea brută după un eșec cu backup verificat, prin `collection_during_maintenance`, dacă starea anterioară și controalele o permit; asta nu redeschide automat site-ul. O pauză manuală sau un blocaj de sursă rămâne respectat. Nu schimba manual `maintenance=false` peste o populație parțial reconstruită.

Reparațiile one-off folosesc `app.data_repairs` și marker persistent. Nu se repetă duminica doar pentru că există scriptul. Un marker `applied` nu este `completed`: completarea este legată de publicarea verificată/redeschidere. Reparațiile monetară, ONRC/MF, TED și identitățile vechi au rapoarte finale; verifică-le înainte de orice rerulare.

Duratele observate variază: aproximativ 1 h 35 inițial; 1 h 53 și 2 h 11–15 în recuperări ulterioare, cu lucrări diferite. Nu le prezenta ca SLA. Vezi [benchmark-ul](../../implementation/recalculation-benchmark-20260927.md) și rapoartele fiecărei operațiuni.

## Deploy și verificare

Push pe `main` declanșează CI și deploy. Lucrează pe branch până când modificarea este verificată și autorizată pentru publicare. `infra/prod/deploy.sh` construiește imaginile, aplică migrațiile/granturile cu istoric validat, pregătește indexurile lipsă și înlocuiește serviciile. PostgreSQL și volumele nu se recreează pentru un deploy obișnuit.

Nu ajunge `git push` reușit. Verifică ambele joburi Actions, hash/runtime, migrațiile, health, rutele relevante și worker-ii. Probează cu rolul real al aplicației. O schimbare de schemă trebuie să fie compatibilă și cu worker-ul vechi aflat încă în execuție; selectarea explicită a coloanelor evită unele erori de prepared statements la adăugări.

În handover-ul operațional notează: hash-ul exact, momentul, reviziile înainte/după, run/checkpoint, ce surse au fost contactate, ce date au fost schimbate, verificările și limitele. Nu introduce `[skip ci]` pentru cod/migrații. Documentația poate fi comisă separat fără a pretinde deploy.

## Diagnostic rapid

| Simptom | Ce verifici întâi | Ce nu deduci automat |
|---|---|---|
| Site în mentenanță | Ultimul processing run, status/stage/error, revizii și backup | Că procesarea încă rulează |
| Colectare „oprită” | Pauză manuală, quiet window, block, retry, coadă/goluri, rute sănătoase | Că toate datele sunt colectate |
| Admin status 503 | Timeout SQL/lock-uri, conexiuni, sarcină PG, latența query-ului | Că web-ul trebuie restartat |
| ETA suspendat | Admitere oprită sau eșantion de ritm insuficient | Că progresul a fost pierdut |
| Procentul scade | Orizont extins / sarcini copil descoperite | Că s-au șters rezultate |
| PDF „nedescărcat” | Original arhivat? job/manual/automat? asociere? stare UI? | Că simpla existență a metadata înseamnă binar |
| Fișier ținut în așteptare | `specifications_only`, categorie, job manual, retry | Că trebuie descărcate automat toate fișierele |
| Total spectaculos | Monedă, plafon, versiune, lot, act adițional, consorțiu | Corupție demonstrată |

Cererea de status admin a fost mărită la 20 de secunde, cu polling la un minut; păstrează acest compromis sub sarcină până există un motiv măsurat pentru schimbare. Nu mări automat ritmul de polling când serverul este lent.

## Transfer și curățenie

[Ghidul transferului](../04-database-transfer.md) și [manifestul pachetului](../TRANSFER-STATUS.md) descriu exportul public pe stick. Dump-ul din 30 septembrie nu este producția curentă; copia locală din 2 octombrie este un alt snapshot. Nu include conturi, sesiuni, anchete private, cozi active, parole proxy sau chei. Backup-ul privat pentru rollback are alt scop și alt conținut.

Nu șterge arhive istorice înainte de a verifica dacă sunt singura dovadă pentru datele normalizate. Intervenția curentă a recuperat mii de răspunsuri din vechiul dump public. Curățarea spațiului necesită inventarierea dependențelor și o decizie concretă, nu presupunerea că „avem deja baza în prod”.
