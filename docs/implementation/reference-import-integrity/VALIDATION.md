# Validarea lotului ONRC / MF — 4 octombrie 2026

## Medii și verificări

- Branch `fix/reference-import-integrity`; fără commit/push/deploy pentru acest lot.
- Copie publică izolată: `seap_test_references_20261004`; schema reală și istoricul
  de migrări copiate din baza locală. Numai referințe, entități și profiluri.
- Fixtures cu rollback: `seap_test_references_guards`, schema și istoricul real.
- 185 teste unitare ingestion trecute; 6 teste DB de protecție trecute, inclusiv
  rollback comun ONRC/MF, idempotentă, homonime, duplicate, zero vs NULL,
  versiune exactă, spec absent și păstrarea unei sume peste precizia Number.
- Typecheck ingestion și `git diff --check` trecute.
- Toate cele 112 specificații MF locale verificate: indicatorii profit/pierdere
  recunoscuți există în antetele TXT. Față de parserul anterior: 67 mapări de
  profit recuperate; zero diferențe în mapările celorlalte câmpuri.
- Zero cereri către SEAP / ONRC / MF. Baza locală a aplicației și producția
  nu au fost modificate.

## Execuție pe datele reale — aplicată pe copie

[Raport complet](local-result.json), inclusiv SHA-256 pentru ONRC și cele 54
fișiere MF eligibile. Tranzacția comună a făcut COMMIT în 1.234,647 secunde
(20 min 35 sec). Durata nu include recalcularea semnalelor sau a radiografiei.

| Indicator | Înainte | După |
|---|---:|---:|
| Rânduri ONRC | 3.679.178 | 3.679.178 |
| Rânduri ONRC cu dată de naștere | 2.087.408 | 3.206.578 |
| Rânduri fără dată, pentru CUI din profiluri de furnizor | 77.571 | 6.741 |
| Chei de persoană prezente la mai mulți furnizori | 2.645 | 7.901 |
| Date calendaristice în afara intervalului de control | 418 | 420 |

Recuperate: **1.119.170 de date ONRC** și **5.399.344 de profituri nete MF**.
Dintre profituri, 2.370.044 sunt zero declarat; restul sunt valori nenule.
611.934 de bilanțuri aparțin CUI-urilor din profilurile de furnizor. Pentru UU
2025: 840.798 valori recuperate, dintre care 88.231 bilanțuri de furnizori.
Celelalte câmpuri financiare au trecut comparația exactă cu sursa. Rândurile MF
nu sunt create/șterse de reparație.

Cohorta de impact folosește CUI distinct din `marts.entity_profile` cu rol
`supplier`, fără filtru suplimentar de an/activitate și cu toate calitățile
reprezentanților. Auditul inițial filtra `calitate ILIKE '%administrator%'`,
de unde diferența față de numărătoarea sa de 71.371 rânduri fără dată.
Cele 7.901 chei comune **nu sunt 7.901
semnale de risc**; regulile de cheltuieli nu au fost recalculate aici. Datele
neobișnuite și persoanele fără dată rămân cazuri de verificat, fără completări
inventate. Reprezentanții ONRC nu sunt automat toți administratori.

[Verificări după aplicare](postchecks.json) compară separat baza locală a
aplicației, rămasă neschimbată, cu copia reparată. Cazul MF CUI30976819/2025
recuperează profitul de 999.104 lei din sursă.

Prima tentativă a verificat ONRC, apoi a anulat întreaga tranzacție când lipsea
o specificație MF. Acum sursele/specurile absente și categoriile fără indicator
explicit sunt raportate în `skipped`, fără presupuneri. Metadatele pentru
mapările neatinse sunt păstrate; ambiguitățile lor sunt documentate separat.

## Rerulare fără modificări — confirmată

[Rerularea completă](local-idempotence.json) a făcut COMMIT în 324.161
secunde și a raportat **zero modificări ONRC și zero modificări MF**. Numărările
ONRC înainte/după sunt identice cu starea finală din prima aplicare. Manifestele
SHA-256 ale tuturor surselor sunt identice între rulări. Impactul MF este gol.

Nicio operațiune de reparație nu mai rulează. Poate continua autovacuumul normal
al PostgreSQL pe copia izolată după actualizarea masivă; nu este crawler sau
procesare a aplicației. Producția, baza locală principală, statisticile și
semnalele publicate nu au fost schimbate de acest lot.
