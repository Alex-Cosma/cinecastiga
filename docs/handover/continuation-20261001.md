# Checkpoint înainte de compactare — 1 octombrie 2026

## De unde se reia

La salvarea inițială, cererea era păstrarea contextului. Ulterior, proprietarul a cerut consolidarea documentației pentru coleg și publicarea acestui checkpoint în repo. **Nu există o implementare sau o operațiune de producție rămasă în curs din sesiunea de lansare.** Urmează cererea actuală a proprietarului; nu reporni procedurile datate de publicare, export sau reparare TED.

La începutul salvării: branch `main`, checkout curat, HEAD `dde196a`, împins deja pe origin. Checkpointul a fost inițial doar local; acum face parte din consolidarea documentară cerută pentru commit/push cu `[skip ci]`, fără deploy. Repo-ul autorului: `~/Desktop/Personal/code/seap`; această cale nu este o cerință pentru coleg.

## Lucrări încheiate și publicate

- `07eaee8`: detalii/calendar, limbajul riscului, lookup complet pentru semnale, căutare, Explorează/surse și întrebări salvate local.
- `43c0d4a`: redesign Semnale A, feedback anonim cu inbox admin, excepție 2FA exclusiv locală, mockupuri și documentație. [CI/deploy reușit](https://github.com/Alex-Cosma/seap-new/actions/runs/36745471938).
- `f474c3e`: corecție deploy Caddy; validează configurația din checkout și recreează proxy-ul numai dacă montarea fișierului păstrează versiunea veche. [CI/deploy reușit](https://github.com/Alex-Cosma/seap-new/actions/runs/36760065306).
- `dde196a`: handover și confirmarea finală, exclusiv documentație, `[skip ci]`. Aplicația de pe server rămâne la `f474c3e`; diferența documentară este intenționată.

Autoritatea pentru probe și timpi este [raportul final al lansării](../implementation/release-20260930.md). Notele vechi „local”, „pending”, „nu publica înainte de full” sunt istorice pentru producție. Nu confunda acest lucru cu starea bazei locale.

## Ultima stare verificată a producției — 30 septembrie, seara

Nu este o verificare live din 1 octombrie. Pentru o întrebare despre noaptea următoare, recitește starea serverului.

- SSH `cinecastiga`; repo `/srv/seap/src`; Compose în `infra/prod`.
- 46 migrări; checkpoint **8**, `cf7a43f0-ee9c-47d6-ad7f-acc28f988e78`, ready. Metodologie `rf-2026.6`, calendar `Europe/Bucharest-v1`; toate cele 11 verificări trecute.
- Full: 16:41:47–18:31:50 UTC, circa **1h50m03s**. Indexarea și verificarea calendarului au terminat la 18:37:50 UTC, total **1h56m03s** fără backup/deploy. Lookup: 2.421.937 semnale, zero diferențe; căutare: 20.585.533 achiziții și 194.702 entități.
- Redeschis la **21:38:18 ora României**. Control rev22, fără pauză, mentenanță sau blocare. Prima cerere reluată 4937 a reușit; ultimele verificate 4939–4941 au reușit și ele.
- Web/PostgreSQL/Meili sănătoase, collection/documents pornite. Health și paginile publice 200; API-urile admin 403 anonim. Configurația activă Caddy confirmă `X-Feedback-Client-IP` și `CF-Connecting-IP`.
- Program păstrat: date/statistici zilnic la 05:00 RO, risc duminică; pauză SEAP 02:59–03:30, retry timeout după 5 și 10 minute. Intervalul operatorului observat la această lansare era **40–60s**, diferit de valoarea istorică 50–70s; nu l-am modificat.
- Tranziția calendarului este încheiată: **următorul deploy obișnuit nu cere repetarea full-ului**. Nu mai există un publish de monitorizat sau o redeschidere de executat.
- Backupul privat și rapoartele operaționale sunt în `/srv/seap/backups/calendar-release-20260930/`. Nu se șterg și nu se includ în transferul public. Scripturile `scripts/operations/calendar-release-20260930.*` sunt incidente istorice, nu instrucțiuni de onboarding.

## Dumpul local pentru coleg — gata

[TRANSFER-STATUS.md](TRANSFER-STATUS.md) păstrează manifestul, probele și limitele verificării.

- Director: `infra/prod/dumps/handover-local-20260930`.
- Dump: **9.411.824.015 bytes**, SHA-256 `ace1825d9428197d0678b46bc4dd1ba3705ae07b3152b36d85feb2ce3ea26bef`.
- Include datele publice complete din baza LOCALĂ, cod și handover. Exclude conturi, sesiuni, 2FA, feedback privat, anchete, urmăriri și cozi active. Colegul creează un cont local nou.
- Verificări încheiate: citire/decompresie integrală; restore de structură și date selective într-o bază nouă; 46 migrări, 9.454 coduri CPV, tabele private goale; fixture eliminat. **Nu s-a făcut un al doilea restore integral de 64 GiB.**
- Snapshotul de cod are 1.414 fișiere; toate cele 26 checksumuri ale pachetului au trecut. Nu conține `.env`, chei, `.git`, dependențe instalate sau dumpul în arhiva codului.
- **Pachet sigilat: nu îl regenera/modifica.** Utilizatorul poate fi deja în curs de copiere. Documentația din el este snapshotul de la împachetare, când publicarea era în curs; pentru încheiere se citește raportul actual din repo.
- Utilizatorului i s-a confirmat că **poate șterge `handover-local-20260928`**. Agentul nu l-a șters. Nu s-a copiat pe USB și nu s-a formatat niciun dispozitiv.
- Baza locală/exportul au baseline v1 din 19 septembrie și **nu au fost reprocesate pentru noul calendar**. Nu sunt identice cu producția. Nu pretinde că exportul le-a actualizat calculele.

## Verificări și mediu de lucru

- Lansarea: toate cele 20 taskuri workspace typecheck/lint/test/build trecute; 491 unitare. Cele 144 integrări web omise în rularea generică nu trebuie prezentate drept rulate; integrările relevante sunt consemnate separat în documentele funcționalităților.
- Corecția proxy: 20 teste host deploy/nightly trecute. Browser public după redeschidere: 16 verificări trecute, fără erori JS sau trafic SEAP/TED. Semnale are 13 tipuri, 10 rânduri/pagină, explicații inline, surse și linkuri în tab nou; CRI separat; feedback anonim; mobil fără overflow; data contractului corectată; 2FA în producție păstrat.
- Probe temporare: `/tmp/seap-release-20260930-browser.mjs`, `/tmp/seap-release-20260930-browser/`, `/tmp/seap-release-20260930-checkpoint.json`, `/tmp/seap-release-proxy-tests.log`. Acestea pot dispărea; rapoartele din repo sunt evidența durabilă.
- Dev3000 era lăsat pornit, `.next-explore-dev`, `DOCUMENTS_ENABLED=false`, polling HMR. Nu îl opri pentru o sarcină fără legătură. Excepția 2FA locală rămâne strict development/loopback; producția are doi pași.
- Node22: `~/.nvm/versions/node/v22.22.2/bin`; pnpm9.4.0 prin Corepack. Baza locală: container `seap-postgres-1`, DB/rol `seap`. Nicio parolă sau cheie în acest document.
- GitHub CLI nu era disponibil; verificarea Actions s-a făcut prin API-ul public. Cloudflare poate răspunde 403 la Python urllib fără antete, inclusiv pe health; curl și browserul au confirmat 200. Nu interpreta acel 403 ca indisponibilitatea aplicației.

## Ce urmează

Nicio sarcină nouă nu este autorizată implicit prin compactare. Backlogul este în [06-status-and-roadmap.md](06-status-and-roadmap.md); ultimele loturi marcate publicate sunt terminate. Citește cererea nouă, verifică Git și mediul relevant și continuă de acolo. Nu porni subagenți fără o cerere aplicabilă; niciun agent din arborele istoric nu este necesar pentru operațiunile încheiate.
