# Continuare — clarificarea identităților contractuale, 12 octombrie 2026

**Actualizare după autorizarea continuării:** primul lot este implementat și verificat local: 275 grupuri clarificate, 997 rămase / 484 cu eligibilitate financiară. [Rezultate, dovezi și continuarea exactă](../implementation/contract-reporting-integrity-20261011/AMBIGUITIES-20261012.md). Textul de mai jos păstrează planul și referința inițială; nu mai considera toate regulile de clarificare drept nescrise. Fără deploy sau mutații în producție.

**Checkpoint pentru plan, nu raport de rezolvare a cazurilor.** Proprietarul a întrebat dacă putem clarifica grupurile excluse și a cerut salvarea planului înainte de continuare. În această etapă s-au verificat documentația, codul evaluatorului și exemple din copia locală, exclusiv în citire. Nu s-au implementat noi reguli de clarificare, nu s-au făcut cereri SEAP și nu s-a intervenit în producție.

## Obiectiv și decizii confirmate

Reducem excluderile prin dovezi verificabile: corectăm erorile importului nostru, completăm identificarea când sursele permit și deosebim republicările, modificările contractuale și contractele distincte. Nu promitem rezolvarea automată a tuturor grupurilor.

Deciziile proprietarului, care nu mai trebuie cerute din nou:

- Toate plafoanele acordurilor-cadru rămân separat de totalurile contractelor, inclusiv când lipsesc subsecventele identificate. Lipsa lor înseamnă acoperire incompletă, nu zero cheltuieli.
- Pentru versiuni dovedite ale aceluiași contract: ultima versiune verificată o singură dată, cu toate versiunile anterioare păstrate.
- Grupurile incerte sunt excluse temporar, cu numărul cazurilor, motivele și sursele accesibile. Incertitudinea lor singură nu trebuie să blocheze publicarea întregului set.
- Datele contractuale nu reprezintă plăți, iar aceste neclarități nu constituie dovezi de fraudă.

Propunerea de interfață admin pentru adjudecare este încă **propunere**, nu funcționalitate implementată. Cererea actuală de handover nu autorizează implicit deploy, mentenanță, schimbarea ritmului sau colectare generală nouă. Nu cere din nou aprobarea politicilor de mai sus; verifică separat scopul operațiunii live când ajungi acolo.

## Starea de la care se continuă

| Element | Stare verificată/documentată |
|---|---|
| Repository | `~/Desktop/Personal/code/seap` |
| Branch | `fix/contract-reporting-integrity-20261011` |
| HEAD local | `d16d866`; reparația ulterioară este în working tree, necomisă/nepublicată |
| Producție | Nemodificată de această reparație; ultima observație live este datată în documentația anterioară, nu reverificată acum |
| Local `seap` obișnuit | Nemodificat de această reparație; nu îl confunda cu bazele de verificare |
| Copie de inventar | `seap_test_currency_inventory_20261011`, container `seap-postgres-1`, PostgreSQL 16, rol `seap` |
| Domeniul copiei | 4.181 numere oficiale repetate, 8.578 publicații de anunțuri, 209.082 contracte; nu întreaga bază națională |
| Rezultat actual | 1.272 grupuri neclare, 2.870 publicații contractuale excluse; 740 grupuri cu cel puțin un membru altfel eligibil financiar |
| Aprobări verificate | 75.974 grupuri noi plus 8.045 istorice; nu relua aprobarea arbitrar |
| Preview pregătit | `http://localhost:3101/metodologie/excluderi`; verifică dacă procesul mai rulează înainte să îl anunți disponibil |

Există multe modificări necomise, inclusiv documente și cercetări anterioare. Păstrează-le. Un clone al HEAD-ului actual **nu primește încă această implementare** sau acest handover necomis; pentru transfer între calculatoare este necesară livrarea explicită a codului/documentelor, iar dovezile ignorate de Git se transferă separat. Nu include dump-uri sau secrete în commit.

Referințe principale:

- [Politica implementată, verificările și procedura de aplicare în producție](../implementation/contract-reporting-integrity-20261011/POLICY-20261012.md).
- [Rezultate actuale structurate](../implementation/contract-reporting-integrity-20261011/policy2-results.json).
- [Predarea întregului proiect](20261011/README.md) și [starea intervenției](20261011/status-and-continuation.md).
- [Registrul istoric de revizuire](../implementation/contract-reporting-integrity-20261011/review-candidates.md): 748 grupuri financiare sub regula veche. Nu prezenta 748 drept numărul actual, care este 740.

## Motivele actuale și ce înseamnă

Aceste numere privesc **toate cele 1.272 grupuri**, nu numai cele 740 financiare. Motivele se suprapun și nu se adună.

| Motiv | Grupuri | Direcția verificării |
|---|---:|---|
| `incomplete_identity` | 613 | Identifică exact câmpul absent/nevalid, apoi caută dovada în sursele aceleiași proceduri. |
| `archive_disagrees_with_core` | 467 | Diferență de import, corecție ulterioară în sursă sau contradicție reală? Compară câmpurile și proveniența. |
| `missing_amendment_evidence` | 298 | Valorile/titlurile/participanții diferă fără dovada suficientă a unei modificări a aceluiași contract. |
| `missing_archive` | 207 | Lipsește o parte din dovada cerută, nu neapărat documentul PDF sau contractul însuși. |
| `missing_procedure` | 82 | Lipsește identificatorul procedurii din arhivele folosite de evaluator. Verifică dacă tipul sursei permite o altă identificare dovedită. |
| `conflicting_archived_versions` | 18 | Aceeași publicație are conținut diferit în arhive; ordinea și efectul versiunilor trebuie demonstrate. |
| `ambiguous_multiplicity` | 2 | Mai multe rânduri coexistă; asemănarea nu dovedește că reprezintă un singur contract. |
| `different_source_conditions` | 1 | Tipul contractual sau condițiile sursă diferă; nu se unesc numai după număr și dată. |

Raportul istoric al celor 748 avea 211 grupuri cu CUI de câștigător absent, 83 cu lot absent și zero `missing_archive` în populația financiară după recuperarea arhivelor. Aceste subnumărători **nu au fost recalculate pentru cele 740**. Nu le reutiliza ca rezultate curente fără verificare.

### Exemplu citit direct din copia locală la acest checkpoint

`CAN1017812`, contract nr. `590`, publicații contractuale SEAP `107682358` și `107940299`:

- Valoarea ambelor publicații: `3097310` lei, păstrată ca zecimal exact.
- Titlu despre supervizarea lucrărilor pentru cheul proiectului Platforma Multimodală Galați, etapa I.
- Lotul arhivat în registru: `1. Default lot`.
- În ambele publicații, lista CUI-urilor este `["26985401", null]`.
- Motivul rămas: `incomplete_identity`.

Pistă: identificarea participantului fără CUI din documentele atribuirii sau alte surse oficiale legate explicit de contract. Acest exemplu nu este încă rezolvat. Valoarea și titlul egale nu înlocuiesc identificarea participantului; nu atribui CUI după o potrivire aproximativă de nume.

## Plan de execuție

### 1. Inventar reproductibil, fără trafic nou spre SEAP

1. Verifică branch, working tree și baza. Citește raportul politicii înainte de orice script de repetiție.
2. Capturează referința de comparație: grupuri, membri, motive, observații/fingerprint-uri și eligibilitate intrinsecă. Păstrează data și mediul în fiecare raport.
3. Separă cele 740 de grupuri cu posibil impact financiar de restul. Folosește `readContractIdentityMembers` și proprietatea `eligible`, nu existența în marts: membrii excluși lipsesc intenționat din marts.
4. Descompune fiecare motiv în câmpuri concrete: CUI lipsă/nevalid, lot absent, diferență de titlu, valoare, participanți, tip sau condiții. Pentru diferențele arhivă/core emite valorile de ambele părți, ID-urile sursă și hash-urile.
5. Grupează cauzele comune pe procedură/import, pentru a repara o regulă cu toate exemplele aferente. Nu porni cu 740 de corecții manuale independente.

Artefacte propuse, încă necreate: `ambiguity-baseline.json`, `ambiguity-causes.md`, `resolution-ledger.jsonl` în directorul intervenției sau în `.local/` pentru volume mari. În ledger: grup, membri, observație inițială, motiv, dovadă, verdict propus, explicație, rezultate înainte/după. Nu însuma valorile republicărilor ca „impact financiar”; acel calcul depinde tocmai de identitatea încă neclară.

### 2. Repară întâi cauzele demonstrabile din datele existente

- **Identificare incompletă:** folosește numai legături explicite din surse. Un lot gol nu înseamnă automat „lotul 1”; absența lotizării poate necesita o dovadă distinctă. Un participant străin poate necesita alt identificator decât CUI românesc: verifică sursa și modelează explicit cazul, fără să inventezi un CUI.
- **Identificator de procedură absent:** evaluatorul actual cere `procedureId` în arhiva anunțului. Inspectează tipurile efective; este o ipoteză că unele anunțuri pot fi identificate sigur altfel, nu o regulă deja validată. Nu elimina global condiția și nu fabrica un ID de procedură.
- **Arhivă/core diferite:** dacă parserul nostru a interpretat greșit o sursă verificată, repară parserul și pregătește o reprocesare țintită, cu proveniență. Dacă diferența reflectă o versiune sursă ulterioară, păstrează versiunile. Nu reexecuta toate arhivele vechi peste date noi.
- **Arhive contradictorii:** data descărcării și cel mai mare ID nu demonstrează ordinea modificărilor contractuale. Caută data/legătura explicită a reviziei și păstrează fiecare conținut.
- **Modificări fără dovadă:** caută în răspunsurile/documentele deja arhivate istoricul modificării sau actul care leagă versiunile. Un act adițional nu este automat o comandă nouă; reconcilierea generală act → contract → efect financiar rămâne o lucrare distinctă, încă neimplementată.

Fiecare regulă nouă trebuie să fie repetabilă în pipeline, cu exemple pozitive și negative. Remedierea punctuală prin SQL fără corectarea cauzei nu îndeplinește cererea de prevenire a reapariției.

### 3. Dovezi suplimentare țintite, după măsurarea restului

Pentru fiecare caz rămas notează exact ce lipsește, ce anunț/contract îl poate clarifica și care este cea mai mică preluare utilă. Verifică mai întâi arhivele persistente, bundle-ul istoric și fișierele deja descărcate. Nu presupune existența unui endpoint de istoric sau că un nou GET va întoarce versiunile vechi: verifică implementarea/sursa înainte de a propune cereri.

Pregătește apoi numărul estimat de requesturi și țintele deduplicate, raportând separat inventar/metadate și documente. La execuția autorizată folosește bugetul comun, pool-ul, pauzele și retry-urile existente; inspectează setările live. Nu lansa un nou sweep, download general, bypass de rate sau fallback direct pe IP-ul serverului.

### 4. Revizuire umană pentru ce nu poate fi demonstrat automat

Propunere de flux admin, de proiectat ulterior, folosind registrul existent:

- Comparație între publicații, cu diferențele evidențiate, documente/surse și motivul excluderii.
- „Același contract”: republicări sau versiuni dovedite; reprezentantul financiar rezultă din regula ultimei versiuni verificate.
- „Contracte distincte”: păstrăm fiecare contract eligibil separat și documentăm de ce asemănarea inițială era înșelătoare.
- „Încă neclar”: păstrăm excluderea, cu următoarea dovadă necesară.

Orice decizie trebuie legată de observația exactă, motiv, surse și autor; dovezile schimbate între afișare și salvare trebuie să invalideze decizia propusă. Aplicarea în totaluri are loc în procesarea validată, nu printr-un buton care modifică direct marts.

**Lipsă actuală de implementare:** `contract_identity_decisions` reprezintă aprobarea unui grup cu reprezentant canonic. Nu are deja semantica de „contracte distincte” sau de adjudecare manuală generală. Nu reutiliza o aprobare de deduplicare pentru acest verdict. Va fi necesară o regulă/schema compatibilă cu reverificarea și istoricul, dacă alegem acest flux. `/metodologie/excluderi` este registru public de consultare, nu editor.

## Cod și dovezi de folosit

| Componentă | Rol |
|---|---|
| `apps/ingestion/src/normalize/contract-identity.ts` | Evaluator strict, semnături/ancore, motive, verificarea arhivelor și a versiunilor |
| `apps/ingestion/src/normalize/discover-contract-identities.ts` | Descoperire, aprobare verificată, excluderi și păstrarea grupurilor dispărute din candidare |
| `apps/ingestion/src/normalize/approve-contract-identities.ts` | Aplicarea aprobărilor în condițiile de publicare |
| `apps/ingestion/src/normalize/revalidate-contract-identities.ts` | Revalidarea aprobărilor existente |
| `packages/db/src/contract-identity.ts` | Eligibilitatea independentă de excludere, populația canonică și verificările de integritate |
| `packages/db/src/contract-reporting.ts` | Clasificarea financiară comună |
| `packages/db/src/schema/contract-identity.ts` | Candidați, observații, decizii, membri, revizii, excluderi și arhive |
| `apps/ingestion/src/normalize/contract-identity-archives.ts` | Citirea/importul dovezilor persistente, cu hash verificat |
| `apps/ingestion/src/normalize/scheduled-contract-evidence.ts` | Importul unic în procesarea înghețată; marker `contract-reporting-evidence-v1` |
| `apps/web/lib/contract-exclusions.ts` | Explicații românești și citirea registrului public |

Migrațiile locale noi sunt 0072 și 0073. Nu modifica retrospectiv migrații/checksum-uri. Dovezile recuperate, SHA-256 și procedura de instalare sunt în raportul politicii. `.local/contract-reporting-integrity-20261011/inventory-recovered-groups.json` are aproximativ 167 MiB: procesează-l cu un script și emite rezumate, nu îl încărca integral în context. Vechiul `approved-bundle.json.gz` rămâne necesar revalidării; nu îl șterge.

### Prima interogare, numai în citire

Din rădăcina proiectului, pe mediul local documentat:

```sh
docker exec -i seap-postgres-1 psql -X -U seap \
  -d seap_test_currency_inventory_20261011 -v ON_ERROR_STOP=1 -qAt <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL work_mem='8MB';
SET LOCAL max_parallel_workers_per_gather=0;
SELECT count(DISTINCT candidate_id) AS groups, count(*) AS publications
FROM marts.contract_identity_exclusions;
WITH excluded AS (
  SELECT DISTINCT candidate_id, fingerprint
  FROM marts.contract_identity_exclusions
)
SELECT reason, count(DISTINCT x.candidate_id)
FROM excluded x
JOIN marts.contract_identity_observations o ON o.fingerprint=x.fingerprint
CROSS JOIN LATERAL jsonb_array_elements_text(o.evidence->'reasons') AS r(reason)
GROUP BY reason ORDER BY count(DISTINCT x.candidate_id) DESC, reason;
ROLLBACK;
SQL
```

Această interogare nu calculează subsetul financiar. Pentru acesta citește membrii excluși prin `readContractIdentityMembers`, grupează după `candidate_id` și numără grupurile cu cel puțin un `eligible=true`. IDs `id` sunt interne; `publicId` sunt identificatori contractuali SEAP; `noticeId` identifică publicația anunțului. Nu le substitui în linkuri.

Pentru scripturile Node izolate există `scripts/operations/with-currency-db.mjs`, cu Node 22 și `apps/web/.env.local`. Wrapperul injectează conexiunea fără afișarea secretelor și refuză baze non-locale/fără prefixul sigur. Comenzile de test/preview sunt în raportul politicii; nu utiliza scripturile de repetiție doar pentru a citi starea, fiindcă ele modifică baza izolată.

## Validare și criterii de închidere

O regulă de clarificare este gata numai când:

1. Dovezile explică decizia; sursele originale, observațiile și schimbarea sunt păstrate.
2. Testele arată atât acceptarea cazului demonstrat, cât și refuzul unei asemănări insuficiente sau al unor dovezi contradictorii.
3. Repetarea procesării este idempotentă; observațiile schimbate cer reverificare. Grupul incert dispărut din candidare rămâne în revizuire (`identity_relationship_unresolved`), fără reincludere tacită.
4. Verificările `assertContractIdentityQuality` și `assertContractExclusionsQuality` trec. Registrele aprobate corupte și sursele dispărute nu sunt mascate ca simple incertitudini.
5. Marts se reconciliază: `eligible_missing=0`, `excluded_included=0`, `allocation_mismatches=0`; sumele exacte și istoria versiunilor se păstrează.
6. Raportul înainte/după arată grupuri rezolvate pe cauze, publicații afectate, modificarea populației financiare și cazurile încă excluse. Cele 740 sunt punct de plecare pe această copie, nu o țintă de forțat la zero.

Rulează regresiile relevante din `contract-reporting.integration.test.ts`, `discover-contract-identities.test.ts`, `discover-contract-identities.integration.test.ts`, `revalidate-contract-identities.integration.test.ts` și testele arhivelor când le modifici. Pentru parser/monede include testele corespunzătoare și reconcilierea. Integrarea se rulează numai pe baze `seap_test_*`; testele care trunchiază controlul procesării folosesc baza separată de schedule. Testele/buildurile raportate în POLICY sunt ale implementării anterioare, nu validează reguli noi încă nescrise.

Producția rămâne o livrare separată: dovezi instalate și verificate, backup real, frontieră înghețată, migrații, recalculare completă cerută de noua metodă, validare și căutare înainte de redeschidere. Urmează procedura existentă; markerii simulați de backup ai repetiției locale nu sunt backupuri de producție.

## Prompt scurt de reluare

> Continuă clarificarea identităților contractuale din `docs/handover/continuation-20261012-contract-ambiguities.md`, după ce confirmi sarcina curentă. Citește AGENTS și POLICY-20261012. Păstrează reparația necomisă de pe `fix/contract-reporting-integrity-20261011`. Începe pe copia izolată, fără trafic SEAP: descompune motivele celor 740 de grupuri cu eligibilitate financiară și identifică erorile de import remediabile din arhive. Nu inventa identificatori și nu aproba asemănări drept dubluri. Dovedește și testează fiecare regulă, păstrează istoricul și raportează înainte/după. Colectarea țintită, fluxul admin și aplicarea în producție sunt pași ulteriori, cu starea și scopul explicite. Nu considera acest handover dovada că aceste clarificări au fost deja implementate.

## Ce s-a făcut efectiv la salvarea acestui checkpoint

Citire de documentație/cod, verificarea branch/HEAD/working tree și, în schimbul precedent, interogare read-only a câtorva exemple din copia izolată. S-a scris planul și s-au legat punctele de intrare ale handoverului. Fără schimbări de cod funcțional, mutații de date, cereri SEAP, commit, push sau deploy pentru acest pas.

Comanda read-only de mai sus a fost executată la salvare: confirmă 1.272 grupuri, 2.870 publicații și toate cele opt numărători ale motivelor din tabel. Linkurile locale din checkpoint și documentele de intrare modificate au fost verificate, iar `git diff --check` a trecut. Nu au fost rerulate teste de aplicație pentru această modificare exclusiv documentară.
