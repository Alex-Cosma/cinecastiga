# Working in this repository

Start with [docs/handover/README.md](docs/handover/README.md). It links the current product decisions, architecture, local setup, public database transfer, production operations and known limitations. Read the relevant feature document before changing its semantics. `HANDOFF.md` contains a long chronology; dated older "pending"/"not deployed" notes may be superseded.

- This is an existing, deployed Romanian procurement investigation product. Preserve exact source transparency, private investigation access and frozen evidence. Signals are leads, not proof of wrongdoing; contract amounts are not payments.
- UI work follows `PRODUCT.md` and `DESIGN.md`; reuse the existing Romanian interface, themes and source workflows.
- Inspect `git status` and preserve other contributors' work. Prefer a feature branch for collaboration. A push to `main` automatically deploys after CI; do not use it as a scratch branch.
- Node22+, pnpm9.4.0, PostgreSQL16, Meilisearch1.16. Build workspace packages before using their dist exports. See `docs/handover/03-development.md` for verified commands.
- Use a new local database for restore and isolated `seap_test_*` databases for write fixtures. Do not run test seed/truncate scripts on real data. Keep migration history with restored databases; do not invent a baseline or edit historical checksums.
- Default development uses no source traffic: no collector, source document worker or nightly scheduler. Archived documents remain usable. Local configuration uses new secrets and a new account, never copied production sessions/keys.
- Production shared request budget, quiet window, retries, maintenance and publication gates are documented in `05-operations.md`. An ordinary code task does not imply permission to alter them or rerun a historical repair.
- Dated scripts in `scripts/operations/` are preserved incident procedures, not onboarding commands. Check current state and authorization before any live mutation.
- Run checks relevant to the change; distinguish passing units from skipped database tests. Report which environment was verified. Update the relevant documentation when behavior changes.
- Never commit `.env`, passwords, SSH keys, database dumps, private account/case data or browser session state.
