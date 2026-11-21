/**
 * The hand-reviewed corrections of source data, as data only (21 November 2026): the processing applies them
 * (apps/ingestion: reviewed-winner, reviewed-supplier-merges, reviewed-foreign-twin-merges, reviewed-entity-names,
 * reference/authority-uat-repair, reference/authority-fragment-repair, each with its rules and checks), and the
 * methodology page lists them („Unde corectăm datele SEAP”). Ids are production ids. A change here changes both.
 */

/** Winners whose source record carries the contracting authority's own CUI (reviewed-winner.ts). */
export const ACCEPTED_AUTHORITY_CUI:readonly {sicapId:number;sourceCui:string;supplierCui:string;evidence:string}[]=[
 {sicapId:189411,sourceCui:'1590236',supplierCui:'35534516',evidence:'LA FANTANA 2025621; Registrul Auto Roman 2027820 is the authority of 25 of its contracts'},
 {sicapId:101507,sourceCui:'4541092',supplierCui:'7586277',evidence:'COMINF 2082032; Spitalul Clinic de Recuperare Iasi 2146265 is the authority of 342 of its contracts'},
 {sicapId:38659,sourceCui:'3321234',supplierCui:'7012045',evidence:'CANBERRA PACKARD 2115557; IFIN-HH 2121912 is the authority of 17 of its contracts'},
 {sicapId:28306,sourceCui:'3321234',supplierCui:'22677832',evidence:'HISTERESIS 2119134; IFIN-HH 2121912 is the authority of 105 of its contracts'},
 {sicapId:21783,sourceCui:'3321234',supplierCui:'15595373',evidence:'APEL LASER 2120897; IFIN-HH 2121912 is the authority of 59 of its contracts'},
 {sicapId:13864,sourceCui:'3321234',supplierCui:'16997760',evidence:'Euro Techsys 2123363; IFIN-HH 2121912 is the authority of 7 of its contracts'},
 {sicapId:9739,sourceCui:'3321234',supplierCui:'10274437',evidence:'ROMTEK ELECTRONICS 2124923; IFIN-HH 2121912 is the authority of 4 of its contracts'},
 {sicapId:7355,sourceCui:'13328043',supplierCui:'211717',evidence:'Energobit 2125957; Transelectrica 2146462 is the authority of 7 of its contracts'},
 {sicapId:109982,sourceCui:'37832160',supplierCui:'6243289',evidence:'THEDA MAR 2077507; CM Strazi, Poduri si Pasaje Bucuresti 2010434 is the authority of 11 of its contracts'},
];

/**
 * The three single winner records reviewedWinnerIdentity (reviewed-winner.ts) corrects by its own rules, described
 * for the methodology page: the SICAP id, the CUI and the name the source gives, and the firm the record names.
 */
export const REVIEWED_WINNER_RECORDS: readonly { sicapId: number; sourceCui: string; sourceName: string; cui: string | null; note: string }[] = [
  { sicapId: 54428, sourceCui: "13068733", sourceName: "HABAU PPS PIPELINE SYSTEMS", cui: "13092995", note: "CUI-ul altei firme" },
  { sicapId: 64188, sourceCui: "5394305", sourceName: "THEOTOP", cui: "391391", note: "CUI-ul altei firme" },
  { sicapId: 14779, sourceCui: "5394305", sourceName: "UTI GRUP", cui: null, note: "codul de participant al altei firme" },
];

/** Key-less Romanian supplier profiles merged into the valid-CUI firm they duplicate (reviewed-supplier-merges.ts). */
export interface ReviewedSupplierMerge {
  sourceId: string;
  targetId: string;
  /** core.entities.name_normalized of the source when it was reviewed. */
  sourceName: string;
  /** Valid CUI of the target when it was reviewed. */
  targetCui: string;
  evidence: string;
}

export const REVIEWED_SUPPLIER_MERGES: readonly ReviewedSupplierMerge[] = [
  { sourceId: "2277024", targetId: "2123842", sourceName: "telecomunicatii cfr", targetCui: "15034095",
    evidence: "id RO15034059 (digits swapped), Bucharest; ONRC 15034095 = Telecomunicatii C.F.R. SA, only CUI with this name" },
  { sourceId: "2276441", targetId: "2123842", sourceName: "telecomunicatii cfr", targetCui: "15034095",
    evidence: "no id, Bucharest; ONRC 15034095 = Telecomunicatii C.F.R. SA, only CUI with this name" },
  { sourceId: "2276257", targetId: "2125531", sourceName: "tancrad", targetCui: "8006670",
    evidence: "id 0800667669 (garbled 8006670), Galati; ONRC 8006670 = TANCRAD SRL, only CUI with this name" },
  { sourceId: "2277014", targetId: "2085724", sourceName: "new recycling", targetCui: "22793039",
    evidence: "id 2279039 (one digit missing), Brasov; ONRC 22793039 = NEW-RECYCLING SRL, only CUI with this name" },
  { sourceId: "2276364", targetId: "2121221", sourceName: "constructus", targetCui: "3704221",
    evidence: "no id, Alba; ONRC 3704221 = CONSTRUCTUS SRL, only CUI with this name" },
  { sourceId: "2277867", targetId: "2127928", sourceName: "hidroconstructia", targetCui: "1556820",
    evidence: "no id, Bucharest; ONRC 1556820 = HIDROCONSTRUCTIA SA, only CUI with this name" },
  { sourceId: "2278070", targetId: "1993244", sourceName: "willkommen technik", targetCui: "39755315",
    evidence: "id RO39755319 (last digit), Bucharest; ONRC 39755315 = WILLKOMMEN TECHNIK S.R.L., only CUI with this name" },
  { sourceId: "2277828", targetId: "2127831", sourceName: "iasicon", targetCui: "1957821",
    evidence: "no id, Iasi; ONRC 1957821 = IASICON SA, only CUI with this name" },
  { sourceId: "2278519", targetId: "2081115", sourceName: "teo trans consulting", targetCui: "16572866",
    evidence: "no id; ONRC 16572866 = TEO TRANS CONSULTING SRL, only CUI with this name" },
  { sourceId: "2278500", targetId: "2081115", sourceName: "teo trans consulting", targetCui: "16572866",
    evidence: "no id, Bucharest; ONRC 16572866 = TEO TRANS CONSULTING SRL, only CUI with this name" },
  { sourceId: "2277836", targetId: "2111316", sourceName: "enel energie", targetCui: "22000460",
    evidence: "id 220000460 (extra zero), Bucharest; ONRC 22000460 = PPC ENERGIE S.A., the renamed Enel Energie" },
  { sourceId: "2277821", targetId: "2068958", sourceName: "pegani construct", targetCui: "32537801",
    evidence: "no id, Valcea; ONRC 32537801 = PEGANI CONSTRUCT S.R.L., only CUI with this name" },
  { sourceId: "2276194", targetId: "2127802", sourceName: "exco transport systems", targetCui: "2626508",
    evidence: "no id; ONRC 2626508 = EXCO TRANSPORT SYSTEMS SRL, only CUI with this name" },
  { sourceId: "2280420", targetId: "2127802", sourceName: "exco transport systems", targetCui: "2626508",
    evidence: "no id; ONRC 2626508 = EXCO TRANSPORT SYSTEMS SRL, only CUI with this name" },
  { sourceId: "2278307", targetId: "2062018", sourceName: "integra guard", targetCui: "31003163",
    evidence: "id RO310003163 (extra zero), Bucharest; ONRC 31003163 = INTEGRA GUARD SRL, only CUI with this name" },
  { sourceId: "2277268", targetId: "2162616", sourceName: "livcorvet", targetCui: "11512405",
    evidence: "id 115122405 (extra digit), Gorj; ONRC 11512405 = LIVCORVET SRL, only CUI with this name" },
  { sourceId: "2276912", targetId: "2078658", sourceName: "getica 95 com", targetCui: "7562758",
    evidence: "id 7560758 (one digit), Buzau; ONRC 7562758 = GETICA 95 COM SRL, only CUI with this name" },
  { sourceId: "2277925", targetId: "2027480", sourceName: "ekonational distribution", targetCui: "32510288",
    evidence: "id RO35210288 (digits swapped), Prahova; ONRC 32510288 = EKONATIONAL DISTRIBUTION SRL, only CUI with this name" },
  { sourceId: "2278582", targetId: "2073313", sourceName: "rard construct", targetCui: "31463080",
    evidence: "id RO3163080 (one digit missing), Neamt; ONRC 31463080 = RARD CONSTRUCT SRL, only CUI with this name" },
  { sourceId: "2276444", targetId: "2071229", sourceName: "nova power gas", targetCui: "18680651",
    evidence: "id RO18670651 (one digit); ONRC 18680651 = NOVA POWER & GAS S.A. / AMGAZ FURNIZARE SRL, only CUI with this name" },
];

/** Foreign firms stored once under country RO, merged into their twin under their own country (reviewed-foreign-twin-merges.ts). */
export interface ReviewedForeignTwinMerge {
  sourceId: string;
  targetId: string;
  /** core.entities.foreign_id_norm shared by source and target when reviewed. */
  foreignId: string;
  /** core.entities.name_normalized of the source (country RO) when reviewed. */
  sourceName: string;
  /** core.entities.name_normalized of the target when reviewed. */
  targetName: string;
  /** core.entities.country_code of the target when reviewed. */
  targetCountry: string;
  evidence: string;
}

export const REVIEWED_FOREIGN_TWIN_MERGES: readonly ReviewedForeignTwinMerge[] = [
  { sourceId: "2270125", targetId: "2270102", foreignId: "7895097", sourceName: "candu energy inc",
    targetName: "candu energy inc cei", targetCountry: "CA",
    evidence: "Candu Energy Inc., foreign id 7895097 under RO (SEAP contracts) and CA (TED, CANDU ENERGY INC.(CEI))" },
  { sourceId: "2270082", targetId: "2275287", foreignId: "1007607001228", sourceName: "turboenergy power",
    targetName: "turboenergy power", targetCountry: "MD",
    evidence: "Turboenergy Power, foreign id 1007607001228 under RO (SEAP contracts) and MD (TED lots)" },
  { sourceId: "2270605", targetId: "2275147", foreignId: "5750040554", sourceName: "koltek musavirlik",
    targetName: "koltek musavirlik", targetCountry: "TR",
    evidence: "KOLTEK MUSAVIRLIK, foreign id 5750040554 under RO (SEAP contracts) and TR (TED lots)" },
  { sourceId: "2270952", targetId: "2275637", foreignId: "03272750542", sourceName: "tr costruzioni",
    targetName: "tr costruzioni", targetCountry: "IT",
    evidence: "T.R. COSTRUZIONI S.R.L., foreign id 03272750542 under RO (SEAP contracts) and IT (TED lots)" },
  { sourceId: "2272875", targetId: "2279326", foreignId: "32543471883", sourceName: "schlumberger logelco inc",
    targetName: "schlumberger logelco inc", targetCountry: "PA",
    evidence: "Schlumberger Logelco INC, foreign id 32543471883 under RO (SEAP contracts) and PA (TED lots)" },
  { sourceId: "2273166", targetId: "2279280", foreignId: "01401230469", sourceName: "tirrena scavi spa",
    targetName: "tirrena scavi spa", targetCountry: "IT",
    evidence: "Tirrena Scavi Spa, foreign id 01401230469 under RO (SEAP contracts) and IT (TED lots)" },
];

/** Buyers shown under a supplier registration's wrong name, and town halls under a wrong name (reviewed-entity-names.ts). */
export interface ReviewedAuthorityName {
  cui: string;
  authoritySicapId: number;
  supplierSicapId: number;
  /** Name of the supplier registration, as currently displayed. */
  wrongName: string;
  /** Name of the authority registration. */
  name: string;
}

export const REVIEWED_AUTHORITY_NAMES: readonly ReviewedAuthorityName[] = [
  // ONRC 14491102 = DISTRIBUȚIE ENERGIE OLTENIA S.A.; TONIDRAG INSTAL S.R.L. is
  // ONRC 35637856 (entity of its own). Every live notice/award string for the
  // buyer reads "14491102 - DISTRIBUTIE ENERGIE OLTENIA S.A.".
  { cui: "14491102", authoritySicapId: 1417, supplierSicapId: 179348,
    wrongName: "SC TONIDRAG INSTAL SRL-D", name: "DISTRIBUTIE ENERGIE OLTENIA S.A." },
  // CUI 3552050 is the commune of Găgești, Vaslui (SICAP authority 25355). The
  // closest ONRC firm, ANDREII TEHNOMETAL S.R.L., is CUI 42429807.
  { cui: "3552050", authoritySicapId: 25355, supplierSicapId: 100116354,
    wrongName: "ANDREI TEHNOMETAL", name: "COMUNA GAGESTI (CONSILIUL LOCAL)" },
];

export interface ReviewedTownHallName { cui: string; county: string; wrongName: string; name: string }

export const REVIEWED_TOWN_HALL_NAMES: readonly ReviewedTownHallName[] = [
  // 331 contracts (981 mil. lei) and 2,889 direct acquisitions since 2018: the municipality, registered under its local
  // police's name; the only valid-CUI identity named Municipiul Alba Iulia.
  { cui: "4562923", county: "Alba", wrongName: "Municipiul Alba Iulia - Directia Politia Locala", name: "MUNICIPIUL ALBA IULIA" },
  // Dâmbovița holds no Corabia (it is in Olt); the registration names Primăria Cobia and the 21 October UAT repair
  // already links it to Cobia.
  { cui: "4449429", county: "Dambovita", wrongName: "Comuna Corabia (Primaria Cobia)", name: "COMUNA COBIA (PRIMARIA COBIA)" },
  // The registration name carries the town hall's address.
  { cui: "5303080", county: "Cluj", wrongName: "Comuna Suatu (primariasuatu,suatu nr685,jud.cluj)", name: "COMUNA SUATU (PRIMARIA SUATU)" },
];

/** Town halls tied to a same-named locality of another county (reference/authority-uat-repair.ts). */
export type AuthorityUatCorrection={entityId:string;name:string;cui:string;county:string;from:number;to:number};
export const AUTHORITY_UAT_CORRECTIONS:readonly AuthorityUatCorrection[]=[
 {entityId:'2142023',name:'COMUNA VANATORI (PRIMARIA VANATORI)',cui:'4393212',county:'Galati',from:113849,to:75150},
 {entityId:'2140064',name:'COMUNA VANATORI',cui:'4541424',county:'Iasi',from:113849,to:100086},
 {entityId:'2143042',name:'COMUNA VANATORI',cui:'5902721',county:'Mures',from:113849,to:120254},
 {entityId:'2144406',name:'Comuna Vânători (Primaria Vinatori)',cui:'4297975',county:'Vrancea',from:113849,to:178607},
 {entityId:'2146546',name:'Municipiul Sfantu Gheorghe',cui:'4404605',county:'Covasna',from:94456,to:63394},
 {entityId:'2139931',name:'Comuna Corabia (Primaria Cobia)',cui:'4449429',county:'Dambovita',from:125542,to:66580},
 {entityId:'2145835',name:'COMUNA SANTIMBRU',cui:'4562095',county:'Alba',from:86519,to:7384},
 {entityId:'2144866',name:'COMUNA CIRTA',cui:'4246122',county:'Harghita',from:144508,to:84102},
 {entityId:'2141946',name:'COMUNA SCANTEIA',cui:'4540313',county:'Iasi',from:94429,to:98916},
 {entityId:'2139141',name:'COMUNA CIOCARLIA',cui:'4514608',county:'Constanta',from:100709,to:61283},
 {entityId:'2140717',name:'COMUNA CANDESTI',cui:'4402663',county:'Dambovita',from:39967,to:66526},
];

/** Authority fragments with a mistyped CUI prefix (reference/authority-fragment-repair.ts). */
export type PinnedFragment = { prefix: string; holderId: string; targetId: string; targetCui: string; approved: boolean; evidence: string };
export const PINNED_FRAGMENTS: readonly PinnedFragment[] = [
  { prefix: '2164244', holderId: '2151208', targetId: '2205736', targetCui: '2614244', approved: true,
    evidence: 'Comuna Tibucani (Neamț): source prefix 2164244, CUI 2614244 (first two digits swapped); same name and county; '
      + 'the fragment buys 2018-04..2019-12, the commune 2020-01 onwards; no entity holds 2164244. Approved by the owner on 4 November 2026.' },
];
