# Predare tehnică integrală — cinecâștigă?, 11 octombrie 2026

**Handover consolidat; reparația contractelor rămâne nepublicată.** Nu interpreta acest document ca dovadă de deploy. Pentru starea exactă a reparației curente citește [raportul de lucru](../../implementation/contract-reporting-integrity-20261011/README.md). Codul acesteia este pe `fix/contract-reporting-integrity-20261011`; producția nu a fost modificată de această intervenție.

Acest set este pentru un coleg și pentru modelul său LLM. Transmite deciziile de produs, codul relevant, limitele datelor, modul de operare și dovezile verificărilor. Nu presupune acces la conversația inițială și nu cere citirea întregului `HANDOFF.md` înainte de prima schimbare. Documentele datate vechi rămân dovezi istorice, nu instrucțiuni permanente de executat.

## Ordinea de citire

1. [AGENTS.md](../../../AGENTS.md): reguli de lucru, păstrarea modificărilor existente, teste izolate, migrații și producție.
2. [Produs și frontend](product-and-code.md): ce există, ce s-a decis și unde este codul.
3. [Date și calcule](data-and-calculations.md): identități, monede, populații, dovezi, semnale și defectele cunoscute.
4. [Colectare, documente și operare](operations.md): mecanismele actuale, programele, siguranța publicării și depanare.
5. [Dezvoltare locală](../03-development.md) și [transferul bazei](../04-database-transfer.md): pașii pentru a lucra fără trafic SEAP și fără conturile altcuiva.
6. [Reparația în curs](../../implementation/contract-reporting-integrity-20261011/README.md), apoi documentul detaliat al funcționalității asupra căreia urmează să lucrezi.
7. [Stare și continuare](status-and-continuation.md): probe, artefacte, decizii confirmate și ce nu este publicat.
8. [Evoluție și index tematic complet](history-and-reference-map.md): loturile, redesignurile, auditurile, reparațiile și lucrările parcate, cu documentele lor detaliate.

## Informația autoritativă

| Întrebare | Sursa care decide |
|---|---|
| Ce cod rulează efectiv? | Hash-ul checkout-ului și al imaginilor din producție, rezultatul CI/deploy, apoi probele HTTP/worker; nu doar commit-ul local |
| Ce date vede utilizatorul? | Ultimul `app.monitoring_refreshes` validat și run-ul de publicare asociat |
| Ce este colectat? | Cozi, inventare, arhive, acoperirea ferestrelor și normalizarea; procentul unui lot nu certifică întregul SEAP |
| Care este ritmul? | Setările live și cererile admise/terminate, nu un interval copiat dintr-un mesaj vechi |
| Ce este adevărat despre un contract? | Răspunsul arhivat, identificatorii publici, documentele și versiunea sursei; tabelele derivate sunt calcule |
| Ce este autorizat? | Sarcina și deciziile proprietarului din sesiunea curentă; existența unei chei SSH sau a unui script nu autorizează toate operațiunile |
| Ce teste au trecut? | Jurnalul comenzii efectiv rulate în mediul declarat; un test sărit nu este un test trecut |

## Deciziile esențiale ale proprietarului

- Aplicația trebuie să fie accesibilă publicului curios și suficient de riguroasă pentru jurnaliști. Identitatea vizuală actuală se păstrează.
- Fiecare rezultat trebuie să poată fi descompus în sursele exacte. Titlul din drawer deschide contractul în tab nou. Sumele contractuale nu sunt plăți.
- „Anchete” rămâne central; capturile private și versiunea lor nu se rescriu când se recalculează datele publice.
- Întrebările sunt deterministe. Funcția AI în limbaj liber rămâne dezactivată.
- Comparațiile primăriilor se bazează pe cele mai apropiate 10 populații, fără separarea artificială a comunelor/orașelor/municipiilor; CJ separat; utilizatorul își poate edita grupul.
- Utilizatorul anonim vede documentele deja arhivate. Numai utilizatorul autentificat poate declanșa o nouă preluare manuală din SEAP, cu control pe backend.
- Colectarea zilnică extinde ținta până **ieri**, de la 02:00 Europe/Bucharest. Ziua curentă nu este declarată completă.
- Pauză de admitere a cererilor SEAP 02:59–03:30. Actualizare/publicare 05:00, semnale de risc duminică 05:00. Erorile de procesare păstrează mentenanța.
- Proxy-urile împart un buget comun. Eșecul unui IP nu trebuie să oprească celelalte IP-uri sănătoase; nu există fallback automat ascuns spre IP-ul serverului.
- Documentele automate: tot istoricul, recentele întâi, **numai caiete de sarcini identificate**. Nu există fallback la toate celelalte fișiere când coada de caiete este goală. Cererile manuale rămân posibile.
- Nu impunem limita arbitrară de 10 MiB; utilizatorul vede utilizarea discului. Fișierele mari/paginile OCR se procesează reluabil; formatele necunoscute rămân declarate ca atare.
- Toate plafoanele acordurilor-cadru rămân separat de totaluri. Grupurile cu identitate incertă sunt excluse temporar, cu motive și surse vizibile în acoperire; ambele decizii confirmate la 12 octombrie.
- Pentru versiuni dovedite ale aceluiași contract, totalul folosește ultima versiune verificată o singură dată; versiunile precedente rămân vizibile.
- Exportul pentru coleg conține date publice complete din snapshot-ul ales, cu cont/secrete locale noi, fără conturi, sesiuni, anchete private sau cozi active de producție.
- „Ce bate la ochi” a fost separat pe branch-ul `feat/ce-bate-la-ochi`. Cercetările recente sunt rapoarte Markdown, nu articole publicate automat.

## Înainte de prima comandă

```sh
git status --short
git branch --show-current
git log -5 --oneline
```

Află apoi, fără a afișa parola/DSN-ul complet, numele bazei, gazda, rolul și versiunile Node/pnpm. Nu presupune că baza `seap` a colegului este ultima producție. Verifică manifestul exportului. Datele sunt mari; preferă interogări indexate și rezultate compacte. Începe orice cercetare live cu `BEGIN READ ONLY`, timeout și identificatori preciși.

În această intervenție existau deja modificări documentare necomise în `HANDOFF.md`, `docs/handover/`, documentele identităților, mockup-uri și cercetări. Nu le șterge și nu le atribui automat reparației curente.

## Livrare, fără presupuneri

O implementare este completă când codul, migrația, testele relevante și documentația se potrivesc. O reparație de date este aplicată numai după execuția și reconcilierea în baza declarată. Un deploy este verificat numai după CI, hash/runtime și probe funcționale. Păstrează separat aceste trei stări în orice raport către proprietar.
