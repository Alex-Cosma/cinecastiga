# Școala 311 — dosar de documentare, 2 octombrie 2026

Versiunea lizibilă este implementată local la `/ce-bate-la-ochi/poveste/scoala-311-sapte-achizitii`, cu status `preview`. Este o analiză din surse publice și o pistă de continuat, nu o investigație care dovedește o ilegalitate. Nu au fost trimise solicitări, făcute interviuri sau verificări pe teren. Nu a fost publicată în producție.

## Ce s-a verificat

Copia locală provine din exportul producției din 2 octombrie 2026, checkpoint 12. Căutarea a început cu septembrie 2026: achiziții directe acceptate, grupuri instituție–furnizor cu cel puțin trei înregistrări și contracte mari recente. Baza are date până la 25 septembrie, dar recuperarea recentă este parțială; nu se poate construi un clasament exhaustiv sau afirma că selecția reprezintă toate cheltuielile unei instituții.

Pistele Jucu/proiectare și Creative People/consultanță aveau obiecte de proiect diferite. Nu am tratat suma achizițiilor distincte drept dovadă de divizare nelegală. Pista Școala 311 a fost aleasă pentru grupul compact din 1 septembrie, serviciile denumite apropiat și contextul documentat al funcționării bazinului.

Au fost citite numai tabele publice `core`, `raw`, `marts`, `reference`, în sesiuni PostgreSQL cu `default_transaction_read_only=on`. Nicio migrare, recalculare, scriere în DB sau operațiune pe producție. **Zero cereri către SEAP.** Căutări web și citiri ale unor documente oficiale de pe alte domenii.

## Dovezi și reproducere

- [selection.sql](selection.sql): tranzacție read-only, reproductibilă pe snapshot-ul local. Citește exact opt achiziții și răspunsurile SEAP arhivate.
- [seap-records.json](seap-records.json): numai informații publice, identități, zecimale ca șir, stări, date, coduri CPV și payloadurile originale din arhivă. Nicio informație din conturi, anchete private sau cozi.
- [SHA256SUMS](SHA256SUMS): hash-ul fișierului exportat. `sourceContentHash` este hash-ul înregistrat de colector, nu hash-ul textului JSON reformatat în acest export.
- `apps/web/lib/stories/scoala311.ts`: articol și fișe documentate. Nouă teste includ verificarea fiecărei fișe față de exportul de mai sus și excluderea achiziției de context din total.

Cele opt răspunsuri sunt `da-list:v1`, colectate la 2026-10-01 22:48:06.687761 UTC = **2 octombrie 2026, 01:48:06, ora României**. Ele nu sunt contractele semnate. Nu cuprind cantitățile de ore, durata, facturile sau recepțiile.

| Afirmație / calcul | Dovadă și limită |
| --- | --- |
| Șapte achiziții BNC, 919.661,16 lei | `DA41081778`, `DA41081788`, `DA41081898`, `DA41081882`, `DA41081842`, `DA41081815`, `DA41081801`; toate acceptate, identități unice, `closingValue`; nu plăți |
| 511.594,44 lei pentru cele trei poziții cu instructori/antrenor | DA41081898 + DA41081882 + DA41081842; nu tarif pe oră, nu dovadă de suprapunere |
| 96.298,96 lei, manager + administrare | DA41081815 + DA41081801; atribuțiile nu sunt disponibile |
| 99 secunde | Ultima minus prima finalizare: 08:30:56 − 08:29:17, 1 septembrie. Publicări 07:44:16–08:10:51. Nu este durata evaluării |
| Patru titluri menționează explicit înot/bazin | DA41081882, DA41081842, DA41081815, DA41081801. Curățenia/recepția au titluri generale; nu atribuim automat toate sumele bazinului |
| Există alt furnizor de înot | DA41159391 / SICAP 122981545, AQUANELL, 22.950 lei, 10 septembrie; exclusă din totalul de 919.661,16 lei |
| Identitate instituție/furnizor | CUI școală 32167245, BNC 30976819, AQUANELL 35518022; confruntate cu payload, nu doar cu numele |

## Documentele externe folosite

1. [HCL Sector 6 nr. 181/04.09.2025](https://primarie6.ro/primarie_sector6/sites/default/files/2025-09/181-2025%20hotarare%20bazin%20scoala%20311.pdf), actul adoptat, nu proiectul nr. 170. Art. 1–3, 4. Finanțare din venituri proprii și abrogarea aranjamentului din martie; nu dovedește situația veniturilor din 2026.
2. [Procesul-verbal din 4 septembrie 2025](https://www.primarie6.ro/primarie_sector6/sites/default/files/2025-10/16proces%20verbal%20Sedinta_Ordinara%2004.09.2025.pdf#page=9), **p. 9–10**. Paul Cristian Moldovan explică gestionarea de către școală. Estimarea privind autosusținerea la capacitate maximă este a **Adrianei Tran**, nu a consilierei Mihaela Ștefan care vorbește înaintea ei. Atribuirea a fost confruntată cu schimbarea vorbitorului la p. 10.
3. [Comunicatul Primăriei Sectorului 6, 15 ianuarie 2026](https://www.primarie6.ro/primarie_sector6/copiii-asteptati-cele-mai-bune-conditii-la-bazinul-scolii-311-cum-te-poti-inscrie-la-cursuri). Anunță locuri gratuite și reguli; nu certifică participarea efectivă.

Consultate la 2 octombrie 2026. Linkurile și rezumatele sunt în dosarul articolului; nu afirmăm că am arhivat integral aceste pagini în aplicație. Agregatoarele comerciale au fost doar instrumente de descoperire. Completarea despre oameni verifică administratorii în fișierele ONRC originale, iar bilanțul în fișierul MF; relatarea despre proprietate este atribuită explicit Buletin de București și anului 2021. Comunicatul din martie 2025 despre DGASPC este depășit de hotărârea din septembrie: nu îl prezentăm ca situație curentă.

## Ce lipsește înaintea unui articol de investigație complet

Contractele și anexele, referatele de necesitate/estimare, ofertele consultate, perioadele și volumele, calificările personalului, deconturile, execuția veniturilor și cheltuielilor bazinului, numărul beneficiarilor și răspunsurile părților. Vezi [solicitarile-pregatite.md](solicitarile-pregatite.md).

Nu susținem că serviciile au fost fictive, că prețurile sunt supraevaluate, că atribuirea a durat 99 secunde, că toate cele șapte achiziții privesc numai bazinul, că BNC este furnizor exclusiv sau că a existat o încălcare a pragurilor. Denumirea firmei nu dovedește că nu poate presta servicii sportive. Nu sunt demonstrate relații personale/de afaceri cu decidenții școlii. Legătura de administrare BNC–M&M este documentată separat, fără a susține că dovedește o ilegalitate.

## Starea aplicației

Cele opt povești fictive au fost eliminate din catalogul aplicației și fișierul `demo.ts` a fost șters. Macheta aprobată din `mockups/ce-bate-la-ochi/` rămâne arhivă de design, nu sursă pentru aplicație. `preview` este vizibil exclusiv în development, cu marcaj și `noindex`; în producție catalogul publicat rămâne gol, inclusiv la accesarea directă a articolului și fișelor. Editorul admin rămâne ulterior, conform confirmării utilizatorului.

Verificări finale: 9 unități trecute, typecheck și build optimizat trecute; browser desktop/mobil/320px trecut, fără erori JS/overflow. Pe un server local temporar cu build de producție, atlasul este gol și adresele articolului/fișei afișează not-found fără payloadul documentării (streaming HTTP 200). Serverul temporar a fost oprit. Nicio publicare reală, commit sau push.

Toate cele opt linkuri către `/achizitii/:id` au fost deschise local și confruntate cu titlul și codul SEAP din export; destinațiile oficiale au fost verificate ca URL fără a fi accesate.

## Completare: oameni și documente de selecție

[Oameni și legături](oameni-si-legaturi.md) păstrează verificările ONRC/MF, cele două achiziții M&M, rolul documentat al directoarei Daniela Sandu, anunțul din decembrie și limitele cronologice. Articolul are acum zece fișe de achiziție: șapte în totalul principal și trei de context. Cele opt fișe inițiale rămân confruntate cu payloadurile SEAP; cele două M&M au numai date normalizate, lipsa titlurilor/payloadurilor fiind afișată. Nu inventăm obiectul lor. Regulamentul oferă o explicație a rolurilor instructor/antrenor, reflectată în text.

Au fost descoperite și două posibile erori în importurile ONRC/MF; sunt documentate, nu reparate și nu s-a relansat vreun import.

Verificare după completarea despre oameni: 10 teste editoriale trecute, typecheck trecut, parcursul browser desktop/mobil/320px trecut cu zece fișe și totalul principal neschimbat. Cele două pagini locale M&M și noua fișă a anunțului au fost verificate separat. Build-ul de producție și excluderea preview-ului fuseseră verificate în etapa anterioară; nu am repetat build-ul pentru această schimbare de conținut.
