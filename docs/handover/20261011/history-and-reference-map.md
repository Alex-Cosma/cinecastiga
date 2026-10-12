# Evoluția proiectului și traseele documentare

Acest index completează explicația tehnică. Documentele de implementare conțin deciziile, probele, limitele și uneori note succesive de publicare. Citește secțiunea finală de release înainte de a interpreta un paragraf vechi „local/pending”. Istoricul integral al mesajelor de predare rămâne în `HANDOFF.md` și [HISTORY-INDEX.md](../HISTORY-INDEX.md).

## Produsul public și criticile UX

Proiectul era deja implementat și deploy-at înaintea redesignului. Cerința inițială a fost să facă investigarea accesibilă și plăcută, păstrând funcțiile utile redacțiilor. S-au preferat machete înaintea implementărilor mari, apoi reglaje testate local, fără schimbarea arbitrară a identității vizuale.

| Etapă / decizie | Documente de citit |
|---|---|
| Întrebare editabilă, surse ușor accesibile, păstrarea celor 13 tipuri | [Indexul implementărilor](../../implementation/README.md), [produsul](../../../PRODUCT.md), `apps/web/lib/ask/` |
| Atlas CPV: treemap, indicator instant pe celule mici, click pe părinte vs săgeată de detalii | [Domains atlas](../../implementation/domains-atlas.md) |
| Explorează compact, fără text introductiv care împinge acțiunile sub ecran | [Explore compact](../../implementation/explore-compact.md) |
| Eliminarea jargonului „rețete”; salvare lângă execuție, încărcare și nume distincte pentru copii | [Release Explorează/întrebări](../../implementation/release-20260928-explore-saved-questions.md) |
| Întrebări salvate anonim în browser, fără urmăriri/anchete oferite ca acțiuni active anonimilor | [Local saved questions](../../implementation/local-saved-questions.md) |
| Căutare pe teme integrată în `/cauta`, typeahead județ/UAT, interval de ani și toți anii | [Topic search 5B](../../implementation/batch5b-topic-search-implementation.md) |
| Intenția căutării: instituție exactă vs text liber și populația corespunzătoare | [Search intent](../../implementation/search-intent.md) |
| Filtre CPV cu nume, nu o iconiță și „45” | [CPV labels](../../implementation/question-cpv-labels.md) |
| Radiografie B: furnizori cu zoom, grafice directe mai compacte, surse și comparații | [Radiografie B](../../implementation/radiografie-b-implementation.md) |
| Semnale A: reorganizare, listă compactă/paginată și detalii verificabile | [Signals redesign](../../implementation/signals-redesign.md) |
| Feedback anonim către admin, fără nume impus, ștergere individuală de admin | [Anonymous feedback](../../implementation/anonymous-feedback.md) |
| Acoperire scurtă, cu detalii progresive, fără umplerea paginii cu text | [Compact coverage](../../implementation/compact-coverage.md) |
| Drawer cu loading, surse exacte, export/anchetă/urmărire | [Answer actions](../../implementation/answer-actions.md), [verificarea dovezilor](../../implementation/evidence-verification.md) |

Auditul din perspectiva unui vizitator sceptic a cerut eliminarea limbajului care sună ca acuzație, verificarea cifrelor, clarificarea surselor/acoperirii și trasee reale fără blocaje. [Auditul Reddit](../../reviews/reddit-skeptic-20260929/report.md), [corecții punctuale](../../implementation/reddit-small-fixes-20261001.md), [limbajul riscului](../../implementation/risk-language.md), [timeout-ul semnalelor](../../implementation/signal-timeout.md), [parcursurile reale](../../reviews/user-journeys-20261001/).

Proprietarul a decis să nu prioritizeze o funcție separată pentru linkuri perpetue la semnale recalculabile. Prioritatea este pentru anchete, date, întrebări și dovezi înghețate. Nu confunda această alegere cu permisiunea de a rescrie capturile existente.

## Loturile pentru jurnaliști

| Lot | Ce a adăugat | Referințe |
|---|---|---|
| 1 | Integritatea datelor, populații explicite și traseul până la sursele exacte | [Batch 1](../../implementation/batch1-data-integrity.md) |
| 2 | Anchete cu roluri, note, sarcini și dovezi/capturi imuabile | [Workspace](../../implementation/batch2-investigation-workspace.md), [frozen evidence](../../implementation/batch2-frozen-evidence.md) |
| 3 | Urmăriri private și comparații între checkpoint-uri, stări înainte/după, salvare în anchetă | [Monitoring](../../implementation/batch3-monitoring.md), [refresh/checkpoints](../../implementation/batch3-refresh-checkpoints.md) |
| 3, completare | Digest-uri e-mail opționale și verificarea deținătorului adresei | [Email digests](../../implementation/monitoring-email-digests.md), [auth verification](../../implementation/auth-email-verification.md) |
| 4 | Legături documentate prin relații de achiziții, nu un registru inventat de acționariat | [Connections](../../implementation/batch4-connections.md), [date](../../implementation/batch4-connections-data.md), [dovezi](../../implementation/batch4-connection-evidence.md) |
| 4, comparații | Grupuri de instituții, comparații salvate și surse verificabile | [Peers](../../implementation/batch4-peers.md), [date](../../implementation/batch4-peers-data.md), [dovezi](../../implementation/batch4-peers-evidence.md) |
| Populație | Cele mai apropiate 10 administrații, CJ separat, grup manual | [Population peers](../../implementation/peer-population.md), [audit](../../implementation/peer-population-audit.md), [toți anii/toate domeniile](../../implementation/peer-all-filters.md) |
| 5, fișiere | Inventar, cerere la cont, arhivare, text/OCR, căutare și citate pe pagină | [Discovery](../../implementation/batch5-documents-discovery.md), [implementare](../../implementation/batch5-documents-implementation.md), [pilot](../../implementation/batch5-document-pilot.md) |
| 5B | Căutare tematică pentru curiosul care nu știe încă instituția | [Implementare](../../implementation/batch5b-topic-search-implementation.md) |

Limitele pentru capturi, urmăriri și exporturi sunt explicite. De exemplu, urmărirea completă poate refuza o selecție peste limita de 200.000 de surse; nu o eșantionează în tăcere. O sursă care iese din selecție nu este automat un contract anulat. „Prima dată observat în selecție” nu înseamnă „publicat pentru prima dată în SEAP”.

## Colectare și admin

| Evoluție | Referințe |
|---|---|
| Planul inițial, reluare prudentă, buget comun | [Resume plan](../../implementation/seap-production-resume-plan.md) |
| Status live, setări și jurnale | [Admin collection](../../implementation/admin-collection.md) |
| Navigare pe rute consistente, nu amestec de scroll și pagini; 10 rânduri/pagină | [Admin navigation](../../implementation/admin-navigation-20260928.md) |
| Coada documentelor în admin | [Document queue](../../implementation/admin-document-queue-20260927.md) |
| Procesare la 05:00, scope daily/full, backup și redeschidere | [Scheduled processing](../../implementation/scheduled-processing.md), [runbook](../../implementation/collection-recovery-runbook.md) |
| Jurnale complete ale erorilor, timeout 5/10 minute, pauza SEAP | [Failure diagnostics](../../implementation/collection-failure-diagnostics.md), [retry](../../implementation/seap-timeout-retries.md), [quiet window](../../implementation/seap-quiet-window.md) |
| Pool Webshare, izolare per IP, concurență și control compact | [Proxy pool](../../implementation/seap-proxy-pool.md) |
| ETA măsurat și extindere zilnică până ieri | [Continuous ETA](../../implementation/recovery-continuous-eta-20261007.md) |
| Formulare și detalii ale anunțurilor | [Notice details](../../implementation/notice-details-20261008/README.md) |
| Identități corecte ale anunțurilor și inventare istorice | [Notice identity](../../implementation/notice-identity-20261009/README.md) |
| Optimizări de debit fără eliminarea porților | [Throughput](../../implementation/collection-throughput-20261009.md) |
| Strategia națională DA, cu partiționare demonstrată | [Auditul celor zece zile](../../research/da-busy-days-20261010/README.md) |

Politica inițială de 50–70 secunde global, un singur fișier/minut și lipsa downloadului automat a evoluat prin decizii explicite. **Nu restaura acele setări dintr-un document vechi.** Calendarul și mecanismul actual sunt în [operations.md](operations.md).

## Audituri și reparații de date

| Dată / subiect | Stare documentată și sursă |
|---|---|
| Septembrie, TED | Istoric reparsat și reconciliat; [reparație](../../implementation/ted-repair.md), [aplicare](../../implementation/ted-production-recovery-20260927.md) |
| 30 septembrie, calendar/semnale/UX | [Release verificat](../../implementation/release-20260930.md) |
| 1 octombrie, identități fiscale/SICAP | [Audit/algoritm](../../implementation/entity-identity-repair.md), [finalizare în producție](../../implementation/entity-identity-release-20261001.md) |
| 2 octombrie, local actualizat din producție | [Transferul privat și căutarea](../../implementation/local-production-copy-20261002.md); distinct de pachetul public al colegului |
| 3 octombrie, audit DQ | [Constatări și priorități](../../audits/20261003-data-quality/README.md) |
| 4 octombrie, monede și republicări | [Monede](../../implementation/contract-currency/README.md), [identități contractuale](../../implementation/contract-publication-identity/README.md) |
| 4 octombrie, ONRC/MF | [Raport de producție](../../implementation/reference-import-integrity/PRODUCTION.md) |
| 7–8 octombrie, normalizare/paginare | [Recuperare 7 octombrie](../../implementation/recovery-20261007/README.md), [8 octombrie](../../implementation/recovery-20261008/README.md) |
| 9–10 octombrie, versiuni/republicări noi | [Dovezi și draft](../../implementation/publication-revalidation-20261009/README.md), [publicare încheiată](../../implementation/publication-recovery-20261010/README.md) |
| 11 octombrie, formate mari/arhive | [Formate](../../implementation/document-formats-20261011.md), [categorii/politică strictă](../../implementation/document-categories-20261011.md) |
| 11 octombrie, investigații și achiziții neobișnuite | [Runda 1](../../research/20261011-watchdog/), [runda 2](../../research/20261011-watchdog-round2/) |
| 11 octombrie, corecția curentă | [Clasificare financiară și identități noi](../../implementation/contract-reporting-integrity-20261011/README.md): local, încă nepublicată; 748 grupuri incerte |

DQ-04 a privit și diferența dintre un inventar/metadata și existența fizică a arhivei; nu transforma orice mențiune de „raw/document” într-o promisiune de PDF descărcat. Raportul auditului precizează obiectul exact al verificării.

## Editorial și cercetare

„Ce bate la ochi” a explorat hartă pe județe → listă editorială → poveste cu timeline și dovezi. Exemplele au fost înlocuite cu cercetări reale, iar proprietarul a cerut ulterior separarea întregii funcționalități pe `feat/ce-bate-la-ochi`. Este lucru parcat, nu o funcție de reintegrat automat din această predare.

Rundele watchdog cer o poveste legată de fapte, oameni și surse, cu explicații alternative și fără filler. Cealaltă direcție caută achiziții neobișnuite, verificând mai întâi dacă atribuțiile instituției le pot explica. Sutiene, obiecte promoționale sau echipamente aparent neobișnuite nu dovedesc singure o problemă. Runda a doua conține promptul mai riguros, rapoarte tematice și revizii; `DATA-CAVEATS.md` trebuie citit înainte de reutilizarea concluziilor.

Nu publica automat o pistă internă. Nu trimite mesaje instituțiilor sau persoanelor în numele proprietarului fără cerere explicită. Relațiile ONRC, vechimea firmei, cifra de afaceri și legăturile personale cer surse și date temporale corecte.

## Ce nu intră în Git sau în memoria LLM

Dump-uri, `.env`, chei SSH, parole proxy, cookie-uri, sesiuni, date private de cont/anchetă. Fișierele de proxy cu nume Webshare din rădăcină sunt configurație privată, nu documentație de distribuit. Pentru acces se folosesc conturi și secrete individuale. Rapoartele de test consemnează rezultatul, nu credentialele fixture-urilor.

Un model nou nu primește memoria internă a celui vechi. Primește un traseu verificabil către cod, decizii, manifestele datelor, dovezi și limite — acesta este scopul handoverului.
