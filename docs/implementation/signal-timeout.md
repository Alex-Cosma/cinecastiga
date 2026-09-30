# Lista semnalelor fără timeout — 30 septembrie 2026

Implementare **locală**, pe `fix/acquisition-details-dates`. Fără commit/push/deploy, trafic SEAP, colectori sau recalcularea riscului din arhiva reală. Această notă rezolvă problema observată în [lotul de limbaj](risk-language.md).

## Cauza și soluția

Numărările și ordonarea din `/semnale` reconstruiau populația prin join între aproximativ 2,4 milioane de semnale și 20,8 milioane de achiziții directe. Scanarea surselor largi depășea limita web de 20s. Această limită rămâne neschimbată.

`marts.signal_lookup` este acum o vedere materializată completă, compactă: ID-ul semnalului, cod/tip, cele două entități, severitate, valoare și identificatorul sursei. Păstrează precizia numerică a valorilor și tipul `real` original al severității. Indexurile susțin filtrarea și ordonarea. Detaliile și probele din `core.flags` sunt citite doar după selectarea celor 50 de rânduri ale paginii.

Nu există plafon de 500 de exemple. Numărările păstrează populația completă și aceleași reguli de rol/județ. Un anunț cu mai mulți câștigători apare o singură dată; filtrarea după sediul unui câștigător nu ascunde ceilalți câștigători. Semnalele fără sursa asociată nu inventează o achiziție. Legăturile către înregistrările sursă rămân pe fiecare rând.

## Actualizarea automată

- `buildTransactionMarts` reface și analizează vederea în aceeași tranzacție cu tabelele zilnice de tranzacții.
- **Duminică la 05:00, Europe/Bucharest:** pipeline-ul complet recalculează semnalele, construiește tabelele lor, apoi actualizează tranzacțiile și `signal_lookup`.
- **În celelalte nopți:** același pas actualizează legăturile/valorile surselor din noua vedere, păstrând semnalele și data evaluării săptămânale. Nu pretinde că a recalculat CRI.
- Și comanda de construire a tabelelor semnalelor, în modul implicit cu tranzacții, trece prin acest builder.
- Controlul de publicare `complete_signal_lookup` compară **toată** vederea cu proiecția canonică a surselor: rânduri lipsă/suplimentare, entități, severitate, sume și identificatori. Neconcordanța împiedică publicarea. Regula existentă de mentenanță la eșec rămâne în vigoare.

Definiția canonică este exportată din schema DB și reutilizată de validator. Nu este o interogare executată la fiecare pagină. Compararea integrală locală a durat **44,7s**, cu **2.417.827 rânduri și zero diferențe**; este un cost al procesării, nu un timp promis în producție.

## Migrații și lansare

Migrațiile **0042–0044** sunt aplicate în baza locală (45 intrări în istoricul Drizzle): indexuri inițiale, vederea completă, apoi păstrarea preciziei severității și eliminarea indexurilor inițiale devenite inutile. Istoricul/checksum-urile deja aplicate sunt păstrate. Starea finală folosește indexurile vederii; nu păstrează indexurile suplimentare mari pe surse.

Generatorul Drizzle citește `src/schema/index.ts` pentru a nu înregistra aceeași vedere de două ori prin module și barrel. Verificat după migrare: fără schimbări de schemă suplimentare generate. Indexurile vederii sunt întreținute în SQL-ul migrației.

La prima publicare, runnerul trebuie să aplice migrațiile înaintea noii aplicații/procesări. Construirea inițială citește sursele complete și cere spațiu/timp; lanțul migrațiilor include și obiectele intermediare. **Întregul branch conține deja tranziția calendarului `rf-2026.6`**, deci lansarea trebuie să urmeze [procedura de publicare a lotului calendar](acquisition-details-calendar.md): backup, mentenanță, recalculare completă de tranziție și verificare, apoi programul zilnic/săptămânal obișnuit. Nu este un simplu deploy de texte. Nici această procedură, nici programarea efectivă din producție nu au fost executate/modificate în această intervenție.

## Verificare

- **36 teste web**: 15 pentru filtre/URL/query, 14 pentru prezentarea probelor și 7 integrări PostgreSQL. Acoperă populații peste 500, totaluri/paginare, roluri/județe, câștigători multipli, surse orfane, sume exacte și actualizarea/rollback-ul vederii.
- **11 integrări ingestion**: 4 pentru calendar/marts, una pentru actualizarea zilnică reală, 6 pentru pipeline/controlul publicării. Builder-ele scumpe sunt simulate doar în suita de orchestrare; actualizarea vederii și detectarea unei valori depășite sunt testate pe PostgreSQL real. Orchestrarea verifică ordinea după recalcularea riscului, includerea pasului zilnic și refuzul publicării la neconcordanță.
- Typecheck DB/web/ingestion trecute. Build optimizat web verificat separat de serverul de dezvoltare.
- Citirile locale directe pe DB au durat **1,35–6,14s** pentru selecțiile măsurate (rapid, apropiere de prag, financiar, firme Cluj); acestea sunt măsurători, nu SLA.
- Browser Chrome real, anonim: `/semnale`, apropiere de prag, financiar/firme, rapid, firme/Cluj, paginarea reală și mobil 390px. Toate au încărcat rezultatele, HTTP200, fără erori JS sau overflow al documentului. 50 de rânduri și 50 de legături către surse pe fiecare pagină. Timpi de navigare în dev **2,3–15,5s** (cel mai lent: firme/Cluj), pagina următoare 1,5s. Nu sunt măsurători de producție.
- Probe locale ignorate de Git: `.impeccable/review/signal-timeout-20260930/`. Datele sintetice au folosit exclusiv `seap_test_signals` și `seap_test_processing`; nu au fost inserate în arhiva reală.

Rămân valabile limitele datelor și ale riscului: semnalele sunt piste de verificare, nu constatări de ilegalitate. Vederea accelerează accesul la aceleași rezultate; nu schimbă formulele și nu repară retroactiv calendarul înaintea recalculării autorizate.
