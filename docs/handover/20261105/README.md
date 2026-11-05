# Predare 5 noiembrie 2026 — pagina „Metodologie” și auditul scorului de risc

Scrisă la cererea proprietarului înainte de compactarea conversației, ca toate deciziile să poată fi reluate una câte una. Două lucrări paralele din 5 noiembrie (model Fable 5.1), ambele **nepublicate, necomise, fără nicio intervenție pe producție**:

| Document | Ce conține |
|---|---|
| [metodologie-decizii.md](metodologie-decizii.md) | Prototipul paginii „Metodologie” (v11–v23), metoda panelului cu 38 de profiluri, istoricul scorurilor, **registrul deciziilor proprietarului M1–M28**, lista de îmbunătățiri fără decizie, defectele mărunte deschise, cum se reconstruiește și cum se portează în `apps/web`. |
| [scor-audit-decizii.md](scor-audit-decizii.md) | Auditul scorului rf-2026.21 cu opt profiluri de agenți pe extrasul din producție, bug-urile confirmate în cod (B1–B23, C1–C6), simularea corecturilor, **registrul deciziilor S1–S11**, loturile propuse, starea branch-ului `fix/audit-20261105`. |
| [restante.md](restante.md) | Tot ce a rămas deschis în afara celor două lucrări: push-uri neaprobate, verificări post-run pe producție, curățenie locală, procese de fundal. |

## Cum reiei

1. Citește registrul din `metodologie-decizii.md` și răspunde pe rând la M1–M28 (fiecare are context, dovezi, opțiuni, recomandare, ce schimbă). Deciziile mari sunt M2 (două împărțiri ale punctelor), M3 (percentila cu zerouri), M4 (explicația nu schimbă scorul), M5 (cine semnează), M6 (numele tiparelor).
2. Citește `scor-audit-decizii.md` și răspunde la S1–S11; lotul 1 (bug-uri sigure) poate porni fără decizii, dar tot cu acordul tău, într-o versiune nouă de metodologie.
3. Abia după decizii: portarea paginii în `apps/web/app/metodologie` și corecturile de cod în worktree-ul `seap-audit-20261105`.

## Unde sunt fișierele

- Prototipul publicat: artefact privat `https://claude.ai/artifact/BpGoCSx2TQKC2XZeVtpWdj` (versiunea 26 = v23 cu zecimalele corectate).
- Sinteza auditului publicată: `https://claude.ai/artifact/P8GcxTUawbKqyJgd24Mgr3`.
- Copii persistente în afara repository-ului (fără date private de caz; extrasele CSV din producție rămân doar în scratchpad-ul sesiunii):
  - `~/Desktop/Personal/code/seap-filters-work/scratchpad/metodologie-20261105/` — sursele v16–v23 (`vN-head/body/tail.html`), `metodologie-tutorial-v23.html` (pagina întreagă), `patch12–23.py`, `capture*.cjs`, `verify*.cjs`, `ovf.cjs`, `panel.md`, `OWNER-QUESTIONS.md`, `vN/{brief.txt, interactions.md, panel/tally.md}`.
  - `~/Desktop/Personal/code/seap-filters-work/scratchpad/scoreaudit-20261105/` — `SYNTHESIS.md`, `score-audit-synthesis.html`, `reports/A1–A8.md`, `sim.py`, `sim-output.txt`, `sensitivity.py`, `pull.sh`, `e1–e4.sql`, `prep.py`, `profiles.json`, `brief.txt`, `data/README.md` (dicționar) și `data/METHODOLOGY.md`.
- Memoria sesiunii (index): `~/.claude/projects/-Users-alexcosma-Desktop-Personal-code-seap/memory/MEMORY.md`, intrările `metodologie-redesign-20261105.md` și `score-audit-20261105.md`.

Aceste documente nu sunt comise; decide tu dacă intră în repository (nu conțin date private).
