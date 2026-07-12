# Context: bronze-layer

**Last Updated:** 2026-07-12
**Sessions:** 1

## Discussion Summary

Scope set via three questions: (1) include direct acquisitions alongside tenders+awards — full firehose in this task; (2) sample mode = date window, last 30 days default; (3) user's 2020 endpoint knowledge not recoverable — research must establish current API surface.

---

## Resolved Questions

### Source scope
**Question:** Tenders+awards only (ROADMAP Phase 2) or include direct acquisitions (Phase 4)?
**Resolution:** Include direct acquisitions. One bronze task covers all three notice families.
**Related Decisions:** DEC-001

### Sample mode shape
**Question:** Date window vs county slice vs fixed count?
**Resolution:** Date window, default last 30 days (`SCRAPE_SAMPLE=30d`). Exercises pagination + cursor logic; predictable volume.
**Related Decisions:** DEC-002

---

## Deferred Questions

### Exact scrape schedules (cron cadence per notice type)
**Reason:** Depends on observed volumes + rate-limit behavior from first real runs.
**Default for now:** Conservative (e.g. hourly tenders/awards, few-hourly direct acquisitions); tune after.
**Revisit when:** First week of live sample runs.

---

## Discussion History

| Date | Topics Covered | Key Outcomes |
|------|----------------|--------------|
| 2026-07-12 | Scope, sample mode, 2020 intel | FEATURE.md written; DEC-001..002 |

---

## Gray Areas Remaining

All research-shaped (resolve via research stage, not user discussion):

- [ ] Current e-licitatie.ro endpoint paths + request/response shapes per notice family (list + detail) — sicap-parser/sicap.ai prior art vs live API today
- [ ] Pagination contract: page size limits, total-count field reliability (feeds reconciliation), sort/filter params (date-window support for sample mode)
- [ ] Rate-limit behavior: what 429/403 looks like in practice, safe request cadence
- [ ] Direct-acquisition list endpoint volume characteristics — feasible chunk size per request

---

## Quick Reference

- **Task:** `.specd/tasks/bronze-layer/FEATURE.md`
- **Decisions:** `.specd/tasks/bronze-layer/DECISIONS.md`
- **Project docs:** root `.specd/tasks/project/` (ROADMAP Phase 2+4, research/PITFALLS.md)
