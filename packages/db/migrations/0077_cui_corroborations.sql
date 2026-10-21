-- Audit F03 stopgap (option C): foreign-marked entities whose valid CUI ONRC
-- registers under a name sharing a distinctive token. Rebuilt by the marts
-- build (refreshCuiCorroborations); empty until then, which keeps ONRC/MF data
-- away from every foreign-marked entity. seap_web keeps SELECT through the
-- default privileges.
CREATE TABLE "marts"."cui_corroborations" (
	"entity_id" bigint PRIMARY KEY NOT NULL,
	"cui" text NOT NULL,
	"onrc_name" text NOT NULL
);
