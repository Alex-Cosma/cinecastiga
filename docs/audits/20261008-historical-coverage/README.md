# Verificare istorică țintită — 8 octombrie 2026

**Rezultat:** SEAP returnează 115 anunțuri de atribuire pentru 21 aprilie 2022; toți cei 115 identificatori lipsesc din inventarul de anunțuri și din arhivele verificate, atât local, cât și în producție. Au fost necesare **două cereri SEAP**, nu o recolectare a istoricului.

Proprietarul a cerut păstrarea priorității colectării curente, întrebând ce verificări putem face în paralel. Am făcut auditul ușor al jurnalelor local, două cereri prin poarta comună de colectare din producție și comparații indexate pentru cei 115 identificatori. **Nu am modificat coada, setările, mentenanța, datele core/raw sau programul procesării. Recuperarea acestei zile NU este programată și NU a început.** Lista este păstrată pentru după recuperarea curentă.

## Ce demonstrează jurnalele locale

Pentru cele 2.922 de zile din 2018–2025:

- Participare: fiecare zi are cel puțin o rulare `completed`.
- Atribuiri: 2.921 de zile au o rulare `completed`; excepția este 21 aprilie 2022.
- Rularea 4496, începută la 18 iulie 2026, 15:39:16 UTC, a rămas `running`, fără finalizare și fără contoare finale completate. Rularea următoare pentru atribuiri începe la 15:43:20 UTC și vizează 20 aprilie 2022.
- Nu există arhive SEAP în intervalul dintre începutul rulării 4496 și începutul următoarei rulări, în copia locală verificată.
- Singura abatere nenulă dintr-o rulare `completed` a atribuirilor viza 14 ianuarie 2020; există și alte rulări încheiate pentru acea zi, cu 273 raportate / 273 preluate. O eroare istorică nu este automat un gol rămas.

Acest audit folosește copia locală cu observații de acoperire calculate la 2 octombrie. Confirmarea celor 115 ID-uri a fost făcută separat și pe producție. Metadatele vechi ale rulărilor au ferestre construite cu offset fix +03:00; query-ul recuperează data cerută din acea convenție. **Nu folosește `state_date` ca înlocuitor al datei publicării.**

## Verificarea zilei suspecte

POST `/api-pub/NoticeCommon/GetCANoticeList/`:

- `sysNoticeTypeIds`: `[3,13,18,16,8,20]`;
- `startPublicationDate` și `endPublicationDate`: `2022-04-21`;
- `pageSize=100`, `pageIndex=0` și apoi `1`;
- aceleași filtre canonice ca în clientul aplicației, fără alte restricții.

Ambele răspunsuri: HTTP 200, `total=115`, `searchTooLong=false`. Pagini cu 100 și 15 rânduri, 115 ID-uri distincte, fără suprapunere. Jurnalul poartă contextul `historical-coverage-20261008`; toate cererile au respectat bugetul comun, proxy-urile și blocajele existente. Fără retry automat sau descărcări de documente.

Comparație identică, local/producție, numai după identificatorii SEAP:

| Verificare | Prezente din 115 |
|---|---:|
| `core.awards.ca_notice_id` | 0 |
| Anunțuri cu contracte legate prin `core.contracts.ca_notice_id` | 0 |
| Arhivă `award-list:v1`, cheia `award:<ID>` | 0 |
| Arhivă `award-contracts:v1`, cheia `award:<ID>` | 0 |

**Sunt 115 anunțuri, nu 115 contracte.** Numărul contractelor și eventuala corespondență cu alte publicări/TED nu au fost verificate. Aceste rezultate nu demonstrează absența economică a acelorași achiziții din orice alt flux.

## Dovezi și continuare

- [Inventar complet, cererile din jurnal și hash-urile răspunsurilor](day-20220421-evidence.json).
- [Auditul jurnalelor, read-only](log-coverage.sql).
- [Comparația celor 115 ID-uri, read-only](compare-day.sql).
- Răspunsurile complete sunt păstrate local în `.local/history-coverage-20261008/`, ignorat de Git. Copii temporare există în containerul colectorului; nu sunt servicii sau joburi programate. Manifestul păstrează SHA-256.

După recuperarea curentă: adăugăm o recuperare țintită a zilei, cu paginile de listă, contractele și graful de detalii, deduplicare și evidență proprie. Nu completa manual statusul rulării istorice și nu presupune că cele 115 anunțuri sunt deja reparate fiindcă au fost identificate.

**Limite:** o rulare `completed` nu certifică singură toate paginile, tipurile sau detaliile. Acesta este un control rapid al jurnalelor și al unei zile, nu un audit complet al istoricului. Auditul extins al achizițiilor directe, al inventarelor de contracte și al documentelor rămâne ulterior. Lipsa unei arhive brute pentru un import istoric nu dovedește automat lipsa datelor normalizate.
