# Clarificarea identităților — primul lot verificat, 12 octombrie 2026

**275 de grupuri clarificate pe copia locală, fără cereri noi către SEAP.** Dintre cele 740 de grupuri inițiale cu posibil impact financiar rămân 484. Codul și aplicarea pe copie sunt verificate; această intervenție nu este comisă, publicată sau aplicată în producție.

Acest raport continuă [planul de handover](../../handover/continuation-20261012-contract-ambiguities.md) și actualizează numărătorile din [POLICY-20261012](POLICY-20261012.md). Politicile aprobate rămân aceleași: toate plafoanele separat, ultima versiune dovedită o singură dată, grupurile incerte excluse temporar cu surse vizibile.

## Rezultate pe copia delimitată

Mediu: `seap_test_currency_inventory_20261011`, 209.082 contracte din populația anunțurilor repetate. Nu este recalcularea întregii producții.

| Indicator | Înainte | După |
|---|---:|---:|
| Grupuri incerte | 1.272 | 997 |
| Publicații contractuale excluse temporar | 2.870 | 2.154 |
| Grupuri incerte cu eligibilitate financiară intrinsecă | 740 | 484 |
| Contracte distincte incluse în marts | 87.726 | 87.978 |
| Alocări contract–furnizor în marts | 95.359 | 95.756 |

Cele 275 de grupuri clarificate cuprind 716 publicații sursă. 256 dintre grupuri aveau cel puțin o publicație altfel eligibilă financiar la început. **252 reintră ca achiziții distincte**, iar patru rămân neaditive: arhiva dovedește că sunt plafoane, chiar dacă importul vechi nu avea tipul complet proiectat. Celelalte 19 grupuri clarificate erau deja în afara populației financiare.

Cele patru plafoane identificate au reprezentanții publici `107186411` (CAN1136323), `107630521` (CAN1089681), `107729919` (CAN1088251), `107627105` (CAN1167270). Nu au fost adăugate la total ca achiziții. Această schimbare este completarea clasificării din dovada originală, nu o rescriere a sumelor.

Reconciliere: `eligible_missing=0`, `excluded_included=0`, `allocation_mismatches=0`. Calitate monetară: zero erori structurale și zero contradicții pentru valorile care pretind proveniență verificată. Cazurile monetare deja declarate necunoscute/inconsistente rămân în afara sumelor; nu au fost toate „reparate” prin această intervenție.

Repetarea descoperirii aprobă **zero grupuri suplimentare**, cu aceleași 997/2.154/484 excluderi. Revalidarea de sursă a tuturor celor 275 de grupuri noi a trecut. Proiecțiile economice ale celor 2.870 de publicații inițiale sunt identice cu referința de pornire, în afară de adăugarea explicită a dovezii de identitate străină; numerele, datele, valorile, titlurile și câștigătorii nu au fost rescriși.

Probe persistente:

- [Rezultate finale și calitatea datelor](ambiguity-repair-results.json).
- [Registrul celor 275 de clarificări](ambiguity-resolution-ledger.json): motive anterioare, publicații, reprezentant canonic, includere financiară și dovezi cu proveniență/hash.
- [Referința inițială](ambiguity-baseline-summary.json) și [evaluarea înainte de aplicare](ambiguity-evaluation-summary.json).
- [Țintele de documentare rămase](ambiguity-evidence-targets.json), deduplicate pe anunț; nu sunt o coadă lansată și nici un număr de cereri HTTP necesare.

## Cauze reparate în evaluatorul recurent

### Echivalentul în lei al unei valori în valută

Evaluatorul accepta numai `amountStatus='ron'`, deși normalizarea monetară comună poate demonstra `converted` din valoarea originală, cursul declarat și echivalentul în lei. Astfel ajungeau la `archive_disagrees_with_core` inclusiv contracte pentru care sursa și importul erau concordante.

Acum verificarea acceptă ambele stări confirmate de `normalizeContractMoney`. Nu inventează cursuri și nu convertește din nou. Dovada păstrează moneda originală, valoarea originală, valoarea în lei și cursul. Lipsa unui curs sau o conversie inconsistentă continuă să împiedice aprobarea.

Același echivalent RON nu dovedește aceeași sumă în moneda originală. Diferențele de monedă și de valoare originală sunt motive explicite (`different_source_currency`, `different_source_money`). Pentru versiuni diferite se verifică și schimbarea valorii originale, chiar dacă echivalentul în lei a rămas egal.

Exemplu verificat: CAN1127791, contractul `345171`, publicații `108117154`, `108174803`, `108186508`, valoare originală 9.000 EUR și echivalent sursă 49.500 RON. Nu a fost folosit un curs valutar extern sau curent.

### Furnizori străini identificați explicit

Evaluatorul cerea CUI românesc fiecărui participant. Unele entități au însă deja în baza normalizată țara și identificatorul străin. Acum le folosim numai când se potrivesc cu datele din fiecare publicație arhivată.

Proiecția `readContractIdentityMembers` adaugă opțional `winnerForeignIds`, legat de ID-ul intern al fiecărui participant fără CUI, din `country_code` și `foreign_id_norm`. Identitatea trebuie să aibă o țară explicită non-RO și un identificator substanțial. Nu există potrivire aproximativă de nume, CUI inventat sau comasare nouă de entități. Country/ID lipsă, diferite ori necorelate cu participantul păstrează blocajul.

Proiecția și hash-urile istorice pentru contractele cu identificatori românești rămân neschimbate. Interogarea suplimentară a identităților străine se execută numai când lista CUI-urilor are un membru lipsă. Pentru noile identități străine, țara și identificatorul participă la snapshot: o schimbare ulterioară impune reverificarea, nu o aprobare moștenită tacit.

Exemplu rezolvat: CAN1089681, publicațiile `107630524` și `108052396`, Geolog International BV, identificator `NL817417813B01`, țară `NL`, valoare 503.000 lei. Absența unui CUI românesc nu mai este tratată singură drept lipsă de identitate.

### Corecțiile punctuale revizuite anterior

Evaluatorul folosește acum aceeași funcție `reviewedWinnerIdentity` ca parserul. Aceasta conține excepțiile documentate în intervenția din 8 octombrie și cere combinația exactă de contract, identificator SICAP, cod fiscal și nume. Dovada notează explicit originalul și transformarea. Nu s-a extins lista de excepții și nu s-au „corectat” automat alte CUI-uri după nume. Unele republicări istorice ale acelor cazuri rămân neclare fiindcă nu au încă aceeași dovadă punctuală.

## Ce rămâne de clarificat

În cele **484 de grupuri financiare** rămase, motivele sunt:

| Motiv | Grupuri |
|---|---:|
| Lipsește dovada modificării contractului | 291 |
| Identificare incompletă | 171 |
| Lipsește identificatorul procedurii | 78 |
| Arhiva diferă de import | 68 |
| Versiuni arhivate contradictorii | 18 |
| Multiplicitate ambiguă | 2 |
| Tip/condiții sursă diferite | 1 |

Motivele se suprapun. `missing_archive` rămâne în populația nefinanciară (207 grupuri), nu în cele 484 financiare. Noile dovezi despre furnizorii străini au făcut unele contradicții mai precise: două valori `null` care păreau egale în vechiul evaluator pot ascunde identificatori străini diferiți; de aceea numărul unui motiv nu trebuie interpretat izolat ca progres/regres.

Exemplul inițial CAN1017812 a fost investigat mai precis. În arhive, TPF GETINSA EUROESTUDIOS SL. apare cu `84840685` și `B84840685`, aceeași țară ES și același ID SICAP. Baza are forma `84840685`. Grupul rămâne exclus: noul motiv este contradicția de identificare, nu simpla absență a CUI-ului. **Nu s-a eliminat automat litera B** și nu s-a declarat identitatea legală a celor două forme fără verificare suplimentară.

Pentru 78 de grupuri financiare lipsește identificatorul procedurii; exemplele citite includ „Negociere fără publicare prealabilă” și „Norme proprii”. În detaliul CAN1160111, `procedureId` este explicit `0`, iar în listă lipsește. Repetarea aceleiași cereri nu garantează apariția unui ID. Este necesară definirea și testarea unei dovezi alternative de identitate pentru acea structură de anunț, nu completarea cu un ID inventat sau eliminarea condiției pentru toate cazurile.

## Documentare suplimentară făcută fără trafic SEAP

O verificare strict în citire a arhivelor publice din producție a găsit detalii care nu erau în copia inițială de audit. Au fost copiate local **864 răspunsuri publice deja existente** pentru 432 dintre cele 825 de anunțuri țintă: 432 root, 225 eForms, 207 inventare de loturi (pagina 0). Nu sunt descărcări noi din SEAP și nu s-au modificat cozi sau setări live.

- Fișier ignorat de Git: `.local/contract-reporting-integrity-20261011/ambiguity-extra-details-20261012.jsonl`.
- Dimensiune: 94.245.970 octeți.
- SHA-256: `2d84f75d79f62feeabd6c3880fbfd3eb616ed810ecd9fbb607a3f3bbec2dfd4d`.
- Manifest: `.local/contract-reporting-integrity-20261011/ambiguity-extra-details-manifest.json`.
- 475 anunțuri țintă privesc grupuri financiare; pentru 247 există detalii în acest export.

Aceste fișiere suplimentare **nu au fost importate în registrul persistent al dovezilor și nu au aprobat automat grupuri**. Importatorul existent acceptă arhivele listă/contracte; extinderea la detalii cere validarea identității părinte, provenienței și formatului, apoi teste. Un inventar de loturi pe pagina 0 nu este presupus complet fără verificarea `total`/paginării.

O pistă concretă: pentru CAN1090290, detaliul noii publicații `100652727` indică `hasLots=false` atât în condiții, cât și în secțiunea obiectului, iar `procedureId=100191435` corespunde listelor. Ar putea clarifica lotul gol. Încă trebuie definită dovada că această informație despre procedură se aplică și publicației istorice; nu s-a completat lotul cu „1” și nu s-a ridicat excluderea.

Pentru modificări de valori/consorții, eForms și documentele trebuie legate de exact contractul și versiunea în discuție. Simpla existență a unui formular mai nou sau a unui text generic despre modificări nu este suficientă. Nici alegerea celui mai mare ID nu dovedește ce valoare trebuie însumată.

## Continuarea recomandată

1. Folosește registrul de ținte și cele 864 de arhive suplimentare pentru un pachet de dovezi per grup. Prioritate: identitățile străine cu variante explicite, apoi loturi/proceduri fără identificator, apoi modificările de valori și participanți.
2. Pentru fiecare regulă posibilă, documentează exemplele pozitive și contraexemplele înainte de a extinde evaluatorul. Anunțurile fără procedură și identitatea străină cu variante cer reguli distincte; nu sunt rezolvate de acest lot.
3. Identifică punctual sursele încă lipsă. Cele 825 de anunțuri sunt ținte de documentare, **nu 825 de requesturi aprobate/necesare**. Endpointurile de istorice contractuale nu au fost identificate/validate în această etapă. Nu porni un sweep general.
4. UI-ul admin pentru verdict „același contract / contracte distincte / încă neclar” rămâne o propunere. Nu folosi actuala tabelă de aprobări de deduplicare pentru un verdict de contracte distincte.
5. Aplicarea în producție a întregii reparații rămâne procedura separată din POLICY: dovezi instalate, backup real, procesare full și publicare verificată. Nu este necesară rezolvarea tuturor grupurilor pentru a aplica politica de excludere deja aprobată.

## Instrument nou de reluare

`apps/ingestion/src/scripts/audit-contract-ambiguities.ts` rulează numai pe un host local și o bază `seap_test_*`, într-o tranzacție PostgreSQL `REPEATABLE READ READ ONLY`. Compară observațiile excluse cu evaluatorul curent, clasifică eligibilitatea independent de excludere și generează țintele deduplicate de documentare. Nu modifică registre, nu descarcă nimic și refuză suprascrierea fișierului de ieșire.

Din rădăcina repository-ului, cu Node 22 și baza izolată deja pregătită:

```sh
node --env-file=apps/web/.env.local scripts/operations/with-currency-db.mjs \
  seap_test_currency_inventory_20261011 \
  node --import ./apps/ingestion/node_modules/tsx/dist/loader.mjs \
  apps/ingestion/src/scripts/audit-contract-ambiguities.ts \
  .local/contract-reporting-integrity-20261011/ambiguity-audit-next.json
```

Executarea înainte de aplicare a produs `.local/contract-reporting-integrity-20261011/ambiguity-audit-before-publication.json`: 1.272 → 997, financiar 740 → 484, identic cu rezultatul aplicării. O rulare după reparație pornește de la 997 și nu trebuie să pretindă din nou aceleași 275 clarificări.

## Validare și limite de livrare

- 263 teste unitare ingestion trecute, inclusiv un identificator fiscal cu tip nevalid care rămâne în revizuire fără excepție în evaluator.
- 15 teste de integrare PostgreSQL trecute, incluzând eliberarea unei excluderi numai după concordanța dovezii străine, conversia confirmată, rerularea idempotentă, revalidarea viitoare și detectarea schimbării identificatorului străin.
- Build al pachetului DB și typecheck ingestion/web trecute. După ultima optimizare SQL, cele 10 teste de integrare descoperire/revalidare/marts au fost rerulate și au trecut.
- Repetiție reală pe cohortă: tipuri 3,3 s, verificarea aprobărilor existente 60,5 s, descoperire 170,3 s, marts 60,8 s, reconciliere 4,8 s, coverage 6,1 s. Nu este ETA pentru producția completă.
- Toate cele 275 de aprobări noi verificate prin funcția folosită la revalidare; proiecțiile economice inițiale păstrate; rerulare fără aprobări noi; calitate monetară/identități/excluderi și reconciliere valide.
- După optimizarea finală a proiecției, verificarea pe date reale confirmă zero hash-uri schimbate și zero decizii invalide pentru cele 179.683 de publicații aprobate; cele 2.154 de excluderi rămân valide. [Rezultatul](ambiguity-final-projection.json).

Jurnale ignorate de Git în `.local/contract-reporting-integrity-20261011/`: `ambiguity-rehearsal.log`, `ambiguity-final-verification.log`, `ambiguity-unit-tests.log`, `ambiguity-final-projection-tests.log`, `ambiguity-audit.log`. Scripturile exploratorii din același director păstrează analiza inițială; CLI-ul de audit din repository este punctul reproductibil de intrare.

Nu s-au rulat o recalculare națională completă, rebuild Meili sau semnale de risc pe producție. Baza locală obișnuită `seap` a fost doar citită punctual. Producția a fost numai citită pentru arhive publice. Nu s-au modificat rate, proxy-uri, cozi sau conturi. Working tree-ul rămâne necomis pe `fix/contract-reporting-integrity-20261011`.

Preview-ul izolat de pe portul 3101 răspunde HTTP 200 la `/metodologie/excluderi` și afișează 997 de grupuri / 100 pagini. Controlul copiei este `paused=true`, `maintenance=false`; markerul artificial al repetiției a fost închis cu `failed` și explicația „Isolated ambiguity cohort rehearsal only; not a complete production publication”. Acesta nu este un incident live și nu trebuie promovat în `ready` ca publicare de producție. Nu rulează collector/OCR/scheduler pentru această previzualizare.
