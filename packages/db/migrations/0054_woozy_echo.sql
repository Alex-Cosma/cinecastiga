CREATE TABLE "core"."notice_award_sources" (
	"ca_notice_id" bigint NOT NULL,
	"c_notice_id" bigint NOT NULL,
	"source_url" text NOT NULL,
	"source_hash" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notice_award_sources_ca_notice_id_c_notice_id_pk" PRIMARY KEY("ca_notice_id","c_notice_id")
);
--> statement-breakpoint
CREATE TABLE "app"."collection_proxies" (
	"id" text PRIMARY KEY NOT NULL,
	"server" text NOT NULL,
	"exit_ip" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"next_allowed_at" timestamp with time zone,
	"reserved_job" text,
	"last_error" text,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."collection_proxy_control" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"requests_per_minute" integer DEFAULT 3 NOT NULL,
	"min_seconds" integer DEFAULT 50 NOT NULL,
	"max_seconds" integer DEFAULT 70 NOT NULL,
	CONSTRAINT "proxy_control_singleton" CHECK ("app"."collection_proxy_control"."id"=1),
	CONSTRAINT "proxy_rate_bounds" CHECK ("app"."collection_proxy_control"."requests_per_minute" between 1 and 10),
	CONSTRAINT "proxy_delay_bounds" CHECK ("app"."collection_proxy_control"."min_seconds" between 1 and 3600 and "app"."collection_proxy_control"."max_seconds" between "app"."collection_proxy_control"."min_seconds" and 3600)
);
--> statement-breakpoint
ALTER TABLE "core"."awards" ADD COLUMN "procedure_id" text;--> statement-breakpoint
ALTER TABLE "core"."awards" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "core"."notices" ADD COLUMN "procedure_id" text;--> statement-breakpoint
ALTER TABLE "core"."notices" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "app"."collection_requests" ADD COLUMN "proxy_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_proxy_ip_unique" ON "app"."collection_proxies" USING btree ("exit_ip");--> statement-breakpoint
CREATE INDEX "notices_procedure_authority_idx" ON "core"."notices" USING btree ("procedure_id","authority_entity_id");
--> statement-breakpoint
INSERT INTO app.collection_proxy_control(id) VALUES(1);
--> statement-breakpoint
-- Existing source objects only; identity is checked before copying procedure IDs.
UPDATE core.notices n SET procedure_id=r.payload->>'procedureId',title=r.payload->>'contractTitle'
FROM raw.raw_documents r WHERE r.id=n.raw_id AND r.source='elicitatie'
AND r.payload->>'cNoticeId'=n.c_notice_id::text AND r.payload->>'procedureId' ~ '^[1-9][0-9]{0,17}$';
--> statement-breakpoint
UPDATE core.awards a SET procedure_id=r.payload->>'procedureId',title=r.payload->>'contractTitle'
FROM raw.raw_documents r WHERE r.id=a.raw_id AND r.source='elicitatie'
AND r.payload->>'caNoticeId'=a.ca_notice_id::text AND r.payload->>'procedureId' ~ '^[1-9][0-9]{0,17}$';
--> statement-breakpoint
-- Verified archived SEAP GetGeneralInfo response. No title matching, source call or fabricated procedure ID.
-- Evidence: docs/implementation/previews/notice-award-association-20261006.json.
INSERT INTO core.notice_award_sources(ca_notice_id,c_notice_id,source_url,source_hash,evidence,fetched_at)
SELECT a.ca_notice_id,n.c_notice_id,'https://e-licitatie.ro/api-pub/comboPub/getNoticeGeneralInfo/?sysNoticeTypeId=17&noticeId=100231768','609f7615c01a00022af67f817b6e9162b54186f23e917d6f007d99fa268d0274','{"version": 1, "cNoticeId": 100231768, "noticeNo": "SCN1168231", "initNoticeId": 101254381, "authorityCui": "4233874", "response": {"noticeId": 101254381, "sysNoticeState": {"id": 2, "text": "Publicat", "localeKey": null, "apiActionResult": null}, "sysContractAssigmentType": null, "dfNoticeId": 100378674, "dfNoticeNumber": "DF1255997", "sysNoticeVersionDf": {"id": 2, "text": "Formatul nou", "localeKey": null, "apiActionResult": null}, "dfNoticeDate": "2025-09-23T15:46:51+03:00", "piNoticeId": null, "piNoticeNumber": null, "sysNoticeVersionPi": null, "piNoticeDate": null, "sendableToJoue": false, "tedNoticeNumber": null, "caNoticeId": 100594775, "caNoticeNumber": "SCNA1128762", "sysNoticeVersionCa": {"id": 2, "text": "Formatul nou", "localeKey": null, "apiActionResult": null}, "caNoticeDate": "2025-12-10T13:58:53+02:00", "planName": "PLANUL ANUAL AL ACHIZITIILOR PUBLICE PENTRU ANUL 2025 - 2025 - V12", "planDetailName": "Furnizarea prin închiriere si montare si demontare produse pentru iluminatul ornamental festiv din perioada sărbătorilor de iarnă 2025-2026 în municipiul Buzău.", "spentValue": 999590.0, "currency": "RON", "anapValidationDocumentDate": null, "anapValidationDocumentId": null, "anapValidationDocumentPath": null, "anapValidationDocumentName": null, "anapValidationDocumentTypeString": null, "anapValidationDocumentTypeId": null, "isSAD": false, "sysDfNoticeStateId": 11, "appealInfo": "Contestații depuse la  CNSC: \r\nnr: 3878 din data de 02.10.2025 cu decizia 3106 din data de 16.10.2025\r\n\r\n"}, "sourceUrl": "https://e-licitatie.ro/api-pub/comboPub/getNoticeGeneralInfo/?sysNoticeTypeId=17&noticeId=100231768", "sourceHash": "609f7615c01a00022af67f817b6e9162b54186f23e917d6f007d99fa268d0274", "fetchedAt": "2026-09-26T15:22:53.246Z", "noticeIdentityEvidence": {"path": "docs/implementation/previews/batch5-document-pilot/manifest.json", "rawHash": "611f76af73090bead92957cafb3ca90038e52fbf7e4a436cbdea75212d074a50"}}'::jsonb,'2026-09-26T15:22:53.246Z'::timestamptz
FROM core.awards a JOIN core.notices n ON n.authority_entity_id=a.authority_entity_id
JOIN core.entities e ON e.id=a.authority_entity_id
WHERE a.ca_notice_id=100594775 AND a.notice_no='SCNA1128762'
AND n.c_notice_id=100231768 AND n.notice_no='SCN1168231' AND n.sys_notice_type_id=17
AND e.cui_canonical='4233874' ON CONFLICT DO NOTHING;
