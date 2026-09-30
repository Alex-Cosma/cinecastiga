# Handover pentru un nou dezvoltator și asistentul lui

**Continuarea sesiunii din 30 septembrie:** citește [checkpoint-ul înainte de compactare](continuation-20260930.md) pentru modificările locale nepublicate și condițiile de lansare. Fotografia de producție de mai jos este istorică.

Actualizat la **28 septembrie 2026**. Acesta este punctul de intrare pentru colaborare, nu un plan de rescriere a proiectului. Documentația descrie codul existent și deciziile utilizatorului; stările operaționale au dată și trebuie recitite înaintea unei intervenții.

## Citește în această ordine

1. [Produs, decizii și comportamente de păstrat](01-product.md).
2. [Arhitectură, date, identități și harta codului](02-architecture.md).
3. [Pornire locală, cont, teste și lucru în echipă](03-development.md).
4. [Transferul complet al datelor publice](04-database-transfer.md).
5. [Producție, colectare, publicare și recuperare](05-operations.md).
6. [Stare curentă, limite și ce urmează](06-status-and-roadmap.md).
7. [Prompt de inițializare pentru modelul colegului](MODEL-START.md).

[PRODUCT.md](../../PRODUCT.md) explică principiile produsului; [DESIGN.md](../../DESIGN.md) documentează interfața existentă. [HANDOFF.md](../../HANDOFF.md) păstrează cronologia amplă. Nu trebuie încărcate toate capturile și toate documentele istorice în contextul modelului: acest dosar oferă trasee către informațiile relevante.

## Starea de plecare

- Repository: `git@github.com:Alex-Cosma/seap-new.git`; aplicație: <https://cinecastiga.ro>.
- Codul aplicației livrat în producție: `332e577`; commit ulterior exclusiv de documentare: `b857e51`, pe `main`. Verifică `git log` pentru schimbări ulterioare.
- CI + deploy al aplicației: Actions `36397323757`, confirmat reușit. Pagina publică și health 200; paginile admin protejate.
- Ultima funcționalitate: cinci secțiuni admin cu navigare comună, progres pe fluxuri și estimări prudente ale lotului de recuperare.
- Migrații până la 0038 inclusiv;39 înregistrări în istoric la verificarea din 27 septembrie. Manifestul exportului este autoritatea pentru copia transferată.
- Colegul primește **toate datele publice disponibile în copia aleasă**, inclusiv arhiva brută existentă, datele normalizate, statisticile și documentele publice. Nu primește conturi, sesiuni, anchete, urmăriri private sau cozi active.
- **Decizia finală a proprietarului: export din baza LOCALĂ a autorului, transfer pe stick.** Include arhiva brută locală mai mare și cele două documente publice ale pilotului. Nu este identică cu producția. Manifestul local marchează sursa și checkpoint-ul; nu prezenta copia drept ultima publicare live.

## Cum se rezolvă contradicțiile din documente

Există documente scrise înaintea deploy-urilor care spun încă „local”, „pending” sau „nu face deploy”. Sunt evidențe istorice, nu starea curentă și nici interdicții perpetue. Ordinea practică:

1. Instrucțiunea actuală a proprietarului și starea verificată a mediului vizat.
2. Codul și migrațiile commit-ului folosit, plus manifestul snapshot-ului.
3. Acest handover și cele mai recente secțiuni datate din HANDOFF.
4. Documentele detaliate ale funcționalității.
5. Planurile inițiale și README-urile vechi.

Nu deduce că o funcționalitate este activă doar pentru că există cod sau un script. Nu trata o rulare locală drept verificare de producție. Nu reutiliza autorizații pentru intervenții one-off deja finalizate.

## Pachetul de predare

- Repository și acest dosar: cod, decizii, documentație și teste.
- Bundle separat: `database.dump`, `manifest.json`, `SHA256SUMS`, `archive.list`, `export.log`.
- Un cont **local nou**, creat de coleg. Chei și secrete noi, locale.
- Acces GitHub individual; acces SSH individual numai dacă rolul lui îl cere. Nu se copiază cheia SSH, `.env` sau sesiunea browserului autorului.
- Datele mari și secretele nu intră în Git. Există instrucțiuni și scripturi de export/restaurare, cu validări și destinație nouă obligatorie.

„Complet” înseamnă copia integrală a datelor publice din sursa declarată, nu certificarea că SEAP a fost colectat complet. Golurile și estimările sunt explicate în documentele de mai jos.
