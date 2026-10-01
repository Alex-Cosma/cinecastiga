# Identități instituționale — diagnostic 1 octombrie 2026

## Domeniu și stare

Investigație doar în citire: PostgreSQL local și producție, arhiva BSON locală și codul importatorului. Nu s-au modificat date, nu s-au pornit importuri/recalculări și nu s-au făcut cereri SEAP. Nicio reparație nu este implementată prin acest raport. Scanarea este pentru un tipar precis, nu un recensământ al tuturor identităților fragmentate.

## Cauza confirmată pentru Cluj

`apps/ingestion/src/import-old/load-das.ts`, `resolveAuthority`, interpretează primul număr din `contractingAuthority` ca ID SICAP dacă încape în int32. Consultă `authMap`, apoi creează o entitate fără CUI. Ramura de identificare prin CUI intervine abia pentru numere care nu îndeplinesc acea condiție. Comentariul care declară acel câmp drept `sicapId name` nu este valid pentru probele de mai jos.

Arhiva originală `db-old/contractingAuthority.bson`:

```json
{"_id":1226,"name":"Municipiul Cluj-Napoca","cui":"4305857","county":"Cluj"}
```

Arhiva `db-old/directAcquisitionContract.bson`, trei înregistrări inspectate:

```json
{"directAcquisitionId":102373033,"contractingAuthority":"4305857 Municipiul Cluj-Napoca"}
{"directAcquisitionId":102372052,"contractingAuthority":"4305857 Municipiul Cluj-Napoca"}
{"directAcquisitionId":102367419,"contractingAuthority":"4305857 Municipiul Cluj-Napoca"}
```

Aceste achiziții sunt acum legate de `2147251`, fără CUI, cu mapping authority/SICAP `4305857`; profilul corect identificat fiscal este `2146445`, CUI `4305857`, mapping authority/SICAP `1226`. Aceeași structură este prezentă local și în producție. Rândurile istorice core au `raw_id IS NULL`, de aceea arhiva BSON contează ca probă.

## Amploare verificată local și în producție

Condiția: entitate fără CUI valid, mapping `authority.sicap_id` egal textual cu CUI-ul valid al altei entități.

- 14.548 perechi candidate.
- 14.059 au și `name_normalized` identic.
- 489 au numele diferit; necesită verificare distinctă. Exemple: Biblioteca ASTRA / Biblioteca Județeană ASTRA Sibiu; Colegiul Tehnic C. Brâncuși / Liceul Tehnologic Constantin Brâncuși. Nici aceeași sumă numerică, nici numele singur nu autorizează unirea.
- Din cele 14.059, 14.001 au profil de autoritate în `marts.entity_profile`.
- Aceste profiluri însumează **3.795.652 achiziții directe**, **0 contracte de licitație** și **16.816.609.160,95 RON** în `total_ron_split`.

Numerele agregate de mai sus sunt identice la verificarea locală și live din această sesiune. Sunt dimensiunea populației candidate, nu rezultatul unei validări individuale a 14.059 de uniri. Nu înseamnă bani dispăruți, contracte noi sau dovada dublării totalului național. Nu a fost verificat individual fiecare document istoric.

Exemple confirmate în profilurile din producție; achizițiile profilurilor secundare de mai jos sunt din 2018–2019:

| Instituție | Profil fără CUI | Profil cu CUI | CUI | Achiziții directe în profilul fără CUI | Valoare RON |
|---|---:|---:|---:|---:|---:|
| Municipiul Cluj-Napoca | 2147251 | 2146445 | 4305857 | 1.388 | 19.662.506,74 |
| Municipiul Buzău | 2149061 | 2144364 | 4233874 | 280 | 14.347.120,72 |
| Municipiul Brașov | 2147909 | 2145657 | 4384206 | 674 | 14.017.291,64 |
| Municipiul Iași | 2147527 | 2146114 | 4541580 | 1.911 | 12.352.142,07 |
| Municipiul Timișoara | 2147067 | 2146647 | 14756536 | 310 | 2.891.646,28 |
| CNAIR | 2147497 | 2146146 | 16054368 | 1.856 | 49.408.266,84 |
| Universitatea Politehnica din București | 2148182 | 2098189 | 4183199 | 6.197 | 54.006.544,80 |

## Al treilea Cluj: identitate fiscală diferită

`2165580`: CUI `14920794` (variantă brută `RO14920794`), authority/SICAP `100214502`, 102 DA și 4 contracte în profilul inspectat. Nu este același tip de fragment fără CUI. Existența numelui și CUI-ului este coroborată de [document ANAF, poziția 403](https://static.anaf.ro/static/1/Cluj/20260223111344_cj_nst_350_23feb2026_7.pdf), care menționează Municipiul Cluj-Napoca, CUI 14920794, str. Moților 1–3.

Aceasta nu stabilește de una singură relația juridică sau regula de agregare între cele două coduri. Nu înlocuim CUI-ul, nu atribuim arbitrar o denumire de serviciu și nu unim automat cele două identități fiscale. Posibilă soluție ulterioară: grup instituțional documentat, cu vedere comună și defalcare pe fiecare CUI, păstrând identificatorul fiscal al fiecărei surse.

## Reparația recomandată

1. Audit reproductibil pe sursa BSON: clasificarea prefixului folosind dimensiunea originală, CUI și nume; raport separat pentru coliziuni între spațiul SICAP și CUI, lipsuri și ambiguități. Verifică și cazul în care prefixul-CUI a găsit deja un ID SICAP real al altei instituții: simpla scanare a profilurilor fără CUI nu îl detectează.
2. Corectează importatorul după formatul sursei și adaugă teste pentru CUI, SICAP, conflict numeric și reluare idempotentă. Nu schimba global prioritatea tuturor identificatorilor SEAP.
3. Pregătește o hartă verificabilă vechi → canonic, cu proveniență și excepții. Nu relabela CUI-urile greșit introduse drept ID SEAP ca aliasuri SICAP legitime.
4. Repară întâi într-o copie izolată; conservă identitatea achizițiilor, numărul și sumele globale. Audit al tuturor referințelor, inclusiv comparații/UAT, documente, căutare, întrebări salvate, urmăriri și dovezi. Păstrează accesul prin vechile linkuri și rezolvarea filtrelor cu ID vechi; capturile istorice rămân imuabile.
5. Recalculează statisticile, Radiografia și semnalele afectate, apoi reindexează căutarea. Consolidarea instituțiilor poate modifica grupările de risc; nu ajunge o corecție de etichetă sau de search.
6. Abia după validare, pregătește aplicarea în producție cu backup, mentenanță și verificările publicării. Nicio operațiune live nu a fost lansată aici.

Nu rula `merge-exact-name` ca scurtătură: este altă procedură, nu validează această proveniență și nu constituie planul complet de migrare a referințelor actuale.

## Interogare de diagnostic

Executată cu `BEGIN READ ONLY`, `statement_timeout` 30–60s. Nu executa UPDATE pornind direct de la acești candidați.

```sql
WITH pairs AS (
  SELECT a.id old_id, b.id main_id,
         a.name_normalized = b.name_normalized exact
  FROM core.entities a
  JOIN core.entity_sicap_ids s
    ON s.entity_id = a.id AND s.namespace = 'authority'
  JOIN core.entities b
    ON b.cui_valid AND b.cui_canonical = s.sicap_id::text AND b.id <> a.id
  WHERE NOT a.cui_valid
)
SELECT count(*) candidate_pairs,
       count(*) FILTER (WHERE exact) exact_name_pairs
FROM pairs;
```

Pentru impact, același CTE se leagă de `marts.entity_profile p ON p.entity_id = old_id AND p.role = 'authority'`, filtrând `exact`, cu `count(*)`, `sum(p.n_das)`, `sum(p.n_contracts)`, `sum(p.total_ron_split)`.
