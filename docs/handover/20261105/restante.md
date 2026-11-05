# Restanțe la 5 noiembrie 2026 (în afara metodologiei și a auditului)

Stările de mai jos sunt cele cunoscute la redactare; verifică mediul înainte de orice acțiune.

## Cod necomis / nepublicat

- **Branch `fix/audit-20261105`** în worktree-ul `~/Desktop/Personal/code/seap-audit-20261105`: 14 commit-uri locale peste `f35209d` (rf-2026.21), **nepushate**, așteaptă aprobarea ta. Conținut (de la cel mai nou): cap CSV exports la 2/proces; Next 16.4.2 + zod 4.6.7; pool Postgres per proces + idle timeout; partner list citită doar când e afișată; suita de scrape doar pe `seap_test_*`; fără log de coduri 2FA în producție; counts de funnel limitate; escape LIKE în Ask; ambele ortografii ale `rol` în URL; fără text de eroare Postgres în Ask; image optimizer oprit; rute admin better-auth închise peste HTTP; rate-limit sign-in/2FA per vizitator; renderer-ele Ask afară din bundle-ul paginii de entitate. Acestea sunt corecturile din auditul de securitate/perf anterior auditului de scor; **nu** conțin schimbări de scor.
- `main` local față de `origin/main`: verifică `git log --oneline origin/main..main` în `~/Desktop/Personal/code/seap`; commit-urile TED (`9b5341d`, `856b9a0`, `59c3b6a`, `d221cfc`) sunt cele mai recente la pornirea sesiunii. Push pe `main` = deploy automat după CI; doar cu aprobare explicită.
- Fișiere locale neurmărite la pornirea sesiunii: `.impeccable/critique/...topicsearch...md`, `.impeccable/surfaces/contract-reporting-coverage.md`, `docs/reviews/user-journeys-20261001/`, plus modificări la `.impeccable/surfaces/signal-citation-mockup.md` și `mockups/signal-citation/README.md`. Nu le-am atins.
- Documentele acestei predări (`docs/handover/20261105/`) sunt necomise.

## Producție (doar citire)

- Verificări post-run din 4–5 noiembrie **nefăcute**: `data_repairs` pentru `authority-fragments-20261104` (așteptat: 283 fuzionate, 283 redirecturi), rezultatul rulării complete rf-2026.21 din noaptea 4→5 noiembrie, starea stream-ului de documente și a pool-ului de proxy-uri (memoria `proxy-pool-watch-20261103`).
- Extrasul de audit din 5 noiembrie a fost făcut doar cu citiri pe câte un tabel (`pull.sh`, `e1–e4.sql`), fără scriere.
- Parola de admin din producție rămâne **nerotită** (memoria `auth-user-management`).

## Local

- Procese de fundal pornite în sesiune, inofensive, pot fi oprite: dev server Next pe `:3000` din worktree-ul `seap-risk-v2-20261103`; două bucle de așteptare CI/deploy pentru `5da7237` și `f35209d` (ambele deploy-uri au trecut; buclele pot fi oprite cu TaskStop sau ignorate).
- Curățenie aprobată „mai târziu, cu OK”: ~55 worktree-uri vechi, 54 baze `seap_test_*` (~23 GB), servere dev/mock (memoria `local-cleanup-backlog`).
- Worktree-uri folosite în sesiune: `seap-audit-20261105` (branch-ul de mai sus), `seap-risk-v2-20261103` (dev server).

## Funcționalități promise de pagina de metodologie, inexistente încă pe site

Acestea blochează publicarea paginii în forma actuală (vezi M4, M7 în `metodologie-decizii.md`):

1. Afișarea explicației instituției/firmei lângă semnal, cu dată, și „Răspundem în 10 zile lucrătoare” (promisă, decisă de tine la 5 noiembrie dimineață).
2. Butonul „Trimite o corectură” (în prototip nu face nimic; minim un `mailto:` precompletat).
3. „Ultima actualizare: datele …; scorurile … (rf-…)” dinamic, din rulări.
4. Opțional: permalink la scorul dintr-o zi/versiune; export CSV cu versiune și dată; tag git per versiune de metodologie; constante în JSON.

## Adăugat 5 noiembrie 2026, după deciziile S1–S11, M3, M25, M27

- **Branch nou `feat/risk-rf2026-22`** în worktree-ul `~/Desktop/Personal/code/seap-audit-20261105`, peste `fix/audit-20261105` (cele 14 commit-uri nepushate rămân dedesubt). Implementează `rf-2026.22` (vezi `scor-audit-decizii.md` §2ter). **Necomis**: 33 de fișiere modificate. Commit, push și publicare doar cu aprobarea proprietarului; push pe `main` = deploy, iar schimbarea versiunii de metodologie declanșează o rulare completă.
- **Baza locală `seap` rescrisă de rebuild-ul semnalelor și al scorului** cu `rf-2026.22` (scris permis pe local). Copia de dinainte: tabelul `public.rf2026_21_backup_entity_flags` (scor, bandă, părți); se șterge după verificare, cu OK.
- **De verificat pentru lista de excepții (S6):** Ploiești / Prahova / Plopeni / Slatina / Miroslava Industrial Parc, Termocentrale Constanța, SEPSIIPAR, LOCTRANS (acționariat public probabil, nesursat); alte spitale private cu „spital” sau „hospital” în nume.
- **Fără test de integrare pentru SQL-ul capacității** (`build.ts`, bilanțul aceluiași an + anul ONRC): verificat doar pe rebuild-ul local; de adăugat un fixture.

## Seara de 5 noiembrie 2026: deploy rf-2026.22 și pagina nouă de metodologie

- `rf-2026.22` e pe producție (`41ce63a`, după corectura build-ului imaginii web), iar rularea completă s-a încheiat `ready` la 17:45 UTC; verificările sunt în `05-operations.md` („Pe producție, 5 noiembrie 2026”).
- Pagina `/metodologie` e prototipul v24 (`apps/web/app/metodologie/MethodologyStory.tsx`, stiluri `metodologie-v24.css` sub `.mt`, comportament `MethodologyBehavior.tsx`). Deciziile proprietarului din seara de 5 noiembrie: fila „Regulile” păstrează structura v24 cu textul complet al tuturor regulilor paginii vechi; ghidul `/ghid` dispare (redirect permanent la `/metodologie`, „Ghid” din header duce acolo, „Pe scurt” a primit harta, Întreabă și trei termeni din glosar); dreptul la replică e scris la ce există azi (e-mail, 10 zile lucrătoare, corectăm o citire greșită).
- Cifrele naționale ale paginii sunt live (`apps/web/lib/methodology-figures.ts`, cache 10 minute): benzile, grupul Comunei Exemplu (populația 4.500–18.000, grupurile din `risk-peers.ts`), tabelul pe tipuri și histograma. Sensibilitatea regulii de 40% e scrisă din extrasul de producție de după rulare (`seap-filters-work/scratchpad/metodologie-20261105/data/sensitivity22.mts`, validat: 14.695 din 14.724 de scoruri reproduse exact, restul ±1 din rotunjirea tăriilor).
- Din „Funcționalități promise” de mai sus: (1) afișarea răspunsului lângă semnal **rămâne de construit** — pagina nu o mai promite; (2) „Trimite o corectură” e un `mailto:` cu subiectul completat; (3) „Ultima actualizare” e dinamic; (4) tag-ul `rf-2026.22` și `/metodologie/constants.json` există (pragurile nivelurilor rămân în funcțiile de tărie; pagina trimite la tabelul lor).
