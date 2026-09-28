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

**Lansat și verificat în producție.** Commit aplicație `88b345c90d546ebdfa253cd0a3bb6bbc522aebe0`, împins pe `main` și `work/topic-search`. [Actions 36448008465](https://github.com/Alex-Cosma/seap-new/actions/runs/36448008465): CI și deploy încheiate cu succes. Checkout-ul serverului corespunde commitului și nu are modificări nesalvate.

Verificare de producție din 28 septembrie, circa 19:20 ora României:

- Indexarea inițială este terminată: `built_at=2026-09-28T16:11:27.939948Z` (19:11:27 RO), **20.566.353 achiziții** în proiecție și **985.079 cu titlu disponibil**. Toți cei 7 indecși sunt `indisvalid=true/indisready=true`; nu mai există proces de indexare sau construire de index activ.
- Cele 41 de migrații, inclusiv 0039/0040, sunt aplicate. Web și PostgreSQL sunt healthy; workerii documente/colectare sunt porniți.
- Health200 (`ok:true`), sesiune anonimă200, API admin403 pentru vizitator anonim. Nu s-au folosit conturi private pentru verificare.
- Browser Chrome pe domeniul public: radiografie200, zoom1,6×/reset, matrice cu3contracte și link relativ `/contracte/1045996` în tab nou, VALURO7surse/532.200,00lei, mobile390 fără overflow, căutare200, **zero erori JavaScript**.
- Căutarea `iluminat`, categoria achiziții, returnează **2.015 rezultate**, 10 în prima pagină. Confirmare în browser și API.
- Controlul operațional rămâne rev14, paused=false, maintenance=false, fără blocked_reason,50–70sec, zilnic05:00/risc duminică. Ultimele3cereri de colectare inspectate (2028–2030) au HTTP200/success. Nu s-a solicitat trafic SEAP suplimentar pentru testarea interfeței.

**Acoperirea producției diferă de cea locală.** Proiecția păstrează toate achizițiile eligibile, dar numai985.079au titlu căutabil, față de16.068.616în copia locală mai bogată în arhiva brută. Nu este o indexare încă în curs; este limita titlurilor disponibile în datele sursă prezente pe server. În exemplul VALURO, drawerul poate afișa denumirea CPV când titlul original nu există în arhiva producției; sursele și valorile exacte rămân accesibile. Completarea arhivei istorice este o operațiune separată, neexecutată în acest release.

Documentarea rezultatului este un commit ulterior exclusiv Markdown, cu `[skip ci]`; nu declanșează încă un deploy al aceleiași aplicații.
