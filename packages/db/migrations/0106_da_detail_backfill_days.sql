-- Direct-award details, historical download (owner, 11 November 2026). The download schedules one task per award
-- (millions). A finished task is counted here by the day it finished and then removed from app.collection_tasks, so the
-- task table and the administration's status queries stay small. The archived detail and the request ledger remain.
create table if not exists app.da_detail_backfill_days (
  day date primary key,
  complete integer not null default 0
);
