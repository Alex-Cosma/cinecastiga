# Audit local al datelor — 3 octombrie 2026

**Rezultat: există defecte materiale în datele de intrare în statistici.** Concordanța dintre totalurile interne este bună, dar nu certifică identitatea economică a înregistrărilor sau moneda valorilor. Primele intervenții recomandate sunt corectarea valorii/monedei contractelor, gestionarea anunțurilor repetate și recuperarea datelor ONRC pierdute la import.

Audit diagnostic, fără reparații, commit, push sau deploy. [Prompt](PROMPT.md). Interogările sunt în `sql/`, rezultatele în `results/`; fiecare rezultat SQL păstrează durata și codul de ieșire. Nu există date de autentificare sau anchete private în acest dosar.

## Mediul și limitele observației

- Cod inspectat: `main`, `c40becf`. Modificările locale anterioare, exclusiv documentare, au fost păstrate. Funcționalitatea editorială este pe alt branch.
- PostgreSQL local 16, baza `seap`, aproximativ 42 GB. Snapshotul de producție a început la **2 octombrie, 07:11:55 RO**, conform manifestului transferului documentat. Nu este producția la momentul auditului.
- Verificat efectiv: **47 migrări**, checkpoint **12, ready**, încheiat la **2 octombrie 05:55:30 RO**; `rf-2026.6`, TED normalization 2, calendar Europe/Bucharest-v1. Workerii locali: `paused=true`, `processing_enabled=false`.
- Numărări exacte: **20.822.960 DA**, **1.143.947 contracte**, **312.836 anunțuri de atribuire**. Nu folosim estimările `pg_stat_user_tables` ca numărări exacte.
- Zero cereri SEAP/TED/web extern, zero SSH/producție, zero modificări intenționate ale datelor sau schemei. Fișierele publice ONRC/MF au fost citite din cache-ul local `../seap-heartbeat`.
- Toate sesiunile SQL de audit au `default_transaction_read_only=on`. Auditul nu certifică ultima colectare din producție și nu demonstrează completitudinea istorică a surselor.

## Priorități

| ID | Prioritate | Constatare | Certitudine / impact |
|---|---|---|---|
| DQ-01 | P1 | Valoarea convertită este păstrată cu moneda originală | Confirmat în cod și în 392 de contracte cu sursă disponibilă; valoare afișată cu unitate greșită și excludere din agregări |
| DQ-02 | P1 | Contracte repetate între ID-uri ale aceluiași anunț | Repetarea și includerea sunt confirmate; 7.312 copii suplimentare, 7,310 miliarde lei impact candidat, deduplicarea economică necesită adjudecare |
| DQ-03 | P1 | Parserul ONRC pierde data de naștere când include ora | 1.119.170 rânduri cu informație prezentă în sursă, respinsă; identificarea legăturilor este incompletă |
| DQ-04 | P1 operațional | Inventarul arhivei verifică existența ID-ului, nu a documentului | 16.007.488 DA cu referințe către documente absente, suplimentar față de cele 4.781.104 fără ID |
| DQ-05 | P2 | Profitul net nu este recunoscut în fișierele MF `UU` | 840.798 valori prezente în sursa 2025, zero profituri importate în categoria respectivă |
| DQ-06 | P2 semantic | „Număr de achiziții” poate număra alocări, iar filtrul valoric operează pe cote | 980.558 contracte devin 1.110.721 rânduri; semantica trebuie explicitată sau separată |

P1 înseamnă „înainte de a avea încredere în concluzii și extinde funcționalități”, nu acuzație privind instituțiile. Impacturile nu se adună: unele contracte pot apărea în mai multe categorii și unele sunt deja excluse.

## DQ-01 — Valoare convertită + etichetă EUR/USD

**Dovadă:** [currency-source-evidence](results/currency-source-evidence.json), [currency-impact](results/currency-impact.json).

Contractul [108116047](http://localhost:3000/contracte/108116047) are în răspunsul SEAP arhivat:

- `contractValue = 5.195.772`, moneda `EUR`;
- `currencyRate = 5,2788`;
- `defaultCurrencyContractValue = 27.427.441,23`;
- în `core.contracts`: `contract_value = 27.427.441,23`, `currency = EUR`.

[Parserul](../../../apps/ingestion/src/normalize/parsers.ts) preferă `defaultCurrencyContractValue`, dar păstrează `item.currency`. [Pagina contractului](../../../apps/web/app/contracte/[nid]/page.tsx) afișează suma cu moneda stocată, deci arată o sumă convertită ca și cum ar fi euro. [Agregarea](../../../apps/ingestion/src/normalize/marts.ts) exclude rândul fiindcă moneda nu este RON.

Am confruntat toate contractele EUR/USD pentru care `raw_id` există și itemul cu același ID extern a fost găsit în sursă: **380 EUR și 15 USD**. Dintre ele, **377 EUR + 15 USD** au valoarea convertită diferită de original, stocată cu eticheta originală. **359 + 14 = 373** îndeplinesc filtrele suplimentare testate de valoare, dată, câștigători și acord-cadru, dar moneda le exclude. Suma convertită a celor 392 este **1.220.202.670,71**, înainte de deduplicare și alte excluderi; **nu este o estimare a sumei de adăugat** în statistici. Un rând are și o neconcordanță de conversie față de `round(original × curs, 2)` și necesită verificare separată.

Universul este mai mare: 16.585 contracte etichetate EUR și 532 USD. Nu extrapolăm rezultatul celor 395 și nu însumăm coloana `contract_value` a întregului univers ca EUR sau RON: unitatea ei este tocmai problema.

**Remediere propusă:** câmpuri distincte pentru valoare/monedă originale, echivalent RON, curs și proveniența conversiei. Reparație din arhiva verificată; pentru istoricul fără sursă, stare explicită „unitate neverificată”, fără conversie presupusă. Nu înlocui pur și simplu toate etichetele EUR cu RON.

**Validare:** exemple exacte de valută, absența echivalentului, zero, curs divergent, protecție la reconversie, egalitatea original × curs în toleranța sursei. Recalculare a derivatelor și asocierilor TED numai după corectarea semanticii; revizuire și a consumatorilor care presupun `contract_value` în RON.

## DQ-02 — Același contract reapare cu alte ID-uri

**Dovadă:** [duplicate-same-notice](results/duplicate-same-notice.json), [notice-versions](results/notice-versions.json), [exemple cu proveniență](results/duplicate-evidence.json).

Există **155 numere de anunț cu câte două ID-uri `ca_notice_id`**. Am construit o potrivire strictă după număr de anunț, instituție, număr/data/valoarea/moneda contractului, titlu, descrierea loturilor și lista ordonată de câștigători.

Între ID-uri diferite ale aceluiași număr de anunț: **8.069 grupuri** în core; în populația inclusă în statistici există **7.312 copii suplimentare**, cu **7.310.553.827,47 lei** impact candidat. Aceasta reprezintă aproximativ **0,688%** din totalul afișat de 1.062.220.628.522,09 lei. Este dimensiunea potrivirilor, nu un prejudiciu și nici o corecție autorizată.

Exemple urmărite:

| Instituție / anunț | Contract / dată | ID-uri externe | Valoare pentru fiecare copie |
|---|---|---|---|
| Institutul Parhon / CAN1161722 | A1641 / 07.07.2026 | 107828300, 108117421 | 26.376,90 lei |
| CNAIR / CAN1133082 | 24/2007/4 / 06.07.2026 | 107819123, 108119107 | 1.973.400 lei |

În fiecare pereche coincid și furnizorul și lotul; copiile recente provin din răspunsuri arhivate cu data anunțului 25.09.2026. Pentru copiile vechi arhiva indicată prin raw_id lipsește. **Nu afirmăm că am demonstrat juridic mecanismul republicării ori statutul înlocuitorului:** `sysNoticeVersionId=2` în ambele nu este un contor de revizie, iar `versionNo` este null. Trebuie verificată relația dintre publicații înaintea unei reguli automate.

În cod, idempotenta după `caNoticeContractId` previne repetarea aceluiași ID, dar nu recunoaște același contract sub alt ID. Marts tratează ambele rânduri ca distincte. Totalul poate coincide în toate ecranele și totuși să includă dublura în fiecare.

**Remediere propusă:** păstrarea tuturor publicațiilor, cu identitate economică/relație de înlocuire și selecție canonică pentru sume. Tabel de candidați cu dovezi, reguli conservative și posibilitate de revizuire. Nu șterge sursele, nu unește numai după număr/valoare și nu alege automat cel mai recent anunț. Loturile și contractele subsecvente legitime rămân distincte.

**Validare:** comparație înainte/după pe instituție, furnizor, an și CPV; fiecare reducere explicată prin ID-uri și documente; controale negative pe contracte similare dar distincte. Recalculare marts, Radiografie, semnale și căutare după decizie; capturile istorice private nu se rescriu.

## DQ-03 — Pierdere sistematică la ONRC

**Dovadă:** [numărătoarea din sursă](results/onrc-source-formats.json), [impact în baza locală](results/reference-impact.json). Scriptul `check-reference-files.py` nu exportă datele de naștere sau adresele persoanelor.

Fișierul public conține 3.679.178 rânduri: **2.087.408 date fără oră**, **1.119.170 date cu oră**, **472.600 câmpuri goale**. Numărul datelor nenule din DB este exact 2.087.408. [roDate](../../../apps/ingestion/src/scripts/import-onrc.ts) acceptă doar `DD/MM/YYYY`, nu varianta cu oră. Din rândurile pierdute, **1.046.254 au calitate care conține „administrator”**.

Impactul este la identificare: `getCompanyReps` afișează zero alte firme când data este null; `net_shared_admin` și căutarea după persoane exclud astfel de rânduri. Nu știm câte semnale noi vor rezulta fără recalculare după reparare. Dintre administratorii firmelor cu profil de furnizor, 71.371 rânduri au data null, în 60.580 firme; această subpopulație include și lipsuri reale din sursă, deci nu este numărul exact recuperabil.

**Remediere:** parser strict pentru ambele formate observate, validare calendaristică, păstrarea motivului de respingere, regenerarea person_key și a derivatelor. Nu uni persoane numai după nume; tratează separat variațiile localității și rolurile de lichidator/reprezentant. ONRC este snapshot curent, nu istoric al conducerii la data achiziției.

**Validare:** reconciliază numărul câmpurilor sursă recunoscute, rândurile goale și respinse; probe cu nume omonime și date diferite; diferența de legături și semnale explicată. Cele 418 date deja importate în afara intervalului 1900–ziua auditului sunt candidați de verificare, nu automat identități false.

## DQ-04 — Arhiva brută este mult mai incompletă decât indică indicatorul

**Dovadă:** [raw-provenance](results/raw-provenance.json), [snapshot](results/snapshot.json).

| Set | Înregistrări | raw_id null | raw_id prezent, document absent |
|---|---:|---:|---:|
| DA | 20.822.960 | 4.781.104 | 16.007.488 |
| Contracte | 1.143.947 | 0 | 1.118.738 |
| Anunțuri atribuire | 312.836 | 0 | 309.639 |

Pentru DA, totalul fără document la referința stocată este **20.788.592**. [coverage.ts](../../../apps/ingestion/src/normalize/coverage.ts) numără doar `raw_id is null`; [DataCoverage](../../../apps/web/components/DataCoverage.tsx) etichetează cifra „Fără document brut arhivat”. Raportează astfel numai 4.781.104.

Lipsa unei părți a arhivei istorice era documentată; auditul confirmă amploarea și defectul de măsurare. **Nu dovedește că datele normalizate sunt inventate sau că nu există o copie în alt backup.** Nu am verificat fiecare referință nenulă existentă pentru identitatea exactă a payloadului. Pentru datele vechi nu se poate promite reconstrucție integrală din această bază locală.

**Remediere:** trei stări distincte — fără referință, referință fără document, document găsit și verificat. Repară inventarul prin anti-join/EXISTS și documentează sursele istorice de import. Identifică arhivele existente înainte de orice rebuild sau recrawl. Această verificare nu trebuie executată integral la fiecare cerere web.

**Validare:** cele trei categorii însumează populația; referințele existente se verifică după endpoint și identitatea externă. Nu face truncate/replay global presupunând că raw este complet.

## DQ-05 — „Profit net” nu trece de expresia regulată

**Dovadă:** [etichete și numărători sursă](results/financial-source-labels.json), [rezultate financiare](results/reference-impact.json).

În [import-financials.ts](../../../apps/ingestion/src/scripts/import-financials.ts), `^profitul?\s+net` acceptă „profitu net”/„profitul net”, dar nu „Profit net”. Fișierele `UU` folosesc exact `Profit net;i18`; prezența spec-ului dezactivează fallback-ul I18.

Pentru 2025: **844.207 rânduri UU**, dintre care sursa are **840.798 profituri completate**, inclusiv zero, și **459.700 profituri pozitive**. În DB `profit_net` este null pentru toate cele 844.207. Exemplu CUI 30976819: sursa I18 = **999.104**, DB null. În populația firmelor cu profil de furnizor, 88.421 bilanțuri UU din 2025 au profitul null. În categoria UU anii 2019–2025 au zero profituri nenule; 2018 este diferit și nu trebuie extrapolat.

**Limita impactului:** codul inspectat nu folosește `profit_net` în semnalele financiare actuale; acestea folosesc salariați/cifră de afaceri. Prin urmare, nu atribuim acestui defect actualele flag-uri și nu confundăm null cu lipsa profitabilității. Este o pierdere confirmată de informație și o problemă pentru analizele viitoare.

**Remediere:** recunoaștere explicită a etichetelor și raport de acoperire pe categorie/an/indicator; reimport selectiv din cache. Verificări pentru profit, pierdere, zero și lipsă, fără a presupune aceeași schemă pentru bănci/ONG/firme obișnuite. Nu calcula profitul net din venituri minus cheltuieli ca înlocuitor arbitrar al indicatorului lipsă.

## DQ-06 — Unitatea numărată și unitatea filtrată

[contract-integrity](results/contract-integrity.json) confirmă că **980.558 contracte** produc **1.110.721 rânduri contract–furnizor**: 130.163 alocări suplimentare, circa 13,27% față de numărul contractelor. Suma este corect împărțită; **zero** contracte cu sumă de cote diferită de valoarea integrală sau număr de câștigători inconsistent.

În [compile.ts](../../../apps/web/lib/ask/compile.ts), numărătorile sunt `count(*)`, iar interfața constructorului spune „numărul de achiziții”. Unele ecrane explică deja „înregistrări”, iar pagina metodologiei distinge contracte de rânduri contract–furnizor. Deci nu este un defect universal de numărare: este o semantică neuniformă care poate modifica clasamentele instituțiilor/județelor după număr.

Filtrul de valoare din `population-sql.ts` folosește `closing_value`, adică **cota furnizorului**. În date există **7.156 contracte cu valoare integrală de cel puțin 1 milion**, dar nicio cotă individuală de 1 milion; o condiție `value >= 1000000` nu le selectează. Valoarea lor integrală cumulată este 12.429.640.365,05 lei; aceasta descrie populația semantică, nu o eroare de total național și nu se adaugă altor impacturi.

**Decizie propusă:** „contracte distincte” pentru întrebările despre achiziții/instituții și „participări/cote” pentru relația cu furnizorii, cu ambele numărători disponibile. Separă „valoarea contractului” de „valoarea atribuită firmei” în filtre. Pentru selecții cu mai multe firme, suma folosește cotele, iar numărul contractelor distincte trebuie calculat separat; nu elimina arbitrar câștigători ca să reduci rândurile.

## Alte observații, fără concluzii forțate

- **Date suspecte:** 33 contracte incluse în anul 2000, 528.938,41 lei. Un număr de contract conține textual „Data 20.01.2020”, dar data normalizată este în 2000. Referințele raw pentru cele patru probe alese sunt absente, deci `date-source-evidence` întoarce zero rânduri. Nu s-a stabilit dacă eroarea vine din sursă sau import; nu corecta anul pe baza titlului.
- **116 DA acceptate au durată negativă.** Niciuna nu este etichetată `da_rapid` în mart: protecția funcționează.
- **2.804 DA marcate `value_suspect` rămân sub plafon și intră în totaluri**, cu 67.617.273,46 lei. Marcajul este o euristică, nu dovada că valoarea este greșită. Verificare ulterioară, fără excludere automată.
- **8 DA fără CPV**, 56.722,58 lei, explică exact diferența dintre totalul general și totalul pe domenii. Nu este o eroare de însumare.
- 5 asocieri UAT au populație nepozitivă. Calea `value_per_capita` folosește `population > 0`, deci nu am demonstrat împărțire la zero. Textul cu „5.575 autorități” din caveat este depășit față de cele 3.164 asocieri locale; numărul eligibil trebuie derivat, nu hardcodat.
- `raw-award-estimates` nu a găsit cazuri pentru ipoteza punctuală a șirului `123.45 RON`; potențialul defect de parser nu este declarat ca eroare observată în date.
- `loadAwardContracts` adaugă câștigători fără să elimine automat câștigători dispăruți la o revizie. Este o ipoteză de testat cu versiuni succesive, nu un incident demonstrat aici.

## Controale trecute

1. DA acceptate cu valoare pozitivă ≤2 milioane: **19.608.121**, **126.884.935.657,35 lei**, identic în core, mart și agregarea națională.
2. Cotele contractelor: **935.335.692.864,7400 lei**, exact aceeași sumă ca valorile integrale ale contractelor distincte incluse. Zero diferențe de alocare.
3. Totalul național, suma profilurilor instituțiilor, suma profilurilor furnizorilor și suma tipurilor coincid: **1.062.220.628.522,0900 lei**.
4. Zero profiluri active pe ID-urile vechi din redirecturi; zero grupuri duplicate de CUI valid în populația canonică verificată. Aceasta nu validează fiecare nume/CUI/geografie individual.
5. Toate cele **161.633 anunțuri TED** au normalization_version 2. Pentru **155.999 asocieri de competiție**, zero diferențe de număr de oferte, zero contradicții ale booleanului „o ofertă”, zero surse neeligibile după regulile testate. Nu am reverificat manual identitatea fiecărei asocieri.
6. `marts.ted_stats` nu însumează valori monetare; codul nu adaugă TED peste SEAP în totalul național.
7. **84.258 mostre de semnale** au referință și evidence conforme cu flag-ul curent. Nu este o recalculare independentă a tuturor regulilor de risc.
8. Toate contractele incluse sunt asociate unor anunțuri cu starea `Publicat`.

## Incident local și recuperare

La **09:23:18 RO**, procesul PostgreSQL al primei interogări `raw-provenance` a fost terminat cu signal 9. Docker a raportat `OOMKilled=true`; logul corelează explicit terminarea cu această interogare. PostgreSQL a întrerupt celelalte conexiuni și a efectuat recuperare automată. La **09:23:54 RO** era din nou disponibil. [Rezultatul eșuat păstrat](results/incident-raw-provenance.json).

Acea variantă materializa ID-urile raw și permitea paralelizarea implicită. Nu a modificat intenționat datele, dar faptul că era read-only nu prevenea consumul de resurse. Query-ul a fost rescris fără acel CTE; runnerul impune acum execuție fără paralelizare, `work_mem=8MB`, `jit=off`, timeout și oprire la prima eroare. Varianta finală a încheiat inventarul în **23,578 s**. Checkpoint 12 ready și controalele locale au fost reverificate după recuperare. Nu au fost reporniți workeri sau accesată producția.

## Ce nu certifică acest audit

Nu este un certificat complet al bazei. Nu am verificat independent fiecare anunț SEAP, statutul juridic al republicărilor, TVA-ul tuturor procedurilor, fiecare relație TED, corectitudinea fiecărei asocieri UAT, toate tipurile de semnale, căutarea Meilisearch ori cache-ul Next. Lipsa arhivei restrânge verificarea sursă–normalizat. Sursa ONRC nu oferă în acest snapshot istoric al reprezentanților la data contractelor. Acoperirea zilnică a colectării live necesită o verificare separată în producție.

## Continuare recomandată

1. **Valoare/monedă:** proiectarea schemei explicite și reparație pe copie izolată, cu lista exactă a contractelor schimbate și a celor rămase incerte.
2. **Contracte repetate:** dosar de deduplicare pentru cele 155 numere de anunț; validarea conservatoare a perechilor și simularea impactului pe aceeași copie, păstrând toate sursele.
3. **ONRC:** parser reparat, reimport verificat din cache și analiză a legăturilor nou-recuperate, fără unire după nume. Profiturile MF pot fi reparate în același lot de referințe, separat de evaluarea semnalelor.

Inventarul raw se corectează înainte de a proiecta un rebuild. Recalcularea și orice aplicare în producție vor avea plan propriu; nu sunt executate prin acest audit.

## Reproducere

Din rădăcina repo-ului, cu containerul local `seap-postgres-1` pornit:

```sh
python3 docs/audits/20261003-data-quality/run.py snapshot contract-integrity reconciliation
python3 docs/audits/20261003-data-quality/run.py duplicate-same-notice duplicate-evidence currency-impact
python3 docs/audits/20261003-data-quality/run.py financial-quality reference-impact raw-provenance ted-consistency
python3 docs/audits/20261003-data-quality/check-reference-files.py ../seap-heartbeat
```

Rulați seriile succesiv, nu în paralel. Sunt interogări complete pe seturile menționate și pot dura zeci de secunde fiecare. `run.py` acceptă numele oricărui fișier din `sql/` fără extensie. Nu rulați comenzile de import în locul scripturilor de verificare. Sumele SQL unde identitatea zecimală este importantă sunt păstrate ca text; runnerul final serializează și numericele JSON fracționare ca șiruri zecimale.
