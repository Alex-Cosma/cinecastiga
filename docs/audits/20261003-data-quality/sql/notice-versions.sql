WITH numbered AS (SELECT notice_no,count(*) n FROM core.awards WHERE notice_no IS NOT NULL GROUP BY 1 HAVING count(*)>1)
SELECT 'summary' test,jsonb_build_object('duplicate_notice_numbers',count(*),'notice_rows',sum(n)) data FROM numbered
UNION ALL SELECT 'examples',jsonb_agg(x) FROM (
SELECT a.ca_notice_id,a.notice_no,a.sys_notice_version_id,a.sys_notice_type_id,a.state_date,r.payload->>'noticeId' raw_notice_id,r.payload->>'versionNo' raw_version_no,r.payload->>'errataNo' errata_no,r.payload->>'procedureId' procedure_id,r.payload->>'noticeVersionNo' notice_version_no
FROM core.awards a LEFT JOIN raw.raw_documents r ON r.id=a.raw_id
WHERE a.notice_no IN ('CAN1133082','CAN1161722') ORDER BY a.notice_no,a.state_date) x
