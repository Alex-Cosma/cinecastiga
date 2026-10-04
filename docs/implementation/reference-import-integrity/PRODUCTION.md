# Aplicare ONRC/MF în producție — 4 octombrie 2026

Proprietarul a autorizat explicit aplicarea **imediată, cu mentenanță acum**.
Acest document descrie intervenția curentă; nu autorizează relansări viitoare.
Starea finală trebuie verificată în baza de date și consemnată după publicare.

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

## Stare

Sursele sunt transferate și verificate. Deploy-ul și aplicarea sunt în pregătire;
nu considera această notă drept confirmare a redeschiderii sau a unei reparații live.
