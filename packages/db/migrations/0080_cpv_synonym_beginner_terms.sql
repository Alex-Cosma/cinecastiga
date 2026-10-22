-- Beginner vocabulary for subjects (22 October 2026, beginner UX test).
-- "iluminat" meant only lamps (31500000); a person typing it on the home page
-- means public lighting: street lighting, its installation and maintenance.
-- Additive data only: no row is deleted or changed, and a row already present
-- is kept as is. packages/db/seeds/cpv-synonyms.sql carries the same rows, so a
-- re-seed reproduces this state. The audit behind each row (what a beginner
-- types, what the titles are classified as) is in docs/handover/02-architecture.md.
-- A row's note is shown to people wherever the term is used (/cauta, the
-- Întreabă caveats): write it as a sentence for a reader.
CREATE SCHEMA IF NOT EXISTS reference;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reference.cpv_synonym (term text NOT NULL, cpv_prefix text NOT NULL, note text, PRIMARY KEY (term, cpv_prefix));
--> statement-breakpoint
INSERT INTO reference.cpv_synonym (term, cpv_prefix, note) VALUES
('iluminat','34993000',null),
('iluminat','34928500',null),
('iluminat','45316000','Include și semnalizarea rutieră (semafoare, balizaj), clasificată în aceleași coduri CPV cu iluminatul public. La nivel național e circa 7% din valoare, dar în unele județe mult mai mult.'),
('iluminat','50232000','Include și semnalizarea rutieră (semafoare, balizaj), clasificată în aceleași coduri CPV cu iluminatul public. La nivel național e circa 7% din valoare, dar în unele județe mult mai mult.'),
('iluminat public','34993000',null),
('iluminat public','34928500',null),
('iluminat public','45316000','Include și semnalizarea rutieră (semafoare, balizaj), clasificată în aceleași coduri CPV cu iluminatul public. La nivel național e circa 7% din valoare, dar în unele județe mult mai mult.'),
('iluminat public','50232000','Include și semnalizarea rutieră (semafoare, balizaj), clasificată în aceleași coduri CPV cu iluminatul public. La nivel național e circa 7% din valoare, dar în unele județe mult mai mult.'),
('iluminat festiv','31522000',null),
('iluminat festiv','39298500',null),
('iluminat de craciun','31522000',null),
('iluminat de craciun','39298500',null),
('iluminat de sarbatori','31522000',null),
('iluminat de sarbatori','39298500',null),
('craciun','31522000',null),
('craciun','39298500',null),
('craciun','39298910',null),
('sarbatori','31522000',null),
('sarbatori','39298500',null),
('sarbatori','39298910',null),
('decoratiuni','31522000',null),
('decoratiuni','39298500',null),
('decoratiuni','39298900',null),
('gropi','45233141',null),
('gropi','45233142',null),
('reparatii drumuri','45233141',null),
('reparatii drumuri','45233142',null),
('trotuare','45233161',null),
('trotuare','45233253',null),
('deszapezire','90620000',null),
('deszapezire','34927100',null),
('deszapezire','44113910',null),
('apa','65100000',null),
('apa','45232150',null),
('alimentare cu apa','41000000',null),
('salubrizare','90610000',null),
('pubele','34928480',null),
('energie','09310000',null),
('energie','09320000',null),
('gaze','09123000',null),
('rechizite','39162110',null),
('rechizite','30192700',null),
('manuale','22112000',null),
('carti','22110000',null),
('laptop','30213100',null),
('tablete','30213200',null),
('imprimante','30232100',null),
('software','72260000',null),
('transport elevi','60130000',null),
('transport elevi','34114400',null),
('transport scolar','60130000',null),
('transport scolar','34114400',null),
('microbuze','34114400',null),
('autobuze','34144910',null),
('mobilier urban','34928400',null),
('renovare','45453000',null),
('reabilitare','45453000',null),
('reabilitare','45321000',null),
('reabilitare','45233140',null),
('reabilitare drumuri','45233000',null),
('termoizolare','45321000',null),
('anvelopare','45321000',null),
('izolare termica','45321000',null),
('parcuri','77310000',null),
('parcuri','45112711',null),
('parcuri','43325000',null),
('spatii verzi','77310000',null),
('spatii verzi','71421000',null),
('locuri de joaca','37535200',null),
('locuri de joaca','43325000',null),
('locuri de joaca','45112723',null),
('produse de curatenie','39830000',null),
('publicitate','79341000',null),
('publicitate','22462000',null),
('evenimente','79952000',null),
('festival','79953000',null),
('festival','79952100',null),
('festivaluri','79953000',null),
('festivaluri','79952100',null),
('artificii','24613200',null),
('artificii','92360000',null),
('camere video','32333200',null),
('camere video','35125300',null),
('camere video','32323500',null)
ON CONFLICT DO NOTHING;

--> statement-breakpoint
-- Notes are now shown to people. The 13 older notes were the curator's row
-- labels ("apa captata si epurata"), not explanations: blank exactly those
-- values. A note edited since then is kept; re-running changes nothing.
UPDATE reference.cpv_synonym SET note = NULL WHERE (term, cpv_prefix, note) IN (VALUES
('lemne','03413000','lemn de foc'),
('peleti','03413000','biomasa lemnoasa'),
('gaz','09123000','gaze naturale'),
('curent','09310000','energie electrica'),
('caldura','09320000','energie termica'),
('panouri solare','09331000','fotovoltaice'),
('medicamente','33600000','produse farmaceutice'),
('masini','34110000','autoturisme'),
('masti','35113400','echipament de protectie'),
('apa','41000000','apa captata si epurata'),
('scoala','45214000','constructii invatamant'),
('licente','48000000','programe informatice'),
('mese','55520000','servicii de masa'));
