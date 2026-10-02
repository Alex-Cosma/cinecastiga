# Etichete CPV în Explorează

Implementare locală, 1 octombrie 2026. Filtrul de domeniu din `/intreaba` afișează denumirea română din catalog în fața codului: `Domeniu: Lucrări de construcţii · CPV 45`. Selectorul prezintă de asemenea denumirea înaintea codului. Textele introduse liber rămân neschimbate, cu prefixul `Domeniu:`.

Linkurile existente și întrebările salvate nu au nevoie de migrare: componenta rezolvă separat codul prin `GET /api/cpv/label?code=45`, fără să aștepte răspunsul interogării și fără trafic SEAP. Endpointul citește doar nodul corespunzător din `core.cpv_codes`, completând prefixele cu zerouri; nu atribuie numele unui copil arbitrar. Dacă denumirea lipsește sau cererea eșuează, filtrul rămâne utilizabil ca `Domeniu: CPV 45`. Alegerea din selector păstrează imediat denumirea disponibilă, iar schimbările rapide anulează cererile vechi.

Specificația, salvarea întrebării și selecția contractelor nu se modifică. Eticheta nu schimbă includerea subdomeniilor.

Validare locală: TypeScript, teste pentru endpoint și verificare în browser la desktop/mobil. Răspunsul statistic este omis în verificarea vizuală pentru a nu lansa interogări greoaie; catalogul CPV este citit din baza locală reală.
