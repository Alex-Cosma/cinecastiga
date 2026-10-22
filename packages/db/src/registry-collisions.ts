/**
 * Audit F03, option (b) (owner decision of 22 October 2026): reviewed ONRC
 * name collisions among entities without a foreign marker.
 *
 * The F03 stopgap checks the ONRC name only for foreign-marked entities. An
 * entity with a valid CUI, country RO or unknown and not is_foreign is joined
 * to ONRC and MF by its CUI even when ONRC registers that number under a name
 * sharing no distinctive token with the entity name. On the local 1 October
 * snapshot that class holds 4,647 entities (2,631 with supplier value,
 * 28.77 bn lei); most are renames, abbreviations or spellings of the same firm
 * (RCS & RDS -> DIGI ROMANIA, SIEPCOFAR -> DONA LOGISTICA, TOP TECH -> DENDRIO
 * TECHNOLOGY), so the class cannot be cut off automatically.
 *
 * Each row below was reviewed on that snapshot and kept only with positive
 * evidence that the ONRC firm is another firm: the SEAP record is a foreign
 * firm (foreign legal form or name, SICAP county "NA" or a foreign region),
 * or a legal form that cannot share the number (an SRL or a company in SEAP,
 * a natural person's PFA/II/IF/AF in ONRC; a PFA in SEAP, an SRL run by
 * another person in ONRC). The top 60 of the class by supplier value were all
 * renames or spellings and none is listed. Natural persons registered in ONRC
 * are described, not named.
 *
 * Ids are production ids (the snapshot is a copy of production). A row
 * applies only while the entity still holds the recorded CUI, so it never
 * reaches another entity or a corrected CUI. `cuiCorroborated` treats a listed
 * entity as not corroborated: no ONRC representatives, MF balance sheet,
 * registry links or county, fin_* and net_shared_admin signals. Identity
 * (cui_canonical, cui_valid, contract-identity hashes) does not change.
 */
export interface RegistryCollision {
  entityId: string;
  /** core.entities.cui_canonical when reviewed. */
  cui: string;
  /** core.entities.name_display when reviewed. */
  seapName: string;
  /** reference.onrc_firm name(s) of that CUI (natural persons described). */
  onrcName: string;
  evidence: string;
}

export const REVIEWED_REGISTRY_COLLISIONS: readonly RegistryCollision[] = [
  { entityId: "2095043", cui: "16853659", seapName: "INTRASOFT International", onrcName: "MEGASPEED TRANS SRL",
    evidence: "Luxembourg IT firm, SICAP county NA; ONRC: transport SRL in Cristești, Mureș (J26/1752/2004)" },
  { entityId: "1997075", cui: "32990305", seapName: "Plansee SE- COD TVA ATU32990305", onrcName: "PFA of a natural person, Cluj",
    evidence: "Austrian SE, name gives Austrian VAT ATU32990305, SICAP county NA; ONRC: a PFA (F12/661/2014)" },
  { entityId: "1966769", cui: "2881845", seapName: "LOM PRAHA TRADE a.s.", onrcName: "MAMY IMPORT EXPORT SRL",
    evidence: "Czech a.s., SICAP county Czech Republic; ONRC: SRL in Cluj (J12/2940/1991)" },
  { entityId: "1974145", cui: "791428", seapName: "YAPIDROM ȘEHİR DİZAYNI İNȘAAT BİLİȘİM TEKNOLOJİLERİ VE REKLAMCILIK LİMİTED ȘİRKETİ",
    onrcName: "METALOPLAST SRL", evidence: "Turkish limited şirketi, SICAP county ISTANBUL; ONRC: SRL in Sibiu (J32/758/1991)" },
  { entityId: "2019716", cui: "17305654", seapName: "VIA OCEL DOO", onrcName: "MIRELVI CONSTRUCT SRL",
    evidence: "d.o.o. (former Yugoslav form), SICAP county NA; ONRC: SRL in Prahova (J29/513/2005)" },
  { entityId: "2045888", cui: "23902800", seapName: "PD-COFF Kereskedelmi es Szolgaltato Korlatolt Felelosegu Tarsasag",
    onrcName: "MEDAL SRL", evidence: "Hungarian Kft., SICAP county Hajdú-Bihar; ONRC: SRL in Dâmbovița (J15/689/2008)" },
  { entityId: "2069641", cui: "25021", seapName: "HOCHTIEF INFRASTRUCTURE GMBH", onrcName: "LAUR & OANA SRL",
    evidence: "German GmbH, SICAP county NA; ONRC: SRL in București (J40/7043/1991)" },
  { entityId: "2078359", cui: "4459783", seapName: "NOV  ROMANIA LLC", onrcName: "MORENA REX SRL",
    evidence: "LLC (US form), SICAP county NA; ONRC: SRL in Constanța (J13/3544/1993)" },
  { entityId: "2086362", cui: "31065212", seapName: "J.V EXCAVACIONES Y TRANSPORTES ORSA S.L", onrcName: "PFA of a natural person, Argeș",
    evidence: "Spanish S.L., SICAP county NA; ONRC: a PFA (F3/13/2013)" },
  { entityId: "2087278", cui: "43972983", seapName: "RESIDUOS DE LA CONSTRUCCION Y MANTENIMIENTOS TECNICOS SL",
    onrcName: "FOX IDEAS S.R.L.", evidence: "Spanish S.L., SICAP county NA; ONRC: SRL in București (J40/5309/2021)" },
  { entityId: "2089039", cui: "55880", seapName: "SPANOS SA", onrcName: "RALLY SRL",
    evidence: "Greek SA, SICAP county NA; ONRC: SRL in Bihor (J05/1403/1991)" },
  { entityId: "2089718", cui: "515", seapName: "LOM Praha s.p.", onrcName: "SIAC SA",
    evidence: "Czech state enterprise (s.p.), SICAP county NA; ONRC: SA in București (J1991000992408)" },
  { entityId: "2101730", cui: "42030", seapName: "AKTIS ATE SA", onrcName: "TRANDAFIR PRODCOMEX SRL",
    evidence: "Greek ATE, SICAP county NA; ONRC: SRL in București (J40/13639/1992)" },
  { entityId: "2106953", cui: "46318", seapName: "NEMZETKOZI VEGYEPSZER ZRt", onrcName: "GOLDEN QUEEN IMPEX SRL",
    evidence: "Hungarian Zrt., SICAP county NA; ONRC: SRL in București and Călărași (J40/14552/1992)" },
  { entityId: "2109901", cui: "11845159", seapName: "ZENIT Logisztikai Eszközök Kereskedoháza Kft.", onrcName: "KEK HAL SRL",
    evidence: "Hungarian Kft., SICAP county NA; ONRC: SRL in Harghita (J1999000182193)" },
  { entityId: "2117585", cui: "6580195", seapName: "SIDES", onrcName: "INTER COM TRANS SRL",
    evidence: "SICAP county NA (address outside Romania); ONRC: SRL in Constanța (J13/4234/1994)" },
  { entityId: "1965461", cui: "48591254", seapName: "TTC MARCONI", onrcName: "AM JUST S.R.L.",
    evidence: "SICAP county NA (address outside Romania); ONRC: SRL in București registered 2023 (J2023014458407)" },
  { entityId: "1979778", cui: "3975999", seapName: "Cavendish Nuclear Limited", onrcName: "ARCON SISTEME SRL",
    evidence: "UK Limited, SICAP county Cheshire; ONRC: SRL in Covasna (J14/387/1993)" },
  { entityId: "1969710", cui: "48467", seapName: "AYDINER İNŞAAT ANONİM ŞİRKETİ (S.A.)", onrcName: "COVACI PRESTIMPEX SRL",
    evidence: "Turkish anonim şirketi, SICAP county ÇANKAY; ONRC: SRL in Bihor (J05/1621/1992)" },
  { entityId: "1973169", cui: "17866800", seapName: "HKS, Inc.", onrcName: "CASACYP CONSTRUCT SRL",
    evidence: "US Inc., SICAP county NA; ONRC: SRL in Timiș (J35/2650/2005)" },
  { entityId: "1981066", cui: "17535424", seapName: "EUROPEAN DYNAMICS LUXEMBOURG SA", onrcName: "AF of a natural person, Cluj",
    evidence: "Luxembourg SA, SICAP county NA; ONRC: an asociație familială (F12/1603/2005)" },
  { entityId: "1984575", cui: "10624672", seapName: "RODEN Kft.", onrcName: "AF of a natural person, Suceava",
    evidence: "Hungarian Kft., SICAP county NA; ONRC: an asociație familială (F33/597/1998)" },
  { entityId: "1996167", cui: "83871", seapName: "Kalpataru Power Transmission Limited", onrcName: "APOLLO-METACHIM SRL",
    evidence: "Indian Limited, SICAP county Maharastra; ONRC: SRL in Bihor (J05/1125/1991)" },
  { entityId: "2000965", cui: "27537", seapName: "Tinaş Taah. İnş. Nak. San. ve Tic. A.Ş.", onrcName: "INROTEL GROUP SRL",
    evidence: "Turkish A.Ş., SICAP county NA; ONRC: SRL in București (J40/5221/1991)" },
  { entityId: "2036369", cui: "25572881", seapName: "ARMATURY Group a.s.", onrcName: "AGRO BIO VITAL SRL",
    evidence: "Czech a.s., SICAP county NA; ONRC: SRL in Satu Mare (J30/404/2009)" },
  { entityId: "2063301", cui: "14918204", seapName: "SUN CHEMICAL AKTIENGESELLSCHAFT", onrcName: "ISOPLUS SRL",
    evidence: "Aktiengesellschaft, SICAP county NA; ONRC: SRL in Mureș (J26/791/2002)" },
  { entityId: "2117785", cui: "34160", seapName: "PORR BAU GmbH", onrcName: "MIHART EXIM SRL",
    evidence: "Austrian GmbH, SICAP county NA; ONRC: SRL in București (J40/2207/1992)" },
  { entityId: "1995840", cui: "33504004", seapName: "iMotions A/S", onrcName: "GRANT MANAGEMENT EXPERTS SRL",
    evidence: "Danish A/S, SICAP county NA; ONRC: SRL in București (J40/9781/2014)" },
  { entityId: "2221353", cui: "604", seapName: "173-746 NEWAMPORT SWA CORP.", onrcName: "IEMI SRL",
    evidence: "foreign corporation (Corp.); ONRC: SRL in București (J40/393/1991)" },
  { entityId: "2225747", cui: "345280", seapName: "8 Aviation Strategies International Inc.", onrcName: "MANCRIS IMPEX COOP SRL",
    evidence: "US Inc.; ONRC: SRL in București (J40/2242/1992)" },
  { entityId: "2071560", cui: "76050", seapName: "Zürn Harvesting GmbH & Co. KG", onrcName: "CONSTRUCTII TRIFA SOCIETATE IN COMANDITA SIMPLA",
    evidence: "German GmbH & Co. KG, SICAP county Iași; ONRC: SCS in Bihor (J05/1384/1991)" },
  { entityId: "2084211", cui: "28065050", seapName: "ASSIGNIA INFRAESTRUCTURAS S.A.", onrcName: "IF of a natural person, Bihor",
    evidence: "Spanish S.A.; ONRC: an întreprindere familială (F05/289/2011); its Bucharest branch has CUI 30133483" },
  { entityId: "2091938", cui: "46342796", seapName: "OHL ZS S.A.", onrcName: "PFA of a natural person, Iași",
    evidence: "Czech construction company, SICAP county București; ONRC: a PFA (F22/808/2022)" },
  { entityId: "2214527", cui: "3217790", seapName: "SC TROIA PREMIUM CONSTRUCT SRL", onrcName: "PF of a natural person, Arad",
    evidence: "SRL in SEAP; ONRC: a natural person's registration (F02/1526/1994)" },
  { entityId: "2162552", cui: "2477740", seapName: "SC COSVAN SRL", onrcName: "AF of a natural person, Mehedinți",
    evidence: "SRL in SEAP; ONRC: an asociație familială (F25/168/1999)" },
  { entityId: "2212371", cui: "37263243", seapName: "SC ADAM PHILIP PROJECT SRL", onrcName: "PFA of a natural person, Călărași",
    evidence: "SRL in SEAP; ONRC: a PFA (F51/119/2017); ADAM PHILIP PROJECT S.R.L. is CUI 41972154" },
  { entityId: "2208853", cui: "1301478", seapName: "Cabinet Individual de Asistenta Sociala Constantin Violeta",
    onrcName: "PASCU & CO SNC", evidence: "individual practice of a social worker; ONRC: SNC in Prahova (J29/886/1992), administrators are other persons" },
  { entityId: "2208331", cui: "1485885", seapName: "PERSOANA FIZICA AUTORIZATA AS ABRUDAN ANCA DANIELA", onrcName: "TRINIF SRL",
    evidence: "PFA in SEAP; ONRC: SRL in Vâlcea (J38/157/1992), administrator is another person" },
];

/** The reviewed collision recorded for this entity and CUI, if any. */
export function reviewedRegistryCollision(entityId: string | number, cui: string | null | undefined): RegistryCollision | null {
  const id = String(entityId);
  return REVIEWED_REGISTRY_COLLISIONS.find((r) => r.entityId === id && r.cui === cui) ?? null;
}

/** "<entity id>:<cui>" keys of the manifest, the form the SQL gate compares. */
export const REVIEWED_REGISTRY_COLLISION_KEYS: readonly string[] =
  REVIEWED_REGISTRY_COLLISIONS.map((r) => `${r.entityId}:${r.cui}`);
