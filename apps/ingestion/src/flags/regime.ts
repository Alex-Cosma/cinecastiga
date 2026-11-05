import { BUYER_REGIME_OVERRIDES, cuiCorroborated, type DbSql } from "@seap/db";

export { BUYER_REGIME_OVERRIDES };

type Fragment = ReturnType<DbSql>;

/*
 * Who is bound by the DA ceilings (rf-2026.20, owner decisions of 3 November
 * 2026). Legea 98/2016 art. 4 binds public institutions, bodies governed by
 * public law and their associations; Legea 99/2016 art. 12(4) gives sectoral
 * entities (water, heat, gas, electricity, transport networks, ports and
 * airports, post, extraction) the SAME DA ceilings (135,060 / 450,200 lei
 * from June 2018, 270,120 / 900,400 from 10 September 2022), and only a
 * private operator with exclusive rights (art. 4(1)(c), art. 12(3)) may run
 * its own procedures below the EU thresholds. Sanitation is not a sectoral
 * activity. The archive has no ownership register, so the regime of a buyer
 * is read from its legal form and name, on whole words only:
 *   association    an association, foundation, federation, private club or
 *                  cooperative (OUAIs included): its regime is not verified;
 *                  no above-ceiling hit, repeated purchases at half weight
 *   private_buyer  a company (SRL/SA, or a firm with balance sheets) that is
 *                  neither state-owned nor a public operator by its name
 *                  (PUBLIC_OPERATOR_NAME): only prices just under the
 *                  ceiling and December count
 * An ADI (association of UATs) or a public club is classic.
 *   classic        everyone else, public sectoral operators included
 * All names are compared lower-case and without diacritics.
 * rf-2026.22 (owner decisions S1, S6 of 5 November 2026): an OUAI whose name
 * is misspelt ("Organiazatia", "Organiza?ia") is an association too; an ADI
 * named "ADI …" is classic, never a private buyer; and a published list of
 * reviewed buyers by CUI (BUYER_REGIME_OVERRIDES) comes before the names —
 * public operators that read like companies, private hospitals that read
 * like institutions. Ownership from the Ministry of Finance's list of public
 * enterprises replaces the names in a later version.
 */
/** Associations of private members. Not an ADI (an association of UATs is a contracting authority) or a public club. */
export const ASSOCIATION_NAME = String.raw`^(asociatia|asociatie|ouai|o\.u\.a\.i|organiza.ia|organiazatia|fundatia|federatia|clubul|club |cooperativa|uniunea)`;
/** An ADI by the start of its name ("ADI Deșeuri …"): an association of UATs, a contracting authority (Legea 98 art. 4(1)(c)). */
export const ADI_NAME = String.raw`^(adi|a\.d\.i\.?)\M|intercomunitar`;
export const PUBLIC_ASSOCIATION_NAME = String.raw`intercomunitar|\madi\M|a\.d\.i|sportiv scolar|sportiv municipal|sportiv al armatei|clubul copiilor|clubul elevilor|palatul copiilor`;
/** A company by its name. */
export const COMPANY_NAME = String.raw`\m(srl|s\.r\.l|sa|s\.a|s a|snc|sca)\M`;
/** State-owned by its name: a regie, a national company or society. */
export const STATE_OWNED_NAME = String.raw`\m(ra|r\.a|regia|regie|cn|sn|c\.n|s\.n)\M|compania nationala|societatea nationala|regia autonoma`;
/** A public institution by its name (a firm-like balance sheet alone does not make it a company). */
export const PUBLIC_NAME = String.raw`inspectorat|minister|spital|scoal|liceu|colegi|gradinit|primari|comuna|orasul|municipi|judet|universit|directia|agentia|autoritatea|institut|centrul|casa |consiliul|serviciul|politia|jandarm|unitatea militara|\mum\M|parohia|biserica|tribunal|curtea|parchet|academia|muzeul|teatrul|biblioteca|administratia|oficiul|camera |garda|ocolul|filarmonica|opera|cantina|club sportiv|palatul|registrul|arhiv|institutia|sectorul|sector [0-9]`;
/** A sectoral activity (Legea 99 art. 5–11) by whole words of the name. */
export const SECTORAL_NAME = String.raw`\m(apa|apei|apelor|canal|canalizare|aquaserv|apavital|apaserv|aparegio|apavil|termic|termica|termoficare|termo|termoenergetica|colterm|gaz|gaze|gazelor|energie|energiei|electrica|electrice|distributie|transport|transurb|transurban|transurbis|tursib|troleibuzul|tramvai|metrorex|metrou|aeroport|aeroportul|port|portul|porturilor|posta|postala|cfr|feroviar|feroviara|romgaz|depogaz|transgaz|transelectrica|hidroelectrica|nuclearelectrica)\M`;
/**
 * A company that is a public operator by its name: a sectoral activity, or a
 * local public service (water, sanitation, roads, public transport, markets,
 * public broadcasting) that a UAT or the state owns. These are public
 * enterprises or bodies governed by public law, bound by the ceilings.
 */
export const PUBLIC_OPERATOR_NAME = String.raw`${SECTORAL_NAME}|\maqua|raja|\mvital\M|c\.f\.r|utilitati|servicii publice|servicii comunitare|servicii edilitare|edilitar|gospodari|salubr|ecoaqua|drumuri|poduri|\mbus\M|\mratb|\mratc|\mratt|\murbis\M|\murban\M|metropolitan|municipal|judetean|\mlocal\M|televiziune|radiodifuziune|\mpietelor\M|\mpiete\M|parcuri|monetaria|statului|\mnational|\mincd|institutul|cercetare|spital|cimitir|spatii verzi|spatiilor verzi|domeniul public|energetic|hidro|therm|term\M|calor|\meco|edil|citadin|\mservicii\M|exploatare|electro|\mcet\M|\mgosp|goscom|\mtrans|agropiete|domeniului public|\madministrare|\madministrarea|\mpublic\M|\mdrup|comitetul|termoelectric|\murbana\M|dezvoltare locala`;
/** Known private operators with exclusive rights (art. 4(1)(c) Legea 99). */
export const PRIVATE_OPERATOR_NAME = String.raw`apa nova|veolia|e-distributie|delgaz|distrigaz|\mengie\M|\menel\M|e\.on|\meon\M`;

/*
 * Firms whose score reads differently:
 *   utility  energy, fuel, telecom, post, water: everyone buys from them, so
 *            buyer-duty criteria spread over many institutions barely count
 *            and they are no institution's "main supplier"
 *   inhouse  a firm of the commune or town (SADP, gospodărie comunală): the
 *            relationship with its owner is the in-house exception (Legea 98
 *            art. 31), so the firm has no score and is no main supplier
 */
export const UTILITY_SUPPLIER_NAME = String.raw`(posta|electrica|\menel\M|engie|e\.on|eon energie|hidroelectrica|petrom|rompetrol|\momv\M|lukoil|\mmol\M|telekom|orange|vodafone|\mdigi\M|\mrcs\M|\mapa\M|canal|termo|termic|distributie|\mgaz|transgaz|salubr|compania de apa)`;
export const INHOUSE_SUPPLIER_NAME = String.raw`(^|\s)(sadp|adp|spgc|sgu|sgc)(\s|$)|administrare a domeniului|administrarea domeniului|servicii publice|servicii comunitare|gospodarie comunala|gospodarire comunala|utilitati publice`;

/** The normalized name of entity alias `e`. */
export const entityNameSql = (sql: DbSql, alias = "e"): Fragment =>
  sql`lower(unaccent(coalesce(${sql(alias)}.name_display, '')))`;

/** Every buying institution with its regime: (eid, regime). */
export function buyerRegimeSql(sql: DbSql): Fragment {
  const classic = BUYER_REGIME_OVERRIDES.filter((o) => o.regime === "classic").map((o) => o.cui);
  const privateBuyers = BUYER_REGIME_OVERRIDES.filter((o) => o.regime === "private_buyer").map((o) => o.cui);
  return sql`
    select e.id eid,
      case
        when e.cui_canonical = any(${classic}::text[]) then 'classic'
        when e.cui_canonical = any(${privateBuyers}::text[]) then 'private_buyer'
        when n.nm ~ ${ASSOCIATION_NAME} and n.nm !~ ${PUBLIC_ASSOCIATION_NAME} then 'association'
        when n.nm ~ ${ASSOCIATION_NAME} or n.nm ~ ${ADI_NAME} then 'classic'
        when n.nm ~ ${STATE_OWNED_NAME} then 'classic'
        when e.legal_form in ('srl', 'sa', 'snc', 'sca', 'scs') or n.nm ~ ${COMPANY_NAME}
          or (n.nm !~ ${PUBLIC_NAME} and exists (
            select 1 from reference.company_financials cf where cf.cui = e.cui_canonical and ${cuiCorroborated(sql, "e")}))
          then case when n.nm ~ ${PUBLIC_OPERATOR_NAME} and n.nm !~ ${PRIVATE_OPERATOR_NAME} then 'classic' else 'private_buyer' end
        else 'classic' end regime
    from core.entities e
    cross join lateral (select ${entityNameSql(sql, "e")} nm) n
    where e.id in (select distinct authority_entity_id from core.direct_acquisitions where authority_entity_id is not null)`;
}
