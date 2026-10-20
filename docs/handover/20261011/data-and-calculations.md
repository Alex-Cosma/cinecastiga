# Date, identități, calcule și dovezi

Acest document descrie mecanismele existente și reparația locală din 11 octombrie. Nu echivalează existența codului cu aplicarea în producție. Starea și verificările intervenției curente sunt în [raportul dedicat](../../implementation/contract-reporting-integrity-20261011/README.md).

## Traseul datelor

1. Colectorul admite o cerere prin poarta comună din PostgreSQL.
2. Răspunsul și diagnosticul sunt arhivate cu identitatea endpoint-ului, parametri, hash și rezultat. O listă, un detaliu și un document sunt unități diferite de acoperire.
3. Normalizarea transformă sursele în `core`, păstrând legătura la arhivă. O eroare de parsare nu este succes și nici o înregistrare cu valoare zero.
4. Reconcilierea asociază identități și surse complementare. TED nu se adună din nou peste contractul SEAP.
5. Builder-ele construiesc populația tranzacțiilor, profilurile, statisticile, Radiografia și, după calendar, semnalele.
6. Validarea verifică populațiile și totalurile, apoi indexurile. Publicarea produce un checkpoint `ready`; colectarea reușită nu publică automat cifrele.

PostgreSQL este autoritatea. Meilisearch este derivat. Arhiva brută este înaintea parserului, dar o parte a istoricului a ajuns în producție fără toate arhivele originale. **Nu executa un reset al datelor derivate presupunând că orice rând se poate reconstrui din `raw` al producției.** Backup-ul local vechi a fost necesar pentru dovezile unor contracte deja normalizate.

## Scheme și identificatori

| Zonă | Ce conține | Regula de utilizare |
|---|---|---|
| `raw` | Răspunsuri, versiuni de endpoint, hash-uri, legături TED | Sursa se păstrează; o lipsă fizică se declară |
| `core` | Entități, achiziții, anunțuri, contracte, câștigători, TED, asocieri, flag-uri | Identitate normalizată, proveniență și calendar explicit |
| `marts` | Tranzacții, profiluri, statistici, populații/surse, registrul identităților contractuale | Se reconstruiesc numai prin procedura compatibilă cu checkpoint-ul |
| `reference` | CPV, UAT/populații, ONRC, bilanțuri MF | Sursa/anul/importul sunt parte din sensul datelor |
| `auth` | Conturi, sesiuni, verificări | Privat; nu intră în exportul colegului |
| `app` | Anchete, capturi, urmăriri, control, cozi, audit, documente publice | Conține atât date private, cât și publice; nu se exportă/șterge integral după numele schemei |
| `drizzle` | Istoricul migrațiilor | Se transferă împreună cu structura; nu se inventează un baseline |

Identificatorii care se confundă ușor:

- CUI fiscal ≠ ID de participant SICAP ≠ `core.entities.id`.
- ID numeric de anunț fără familie/namespace nu este întotdeauna identitate completă.
- `notice_no` este numărul oficial, care poate avea mai multe publicații; `ca_notice_id` identifică publicația de atribuire.
- `core.contracts.id` este intern; `ca_notice_contract_id` este cel public folosit în `/contracte/[nid]`.
- `marts.contract_transactions.contract_id` este intern. Bridge-ul `/contracte/i/[cid]` rezolvă destinația publică prin redirect relativ, fără `0.0.0.0`.
- `raw_id` este local bazei/snapshot-ului. Un ID din backup nu se introduce în producție presupunând că este global.
- Un ID de flag sau tipar regenerat nu este o referință imuabilă de investigație. Captura folosește descriptorul, membrii, metoda și checkpoint-ul.

## Entități și geografie

Reparația identităților istorice din 1 octombrie a corectat interpretarea CUI-urilor din DA vechi ca ID-uri SICAP. Raportul consemnează 4.231.642 de asocieri corectate și 14.264 de redirecturi; acestea sunt rezultatele acelei rulări, nu numărători live. [Cauză și algoritm](../../implementation/entity-identity-repair.md), [publicare verificată](../../implementation/entity-identity-release-20261001.md).

Numele afișat al unei entități provine din prima înregistrare care a creat-o. Importul dump-ului din 2020 a încărcat furnizorii înaintea autorităților, iar o autoritate cu același CUI valid s-a unit cu entitatea deja creată și i-a păstrat numele. Auditul F04 din 21 octombrie a găsit două înregistrări SICAP de furnizor care poartă CUI-ul unui cumpărător public sub numele unei firme private. Niciuna nu apare vreodată ca furnizor sau câștigător. Entitatea 2032782 (CUI 14491102, autoritate SICAP 1417) apărea ca „SC TONIDRAG INSTAL SRL-D”, firmă pe care ONRC o înregistrează cu CUI 35637856; sursa o numește DISTRIBUTIE ENERGIE OLTENIA S.A. Entitatea 1968696 (CUI 3552050, autoritate 25355) apărea ca „ANDREI TEHNOMETAL”; sursa o numește COMUNA GAGESTI (CONSILIUL LOCAL). `normalize/reviewed-entity-names.ts` corectează numele la fiecare rulare `normalize`, înainte de marts. Regula se aplică numai la potrivirea exactă a CUI-ului, a ambelor înregistrări SICAP și a numelui greșit. Asocierile SICAP și sumele nu se schimbă. Nu este o politică generală de nume: celelalte diferențe între numele de furnizor și de autoritate ale aceluiași CUI sunt în mare parte redenumiri ale aceleiași instituții. Listele de semnale păstrează numele vechi până la următoarea rulare completă de duminică.

`core.entity_redirects` păstrează vechi → canonic fără cicluri sau lanțuri. Numele asemănător nu justifică unirea a două CUI-uri diferite. Un CUI valid nu trebuie reinterpretat ca participant pentru că numărul coincide. Identitățile publice se rezolvă la canonic în întrebările vii; capturile private rămân neschimbate.

Județul/UAT-ul instituției nu demonstrează locul lucrărilor. Comparația primăriilor folosește populația rezidentă RPL 2021 și asocieri verificate cu UAT. CJ se compară între ele. Diferența procentuală de populație rămâne vizibilă; lipsa valorilor nu este zero. [Implementare și limitări](../../implementation/peer-population.md), [probe backend](../../implementation/peer-population-backend.md).

## Bani și calendar

`packages/db/src/contract-money.ts` este poarta comună pentru valorile contractelor. Păstrează separat suma originală, moneda originală, cursul raportat, valoarea RON și starea/proveniența interpretării. `contractRonValue()` întoarce valoarea admisă pentru calcul sau `NULL`; nu transformă necunoscutul în zero.

Populația statistică existentă impune și condiții de eligibilitate (dată, autoritate, câștigător și, pentru contracte, valoare RON pozitivă de cel mult un miliard). Acesta este un filtru al produsului, nu dovada că orice contract mai mare este invalid. Verifică explicațiile de acoperire și sursele excluse înainte de a interpreta totalul drept toate înregistrările din SEAP.

Plafonul de un miliard (`CONTRACT_VALUE_CAP_RON` în `packages/db/src/contract-identity.ts`) este dezvăluit peste tot unde apar totaluri (auditul F09 din 21 octombrie). Pe snapshotul local din 1 octombrie, plafonul singur scotea din totaluri circa 95 de contracte și comenzi, circa 235,7 mld. lei, după regulile vechi de tip din titlu. Exemple: CNAIR (entitatea 2146146), 37 de contracte, 84,86 mld. lei, față de 53,5 mld. lei afișați; Municipiul Cluj-Napoca (2146445), metroul și Feleac, 13,79 mld. lei, față de 4,4 mld. lei afișați. Alte 16 plafoane de acord-cadru (224,4 mld. lei) și un act adițional erau deja excluse de politica lor. Regula de selecție nu se schimbă. `contractAboveValueCap()` alege contractele canonice, raportabile, datate, cu autoritate și câștigător, cu valoarea RON peste plafon. `data_coverage.contracts` le numără și le însumează exact (`above_value_cap`, `above_value_cap_value`, `value_cap`), iar inventarul și prima pagină afișează cifrele. Pagina entității spune câte sunt și le listează (`#peste-plafon`), separat de total și de parteneri. Pagina contractului arată „Peste 1 miliard lei, separat de totaluri”. Răspunsurile Întreabă cu contracte și lista surselor lor au o avertizare (`CONTRACT_CAP_CAVEAT`), care nu mai spune „suma e corectă”. Notele din comparația cu instituții similare și din domenii menționează plafonul. Contorul apare după prima recalculare a inventarului după deploy (`runCoverage`, în reîmprospătarea nocturnă și în `flags`). Până atunci, prima pagină enunță doar regula, fără cifre.

Condiția „câștigător” cere, din `contract-reporting-4` (21 octombrie, auditul F12), un câștigător diferit de autoritatea contractantă a aceluiași contract (`winnerIsSupplier()` / `contractHasSupplier()` în `packages/db/src/contract-identity.ts`). SICAP înregistrează uneori chiar cumpărătorul drept câștigător. Pe snapshotul local din 1 octombrie erau 90 de contracte ale 37 de autorități, 1.402.101.956,27 lei, toate cu un singur câștigător, prezente și în producție. Exemple: CUP Focșani (entitatea 2128336, 9 contracte, 753,6 mil. lei, ex. 103897498), Transelectrica (2146462, ex. 101777691, 227,4 mil. lei), Județul Vrancea (2144371), Județul Satu Mare (2145678), Municipiul Oradea (2146127). Ele apăreau ca venit de furnizor al instituției, ca propriul ei partener principal și, în Radiografie, ca dependență de ea însăși. Rândul sursă rămâne în `core.contract_winners`, iar pagina contractului îl arată, marcat „Câștigătorul înregistrat este chiar autoritatea contractantă”. Nu este furnizor: `marts.contract_transactions` nu primește rând pentru el, deci nici profilurile, partenerii, concentrarea, `supplier_dependency`, tiparele de loturi sau semnalele. Un contract rămas fără furnizor iese din totaluri ca un contract fără câștigători, inclusiv din totalul autorității: furnizorul real nu este cunoscut. Într-un consorțiu care ar lista și autoritatea, valoarea se împarte doar între ceilalți membri (niciun caz pe snapshot). `data_coverage.contracts` le numără și le însumează (`winner_is_authority`, `winner_is_authority_value`), afișate în inventar după următoarea rulare `runCoverage`. `validateContractPopulation()` și dezvăluirea plafonului aplică aceeași regulă. Eligibilitatea din registrul de identitate (`readContractIdentityMembers`) nu se schimbă, ca hash-urile aprobate să rămână valide. Achizițiile directe cu furnizor egal cu autoritatea (22 acceptate, 19.205,19 lei pe snapshot) nu sunt atinse de această regulă. Noua versiune a politicii forțează o publicare `full`, care reconstruiește marts și riscul.

Nu interpreta `contract_value` izolat: unele importuri istorice îl aveau deja exprimat în RON, chiar dacă eticheta monedei descria originalul. Dubla conversie a fost o problemă reală. Parserul curent și reparația monetară verifică sursa, iar calitatea compară proiecția cu răspunsul exact. [Reparația monedelor](../../implementation/contract-currency/README.md).

Reguli obligatorii:

- Numerele exacte sunt `numeric` în SQL și șiruri zecimale în dovezi/transferuri. Nu folosi o conversie Python/JS în floating point ca intermediar pentru dump-uri financiare.
- O aproximare vizuală în milioane nu înlocuiește valoarea exactă accesibilă utilizatorului.
- Pentru consorții, fără valori individuale cunoscute, alocarea egală este estimată și etichetată; suma cotelor trebuie să fie exact suma contractului, inclusiv fracțiuni sub un ban. Nu atribui întregul contract fiecărui membru și apoi aduna.
- TVA-ul, unitatea, plafonul, valoarea estimată, contractată și plătită sunt noțiuni diferite. Aplicația nu dovedește efectuarea plății.
- Ferestrele anuale și datele contractuale folosesc `Europe/Bucharest`. Un timestamp UTC în seara zilei precedente poate fi data locală corectă. Metodologia calendarului este `Europe/Bucharest-v1`; testele folosesc și sesiuni PG în UTC/Los Angeles.
- Pragul aplicabil depinde de data și tipul achiziției. Nu aplica pragul curent întregului istoric. [Calendar/detalii](../../implementation/acquisition-details-calendar.md).
- Data contractului anterioară arhivei (`CONTRACT_DATE_FLOOR` = 2018-01-01, ora României, în `packages/db/src/contract-dates.ts`) este „dată sursă improbabilă”. Toate contractele stau sub anunțuri de atribuire SICAP publicate din 2018. Pe snapshotul local din 1 octombrie erau 3.330 de rânduri contract–furnizor, circa 3,11 mld. lei, datate 2000–2017. Exemplu: `ca_notice_contract_id` 1160333, cu numărul „nr.1700 / Data 20.01.2020” și data 2000-01-20. Valoarea rămâne în totaluri și în profiluri. `marts.contract_transactions.finalization_date` rămâne însă `NULL`, deci rândul nu primește an, nu intră în seria anuală, în intervalul entității, în istoricul Radiografiei sau în începutul acoperirii. `data_coverage.contracts.implausible_date` le numără. Pagina contractului arată data din sursă, cu eticheta respectivă. Data nu se corectează din titlu, din numărul contractului sau din anunț (auditul din 3 octombrie). Unele date din decembrie 2017 pot fi semnături reale, dar înaintea perioadei arhivei nu putem atribui un an complet.

## Publicații repetate și versiuni

O republicare cu alt ID SEAP nu este automat un contract nou. Totuși, aceeași sumă, același furnizor sau un număr asemănător nu sunt dovezi suficiente pentru unire.

Registrul persistă candidați, observații imuabile, decizii și membri. Aprobarea verifică numărul/datele/loturile, autoritatea fiscală, câștigătorii, CPV/procedura, moneda/suma și arhivele tuturor publicațiilor. Un hash de stare surprinde modificarea identității economice, eligibilității sau grupului; poarta de publicare refuză o decizie devenită invalidă.

Decizia explicită a proprietarului: **ultima versiune verificată a aceluiași contract se numără o singură dată, cu toate versiunile anterioare păstrate**. Ordinea se dovedește din data publicării și dovada modificării, nu din cel mai mare ID sau cea mai mare sumă. Loturile/comenzile distincte rămân distincte.

Documente de referință:

- [Registrul și prima deduplicare](../../implementation/contract-publication-identity/README.md): 8.045 de grupuri aprobate istoric; nu relansa markerul `contract-publication-identity-v1` deja încheiat.
- [Revalidarea publicațiilor](../../implementation/publication-revalidation-20261009/README.md) și [recuperarea finalizată pe 10 octombrie](../../implementation/publication-recovery-20261010/README.md).
- [Lucrarea actuală](../../implementation/contract-reporting-integrity-20261011/README.md): descoperire de grupuri noi după normalizare, nu doar extinderea registrului vechi. Este locală, nepublicată.

Cod relevant: `packages/db/src/contract-identity.ts`; în ingestion, `normalize/contract-identity.ts`, `approve-contract-identities.ts`, `revalidate-contract-identities.ts`, `discover-contract-identities.ts`. Cel din urmă este nou în branch-ul actual. Nu considera un candidat „dublură confirmată” înainte de verificare.

## Acorduri-cadru, subsecvente și acte adiționale — lucrare actuală

Noua migrație 0072 adaugă `source_contract_type` și `contract_type_raw_id`. Parserul păstrează tipul SEAP: 1 contract, 2 acord-cadru, 3 subsecvent. Regula nu depinde numai de cuvintele din titlu. Tipuri necunoscute sau titlu/tip explicit contradictorii ajung în `review`.

Fără tip SEAP arhivat (istoric fără răspuns sursă), `contractKind()` folosește titlul: „subsecvent” → comandă, apoi „acord-cadru” → plafon. Din `contract-reporting-3` (21 octombrie), expresia „acord-cadru” este recunoscută indiferent de separatorul dintre cuvinte (`acord[^[:alnum:]]*cadru`): „Acord – cadru”, „Acord - cadru”, „ACORD  CADRU”, „Acord -cadru”. Versiunea 2 accepta doar o cratimă sau un spațiu, așa că aceste plafoane intrau în totaluri ca cheltuială (pe copia de inventar: 30 de rânduri fără tip, 198.180.955,79 lei, ex. 107129367, 107515699, 107614867). Aceeași regulă marchează `review` un tip 1 sau 3 al cărui titlu începe cu expresia (7 rânduri tip 1, 5.370.581,80 lei, ex. 108188027). Noua versiune forțează o publicare `full`.

SEAP poate încadra un act adițional ca tip 3. Identificarea explicită a actului are prioritate: suma poate fi total actualizat, increment sau valoare fără comandă nouă. Codul nou îl ține separat, neaditiv, fără a extrage arbitrar un număr din text. **Nu există încă reconciliere generală act adițional → contract de bază → efect financiar.** Eliminarea dublei numărări nu dovedește că totalul final al tuturor modificărilor este cunoscut.

Deciziile confirmate la 12 octombrie: `contractReportable()` admite numai contracte și comenzi identificate. **Toate plafoanele sunt separate**, inclusiv fără subsecvente. `frameworkHasCalloffs()` descrie numai acoperirea, după autoritate + anunț oficial + lot; nu transformă plafonul în cheltuială. Marts, validarea și afișarea folosesc aceeași clasificare.

Grupurile cu identitate incertă sunt excluse temporar prin `marts.contract_identity_exclusions`. `canonicalContract()` aplică această excludere; eligibilitatea intrinsecă folosită la verificarea dovezilor o ignoră intenționat, ca o excludere să nu se autojustifice sau să dispară accidental. Aprobarea verificată elimină excluderea în aceeași tranzacție. Observațiile și reviziile păstrează istoricul. Erorile unui registru deja aprobat și excluderile fără proveniență validă continuă să blocheze publicarea.

Acoperirea publică arată grupuri și publicații (unități diferite); `/metodologie/excluderi` are maximum 10 grupuri pe pagină, motive și surse. Contractul exclus are o explicație și link spre propriul grup. Subtotalurile din pagina unui anunț sunt ale publicației, nu un total de adunat între republicări.

Arhivele recuperate din backup sunt în `marts.contract_identity_archives`, importate atomic cu SHA-256 verificat. Nu sunt redate parserului drept răspunsuri proaspete; ID-urile lor sunt cele din arhiva originală, nu ID-uri brute noi. Și descoperirea, și revalidarea citesc această dovadă persistentă.

Exemple probate pe copia izolată: EWT/Sector 3 — două comenzi, 28.006.010 lei; CFR/Oscar — trei comenzi, 61.945.000 lei; CNAB/X Guard — actele nu sunt adăugate peste plafon. Toate sumele sursă și linkurile rămân vizibile. Acestea sunt corecții de calcul, nu acuzații împotriva părților.

## TED și limitele comparației cu SEAP

TED conține formulare cu structuri și tipuri de valoare diferite. Parserul normalizat este versiunea 2. Datele istorice neuniforme au cerut reparsare/reconciliere în mentenanță; acea operațiune a fost finalizată, nu este o comandă de onboarding. [Cauză și procedură](../../implementation/ted-repair.md), [recuperare live](../../implementation/ted-production-recovery-20260927.md).

O atribuire TED poate fi asociată la SEAP prin dovezi, dar lipsa asocierii nu demonstrează lipsa achiziției. Numărul de ofertanți nu este numărul membrilor consorțiului. Egalitatea minim/maxim nu demonstrează o singură ofertă. Intervale și plafoane nu devin sume RON punctuale. Pagina `/supra-prag` este formulată în termenii atribuirilor publicate în TED, nu drept inventar cert al tuturor achizițiilor peste pragul european.

## ONRC și bilanțuri MF

Lotul DQ-03/DQ-05 a reparat în producție, pe 4 octombrie, datele ONRC și profiturile MF pierdute/interpretate greșit la import. Raportul consemnează 1.119.170 date ONRC și 5.399.344 profituri recuperate. Markerul `reference-import-v1` este încheiat; corecțiile sunt în importurile viitoare. [Raport și verificări](../../implementation/reference-import-integrity/PRODUCTION.md).

Reprezentant legal ONRC ≠ automat administrator, asociat ori beneficiar real. Bilanțul are an de referință; un raport între contracte și cifra de afaceri fără alinierea perioadelor induce în eroare. Păstrează proveniența și lipsurile. Nu fabrica legături personale pentru a face o poveste mai convingătoare.

## Semnale, Radiografie și validare

Sunt 13 familii de semnale, distincte de cele 13 tipuri de întrebări. Definițiile sunt în `apps/ingestion/src/flags/methodology.ts` (versiunea curentă `rf-2026.7`), iar etichetele în `apps/web/lib/flags.ts`. Codurile și descrierile sunt enumerate în [harta arhitecturii](../02-architecture.md#registrul-semnalelor-și-radiografie).

Fracționarea grupează achiziții directe după partener, clasă CPV, tip și an; fiecare trebuie să fie strict sub pragul aplicabil datei sale. Suma se raportează la cel mai mare prag aplicabil grupului. Valoarea de închidere este reper de verificare, nu demonstrație despre necesarul estimat legal. Pentru toate semnalele păstrează sursele exacte și limbajul de „de verificat”. [Limbajul riscului](../../implementation/risk-language.md).

Radiografia se actualizează zilnic; flag-urile/riscul, duminică la 05:00. Schimbarea populației sau metodologiei poate cere o primă rulare completă înainte de a reutiliza riscul săptămânal. Codul implementează această cerință prin versiunea politicii de raportare (acum `contract-reporting-4`); nu schimbă permanent calendarul duminical.

`monitoring/validate.ts` și `coverage.ts` verifică populația admisă, alocările, profilurile și sursele. Pentru contracte, criteriile de acceptare includ `eligible_missing=0`, `excluded_included=0`, `allocation_mismatches=0`. Trebuie validate și căutarea, sursele din drawer, filtrele și capturile; un total global corect nu compensează atribuirea către instituția greșită.

## Dovezi private, exporturi și cercetare

Capturile sunt reconstruite server-side, din selecția exactă, într-un snapshot coerent. Păstrează rânduri, sume zecimale, descriptor, metodologie, checkpoint și hash. Accesul este verificat la creare, citire și export. Exporturile mari folosesc ZIP64 și manifest; o listă de linkuri nu trebuie prezentată ca arhivă a tuturor PDF-urilor.

Cercetarea watchdog din 11 octombrie este în două directoare datate, cu prompturi și revizii. Nu este conținut publicat automat. Următorul reporter trebuie să citească `DATA-CAVEATS.md`: datele pot arăta aparent spectaculos tocmai din cauza republicărilor, plafoanelor sau actelor neaditive. Sursele, răspunsul instituției și documentele de bază sunt necesare pentru o investigație publicabilă.

## Cum verifici o schimbare de calcul

1. Definește populația, unitatea și identitatea înainte de a scrie suma SQL.
2. Verifică un caz pozitiv, unul exclus și unul ambiguu din arhive. Nu construi teste care doar repetă implementarea.
3. Reproduce într-o bază nouă `seap_test_*`, cu date publice și valori exacte. Nu scrie fixture-uri pe `seap` reală.
4. Testează conservarea surselor, idempotenta, rollback-ul și eșecul porții de publicare. Testează fiecare câștigător/lot, nu doar totalul.
5. Rulează preflight pe populația relevantă completă; trei exemple corecte nu validează țara întreagă.
6. În producție: backup verificat, frontieră brută înghețată, normalizare, identități, marts/semnale conform metodei, validare, căutare, redeschidere condiționată. Nu dezactiva o poartă ca să „treacă noaptea”.
