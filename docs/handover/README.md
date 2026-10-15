# Handover cinecâștigă? — punctul de intrare

**Consolidare: 11 octombrie 2026.** Acesta este ghidul pentru un coleg și modelul său LLM, fără acces la conversația inițială. Începe cu [predarea integrală](20261011/README.md). Indexul anterior, cu toate notele deja existente și stările datate, este păstrat integral în [HISTORY-INDEX.md](HISTORY-INDEX.md).

**15 octombrie — „Ce bate la ochi” în producție, numai pentru administratori:** cod pe `main`; poveștile în lucru sunt fișiere JSON numai pe server (`/srv/seap/stories/`), nu în repository. Vizitatorii și watchdogii nu văd secțiunea. Vezi [implementarea](../implementation/editorial-stories.md) și [operațiunile](05-operations.md#povești-ce-bate-la-ochi-în-lucru). Notele de mai jos păstrează cronologia lucrului local.

**2 octombrie, a doua documentare reală:** [Aquapark Buzău](../research/20261002-aquapark-buzau/README.md) este adăugată exclusiv local, alături de Școala 311. Leagă achiziția din septembrie de calendar, auditul de conformitate și proprietatea constructorului. Nu s-au trimis solicitări și nu s-a publicat. Catalogul de producție rămâne gol.

**2 octombrie, implementare locală:** [Ce bate la ochi](../implementation/editorial-stories.md) adaugă harta poveștilor, indexul județului, articolul și fișele surselor. Macheta a fost aprobată; implementarea și verificările locale sunt încheiate. Exemplele au fost șterse; [prima documentare reală, Școala 311](../research/20261002-scoala311/README.md), este preview numai în development. Catalogul publicat rămâne gol, solicitările către părți sunt netrimise. [Completarea despre oameni și legături](../research/20261002-scoala311/oameni-si-legaturi.md) documentează administratorii, relația cu M&M, conducerea școlii și două erori de import ONRC/MF descoperite, încă nereparate. Editorul admin este un pas separat. Fără commit/push/deploy în această etapă.

**2 octombrie, copie locală actualizată:** [transferul integral din producție](../implementation/local-production-copy-20261002.md) este încheiat: baza locală are checkpoint 12, identitățile reparate și copia exactă Meilisearch. Artefactele sunt private, distincte de dumpul public pentru coleg. Etichetele CPV sunt publicate în `1d72085`.

## Ordinea de citire

| Scop | Document |
|---|---|
| Reguli de lucru | [AGENTS.md](../../AGENTS.md) |
| Deciziile proprietarului și contextul | [Predarea integrală](20261011/README.md) |
| Funcționalități, UX și cod | [Produs și implementare](20261011/product-and-code.md) |
| Identități, sume, versiuni, surse | [Date și calcule](20261011/data-and-calculations.md) |
| Crawl, proxy-uri, PDF/OCR, calendar, deploy | [Operare actualizată](20261011/operations.md) |
| Istoric și documentație pe funcționalități | [Index tematic](20261011/history-and-reference-map.md) |
| Lucru nepublicat și pașii următori | [Stare și continuare](20261011/status-and-continuation.md) |
| Planul de clarificare a grupurilor excluse | [Checkpoint 12 octombrie: motive, dovezi și pași de reluare](continuation-20261012-contract-ambiguities.md) |
| Primul lot de clarificări, aplicat local | [275 grupuri rezolvate; 997/484 rămase și dovezi suplimentare](../implementation/contract-reporting-integrity-20261011/AMBIGUITIES-20261012.md) |
| Pornire locală, cont nou, teste | [Dezvoltare](03-development.md) |
| Dump public, restore și stick | [Transfer](04-database-transfer.md), [manifest/stare](TRANSFER-STATUS.md) |
| Prompt pentru alt LLM | [MODEL-START.md](MODEL-START.md) |
| Principii și identitate vizuală | [PRODUCT.md](../../PRODUCT.md), [DESIGN.md](../../DESIGN.md) |

Documentele originale [01](01-product.md), [02](02-architecture.md), [05](05-operations.md) și [06](06-status-and-roadmap.md) păstrează detalii și istoricul etapelor. Consolidarea din 11 octombrie are prioritate pentru politicile care au evoluat: pool-ul de documente, ora 02:00, formatele mari, colectarea continuă și starea reparațiilor.

## Starea la predare

- Repository: `git@github.com:Alex-Cosma/seap-new.git`; aplicație: `https://cinecastiga.ro`.
- Ultima publicare de cod documentată: `5488af2`, download automat strict pentru caiete de sarcini; CI/deploy `38157671237` trecute. `d16d866` este commitul documentar de pe care începe lucrarea curentă. Verifică runtime-ul serverului pentru starea de acum.
- Lucrarea curentă: **`fix/contract-reporting-integrity-20261011`**, necomisă/nepublicată la redactare. [Raport și verificări](../implementation/contract-reporting-integrity-20261011/README.md).
- Preflight-ul pe copia publicațiilor repetate a verificat 75.974 de grupuri candidate noi. **748 de grupuri aveau posibil impact financiar în regula veche**; nu sunt dubluri dovedite. La 12 octombrie proprietarul a ales excluderea temporară explicită și separarea tuturor plafoanelor. Vezi [implementarea și verificările](../implementation/contract-reporting-integrity-20261011/POLICY-20261012.md); producția nu a fost modificată de această intervenție.
- Baza locală obișnuită, dump-ul public din 30 septembrie și producția sunt snapshot-uri diferite. Bazele noi `seap_test_currency_*_20261011` sunt exclusiv pentru validarea reparației.
- La citirea din 11 octombrie, aproximativ 22:25 RO, site-ul era live, procesarea `full/ready/complete`; colectarea avea un blocaj de transport separat. Nu s-a intervenit asupra lui.

## După un clone

Primești codul și documentația, **nu baza și secretele**. Pentru date reale cere separat pachetul public, verifică manifestul/hash-ul, restaurează într-o bază nouă și creează un cont local nou. Ghidurile descriu procedura verificată; bootstrap-ul de la o bază complet goală nu este încă standardizat.

Nu porni colectorul, worker-ul de documente sau scheduler-ul doar pentru a vedea interfața. Nu copia conturi/sesiuni/proxy-uri din producție. Nu reexecuta scripturile datate din `scripts/operations/` ca pași de instalare.

## Documente care se contrazic

Prioritate: instrucțiunea actuală și mediul verificat → cod/migrații/manifest → consolidarea și ultimul raport de finalizare → planurile și cronologia istorică. „Implementat”, „testat pe copie”, „deploy-at” și „aplicat/publicat” sunt stări distincte. Un procent al cozii nu certifică întregul SEAP; un test sărit nu este un test trecut.
