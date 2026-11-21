# Working in this repository

The internal documentation (product decisions, architecture notes, operations, dated procedures) lives in a private repository. With access, its checkout is `agents-work/internal/` (git-ignored here); start with `agents-work/internal/docs/handover/README.md`. Paths such as `docs/…` in code comments refer to it.

- This is a deployed Romanian public-procurement exploration site. Preserve exact source transparency and frozen evidence. Signals are leads, not proof of wrongdoing; contract amounts are not payments.
- UI work follows `PRODUCT.md` and `DESIGN.md`; reuse the existing Romanian interface and themes.
- Inspect `git status` and preserve other contributors' work. Work on a branch: a push to `main` deploys after CI.
- Side work goes in `agents-work/` at the repository root (git- and Docker-ignored): scratch scripts, downloads, notes, screenshots, clones and worktrees.
- Node 22+, pnpm 9.4.0, PostgreSQL 16, Meilisearch 1.16. Build workspace packages before using their dist exports.
- Write fixtures only in isolated `seap_test_*` databases; never run test seed/truncate scripts on real data. Never run a bare `vitest run` in `apps/ingestion`: integration tests need an explicit test database.
- Keep migration history; never edit an applied migration or its checksum.
- Default development makes no source requests: no collector, document worker or nightly scheduler.
- Run the checks relevant to the change and report which environment was verified.
- Never commit `.env`, passwords, keys, database dumps, private account or case data, browser session state, or internal operations notes.
