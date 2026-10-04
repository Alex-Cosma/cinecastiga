# Aplicare ONRC/MF în producție — 4 octombrie 2026

Proprietarul a autorizat explicit aplicarea **imediată, cu mentenanță acum**.
Acest document descrie intervenția curentă; nu autorizează relansări viitoare.
**Intervenția este încheiată:** site redeschis la 11:30:31 RO, checkpoint 15 ready.
[Raportul final verificat](production-completion.json) are prioritate față de notele intermediare.

## Preflight

- Host `cinecastiga`, checkout `/srv/seap/src`.
- Înainte de intervenție: runtime `63981c6`, 53 migrări, checkpoint14 ready;
  rularea programată din4 octombrie este încheiată. Reparațiile monetară și de
  identitate sunt `completed` și nu se repetă.
- Control: revision34, fără mentenanță/pauză/blocaj; intervalul existent30–45s
  este păstrat. Procesare zilnică05:00, risc duminică.
- ONRC live:3.679.178 rânduri,2.087.408 date, snapshot2026-07-08.
  MF live:7.186.912 rânduri,1.293.489 profituri nenule. Corespund copiei testate.
- Bundle local transferat în `/srv/seap/repairs/reference-import-v1`, montat
  read-only la `/repairs/reference-import-v1` în processor.54 fișiere MF cu
  specificații + snapshotONRC;862MiB dezarhivat. Hashurile sunt în
  [manifestul transferului](production-bundle.json). Datele brute nu sunt în Git.

## Procedură

1. Deploy al parserelor și operațiunii unice; migrarea0053 introduce tipul
   rulării (`scheduled`/`manual`). Unicitatea zilei rămâne obligatorie pentru
   cron. O intervenție manuală are propriul UUID și nu rescrie istoricul zilei.
2. Verifică bundle-ul în imaginea nouă cu `verifyReferenceBundle`. Activarea în
   `app.data_repairs` este explicită, `id=reference-import-v1`, data curentă RO,
   status`scheduled`, configurație cu directorul montat și SHA-256 al manifestului.
3. Numai după această activare, operatorul lansează:

   ```sh
   /bin/bash /srv/seap/src/infra/prod/process-nightly.sh --reference-repair-now
   ```

4. Runnerul obișnuit ia lockul comun cu deploy-ul, revendică o rulare manuală
   `full`, activează mentenanța, drenează lucrările și oprește workerii, apoi
   creează/verifică backupul complet privat.
5. După backup: verificarea hashurilor → MF + ONRC într-o tranzacție → marcaj
   `applied`. Manifestul MF efectiv trebuie să corespundă exact celui testat.
   Erorile anulează tranzacția și marchează `failed`; nu există retry automat.
6. Pipeline complet: normalizare, verificări, statistici, risc, Radiografie,
   acoperire, validare și căutare. Redeschidere numai după checkpointready,
   verificarea Meili și verificarea revisionului controlului. Abia atunci
   reparația devine `completed` și colectarea poate fi reluată.

La eșec se păstrează mentenanța și se inspectează etapa, backupul și checkpointul.
Nu reporni pur și simplu scriptul: un marcaj `applied`/`failed` cere recuperare
explicită. Nu șterge rândul rulării automate de dimineață.

## Prevenție și limite

- Importurile online viitoare folosesc parser-ele comune corectate. ONRC este
  atomic; MF respectă specificația categoriei și păstrează zero versus NULL.
  Importul MF raportează indicatorul recunoscut și numărul valorilor importate.
- Hookul istoric returnează imediat după `completed`; reparația nu devine o
  operațiune repetată săptămânal. Cronul rămâne zilnic/statistici și duminică/risc.
- Nu s-au adăugat descărcări periodice noi ONRC/MF sau cereri SEAP. Corecția
  parserelor se aplică la următoarele importuri efectuate prin CLI-urile existente.
- Teste:185 unitare ingestion,8 unitare DB,11 teste DB pentru orchestrare,
  4 teste DB pentru noul hook,6 teste DB pentru reparația efectivă și teste host.
  Mecanica reală a reparației a fost aplicată și rerulată pe copia mare, cu zero
  modificări la rerulare. Migrarea47→54 verificată pe baza izolată cu istoricul real.

## Rezultat final verificat

- Runtime al intervenției: `2e8757147ed8538657f8b83e2388ff256ab06d1f`;
  CI și deploy Actions `37181807983` reușite, **54 migrări**.
- Rulare manuală `96c15b43-6ad8-4d41-a94d-16b9c160e114`, `full`, `ready`.
  **4 octombrie, 09:14:45–11:30:31 RO: 2 h 15 min 46 s.**
- Checkpoint **15**, `e42f6743-0d03-431c-870e-c79870df1b8f`, `ready`;
  toate cele **13 verificări** trecute. Risc recalculat, căutare verificată:
  20.590.561 înregistrări pentru titluri, 181.096 documente în indexul entităților.
- `reference-import-v1=completed`. Reparațiile monetară și de identitate au
  păstrat rularea programată de dimineață și nu au fost reaplicate.
- Control revision36: `maintenance=false`, `paused=false`, fără blocaj de sursă.
  **30–45 secunde**, procesare zilnică **05:00**, risc **duminică**: neschimbate.
  Cererile10955–10957 au încheiat cu succes după reluarea colectării.
- Web/PostgreSQL/Meilisearch sănătoase, collection/documents pornite.
  HTTP200 verificat pentru health, homepage, `/intreaba`, `/semnale`, furnizorul
  `/entitati/2082932` și `/entitati/2146146/radiografie`.

[Raportul intermediar al reparației](production-applied.json) surprinde momentul
`applied`, înainte de recalculare; **nu este starea curentă**.
[Raportul final](production-completion.json) include checkpointul, numărările,
verificările, timpii și reluarea colectării. Nu conține nume sau date de naștere.

### Date reparate și verificare independentă

| Indicator | Înainte | După |
|---|---:|---:|
| Rânduri ONRC | 3.679.178 | 3.679.178 |
| Rânduri ONRC cu dată de naștere | 2.087.408 | 3.206.578 |
| Rânduri MF | 7.186.912 | 7.186.912 |
| Rânduri MF cu profit net completat | 1.293.489 | 6.692.833 |

Recuperate **1.119.170 de date ONRC** și **5.399.344 de profituri MF**,
identic simulării locale. Dintre profituri, 2.370.044 sunt zero declarat.
54 grupuri MF eligibile verificate și valorile lipsă reparate; 54 grupuri fără sursă/specificație sigură în
bundle rămân neschimbate și sunt listate explicit în raport. Nu prezenta lotul
ca validare a tuturor indicatorilor financiari sau a tuturor categoriilor.

Scriptul read-only `scripts/operations/verify-reference-repair-20261004.sql`
a trecut după redeschidere: numărări exacte, toate cele trei indexuri ONRC
valide, reparație completed, rulare ready, checkpoint verificat și căutare
verificată. Exemplul MF CUI30976819/an2025 are profit **999.104 lei**;
identificatorul paginii este2082932, nu CUI-ul.

În cohorta de furnizori live: 77.595→6.741 rânduri ONRC fără dată,
2.646→7.903 chei comune între furnizori. Diferențele față de copia locală
provin din cohorta mai recentă. Cele420 de date calendaristice neobișnuite
rămân cazuri de audit, fără corecții inventate.

Instanțele `net_shared_admin` au crescut de la9.291 la30.770; sunt semnale
pentru verificare, nu persoane, firme distincte sau dovezi de nereguli.
Celelalte categorii sunt identice cu checkpoint14, cu excepția `da_rapid`
(+182) și `da_dependence` (−1); între rulări au fost publicate și794 de
achiziții directe suplimentare. Variațiile nu sunt atribuite automat
reparației ONRC/MF. Raportul păstrează vectorii de numărări înainte/după.

### Backup și durate

Backupul privat de **5.688.218.630 bytes** este în
`/srv/seap/backups/processing/96c15b43-6ad8-4d41-a94d-16b9c160e114/`, alături de
`run.log`, lista arhivei și SHA-256. Verificarea a inclus `pg_restore --list`
și calculul checksumului; nu pretinde un restore integral nou al acestui backup.
SHA-256: `6c9f71dfecf3ce7359ef44e0fd540ded2a1ff0f2172e0b73415fdbd33d3d0fdf`.

| Etapă | Durată |
|---|---:|
| Backup și verificare | 15 min 56 s |
| Reparație ONRC/MF | 7 min 40 s |
| Semnale de risc | 62 min 34 s |
| Tabele de tranzacții | 12 min 57 s |
| Radiografie | 10 min 16 s |
| Validare | 1 min 1 s |
| Căutare | 5 min 58 s |

Restul timpului aparține normalizării, asocierilor TED–SEAP, tabelelor
statistice și repornirii. Etapele exacte sunt păstrate în raport.

Activarea `scripts/operations/activate-reference-repair-20261004.sql` a fost
executată o singură dată. **Nu relansa operațiunea și nu șterge markerul.**
Importurile viitoare folosesc parser-ele corectate; hookul istoric face noop
după completed. Baza locală obișnuită nu a fost actualizată de această intervenție.
