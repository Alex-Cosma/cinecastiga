-- Run after loading the original binary COPY into repair_20260927.ted_raw.
-- Restore archived source rows only. Never changes normalized/core records or cursors.
\set ON_ERROR_STOP on
create unique index if not exists ted_recovery_raw_id_idx on repair_20260927.ted_raw(id);
analyze repair_20260927.ted_raw;
begin;
\echo Checking original TED archive integrity and notice identities
do $$
begin
 if (select count(*) from repair_20260927.ted_raw) <> 161633 then
  raise exception 'Unexpected TED archive size';
 end if;
 if exists(select 1 from repair_20260927.ted_raw where source <> 'ted'
   or endpoint_version not in ('ted-eforms:v1','ted-fforms:v1')
   or jsonb_typeof(payload->'xml') is distinct from 'string'
   or content_hash !~ '^[a-f0-9]{64}$') then
  raise exception 'Invalid TED archive provenance or XML payload';
 end if;
 if (select count(*) from core.ted_notices) <> 161633
 or exists(select 1 from core.ted_notices n left join repair_20260927.ted_raw r on r.id=n.raw_id
   where r.id is null or regexp_replace(split_part(r.external_id,':',2),'^0+','') is distinct from regexp_replace(n.publication_number,'^0+','')) then
  raise exception 'Archive does not exactly cover the existing TED notice identities';
 end if;
 if exists(select 1 from raw.raw_documents r join repair_20260927.ted_raw t using(id)
   where (r.source,r.external_id,r.endpoint_version,r.content_hash,r.payload,r.fetched_at)
   is distinct from (t.source,t.external_id,t.endpoint_version,t.content_hash,t.payload,t.fetched_at)) then
  raise exception 'Existing raw ID conflicts with archived source';
 end if;
 if (select last_value from raw.raw_documents_id_seq) < (select max(id) from repair_20260927.ted_raw) then
  raise exception 'Raw sequence is behind historical archive; inspect before proceeding';
 end if;
end $$;
\echo Archive verified; restoring original source rows without changing cursors
insert into raw.raw_documents(id,source,external_id,endpoint_version,content_hash,payload,fetched_at)
select id,source,external_id,endpoint_version,content_hash,payload,fetched_at from repair_20260927.ted_raw
on conflict(id) do nothing;
commit;
select count(*) archived_notice_sources from core.ted_notices n join raw.raw_documents r on r.id=n.raw_id;
