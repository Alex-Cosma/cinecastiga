# Release 28 septembrie 2026 — Radiografie B și căutare de subiecte

Utilizatorul a autorizat explicit commit, push și deploy. Release-ul include căutarea 5B din `76938d1`, paginarea semnalului de fracționare pe profil, Radiografie B, mockupurile de referință și documentația. Datele mockupului CNAIR sunt publice; dumpuri, secrete și sesiuni nu sunt incluse.

## Pregătire verificată

- `pnpm turbo typecheck lint test build`: 20/20 sarcini reușite; 411 teste unitare trecute în workspace, 120 teste de integrare web omise deoarece această rulare nu primește baze fixture. Integrarea PostgreSQL pentru căutare fusese verificată separat pe baza izolată, conform documentului 5B.
- Testele host deploy/noapte: 13/13, inclusiv ordine migrare → index → restart și păstrarea aplicației vechi dacă indexarea eșuează.
- Verificările vizuale și de interacțiune locale sunt în documentul radiografiei; la publicare verificăm și datele producției, care diferă de copia locală.
- Înainte de deploy: serverul rula `332e577`, fără modificări locale, health/container DB funcționale, circa 848GB liberi. Procesarea din 28 septembrie era `ready/complete`; control rev14, nepausat, fără mentenanță/blocaj, 50–70 secunde, zilnic05:00/risc duminică.

## Migrare și pregătirea căutării

0039/0040 creează proiecția titlurilor și metadatele ei. Deploy-ul rulează `index-topics --if-missing` după migrare și înainte de înlocuirea webului. Comanda construiește doar din arhiva publică deja locală serverului, în tranzacția atomică existentă; verifică reconcilierea numărului de achiziții înainte de publicare. Nu pornește preluări SEAP sau calcul de risc. Aplicația veche rămâne disponibilă în timpul pregătirii. Următoarele deployuri păstrează indexul; etapa nocturnă search îl reconstruiește.

Pentru prima lansare, launcherul deploy trebuie actualizat pe server înainte de trigger: un proces bash început din versiunea veche nu poate fi presupus că va reciti propriul script după git reset. Actualizarea este limitată la fișierul deploy.sh, sub lockul comun și după confirmarea că acesta corespunde versiunii comise pe server. Checkout-ul complet va fi sincronizat de deploy.

## Stare

Commit/push și rularea CI/deploy sunt în curs; această secțiune va fi completată cu hash-ul, rularea Actions și verificările de producție. Nu folosi acest status intermediar drept confirmare de lansare.
