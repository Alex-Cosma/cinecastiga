import type { DbSql } from "@seap/db";
import type { CorpusIdentities } from "./legacy-corpus";

/**
 * The synthetic data behind the golden legacy-link results (plan §6.2). Every
 * name except the two Alba administrations (which the RPL 2021 catalog must
 * match for per-capita and locality answers) is invented, and every figure is
 * invented. Values carry distinct cents so no ranking depends on a tie.
 * It fills a withAskFixture() copy: marts.* and the listed global tables.
 */

const id = (n: number) => 9_100_000_000 + n;
export const FIXTURE = {
  comuna: { id: id(1), name: "Comuna Fixture Vest", county: "Cluj" },
  municipiu: { id: id(2), name: "Municipiul Fixture Nord", county: "Cluj" },
  spital: { id: id(3), name: "Spitalul Judetean Fixture", county: "Buzau" },
  consiliu: { id: id(4), name: "Consiliul Judetean Alba", county: "Alba" },
  scoala: { id: id(5), name: "Scoala Gimnaziala Fixture", county: "Buzau" },
  aiud: { id: id(6), name: "Municipiul Aiud", county: "Alba" },
  agentie: { id: id(7), name: "Agentia Fixture Nationala", county: null },
  profilUnu: { id: id(11), name: "Comuna Profil Unu", county: "Cluj" },
  profilDoi: { id: id(12), name: "Comuna Profil Doi", county: "Buzau" },
  profilTrei: { id: id(13), name: "Spitalul Profil Trei", county: "Cluj" },
  construct: { id: id(101), name: "Fixture Construct SRL", county: "Cluj" },
  medical: { id: id(102), name: "Fixture Medical SRL", county: "Buzau" },
  servicii: { id: id(103), name: "Fixture Servicii SA", county: "Alba" },
  foreign: { id: id(104), name: "Fixture Foreign GmbH", county: null },
  mic: { id: id(105), name: "Fixture Mic SRL", county: "Cluj" },
  partener: { id: id(106), name: "Fixture Partener SRL", county: "Cluj" },
  firmaUnu: { id: id(111), name: "Profil Firma Unu SRL", county: "Buzau" },
  firmaDoi: { id: id(112), name: "Profil Firma Doi SRL", county: "Cluj" },
} as const;
const F = FIXTURE;
export const FIXTURE_PERSON = { key: "popescu fixture ion|1970-05-01|cluj-napoca", name: "POPESCU FIXTURE ION" };
/** An ONRC key without a usable birth date: it may merge namesakes, so it groups no firms. */
export const FIXTURE_UNIDENTIFIED_PERSON = "ionescu fixture|-|";
export const AIUD_SIRUTA = 1213;

/** The identities the corpus asks about, on the fixture. */
export const FIXTURE_IDENTITIES: CorpusIdentities = {
  authority: { id: F.municipiu.id, name: F.municipiu.name },
  authority2: { id: F.spital.id, name: F.spital.name },
  supplier: { id: F.construct.id, name: F.construct.name },
  supplier2: { id: F.partener.id, name: F.partener.name },
  pair: { authority: { id: F.comuna.id, name: F.comuna.name }, supplier: { id: F.construct.id, name: F.construct.name } },
  unrelated: { authority: { id: F.scoala.id, name: F.scoala.name }, supplier: { id: F.servicii.id, name: F.servicii.name } },
  profileAuthority: { id: F.consiliu.id, name: F.consiliu.name },
  profileSupplier: { id: F.medical.id, name: F.medical.name },
  signalAuthority: { id: F.municipiu.id, name: F.municipiu.name },
  signalSupplier: { id: F.medical.id, name: F.medical.name },
  noProfile: { id: F.agentie.id, name: F.agentie.name },
  quietAuthority: { id: F.scoala.id, name: F.scoala.name },
  county: "Cluj",
  county2: "Buzău",
  uat: { siruta: AIUD_SIRUTA, name: "mun. Aiud (Alba)" },
  person: FIXTURE_PERSON,
  unidentifiedPerson: FIXTURE_UNIDENTIFIED_PERSON,
  cpv: { word: "drumuri", word2: "medicamente", quietWord: "parcuri", code: "45233140", division: "45", group: "4523", fuzzy: "combustibil", retired: "lucrări", unknown: "zzzz necunoscut" },
  years: { a: 2024, b: 2025, c: 2026 },
};

const CPV: [string, string][] = [
  ["09000000-3", "Produse petroliere, combustibil, electricitate și alte surse de energie"],
  ["09100000-0", "Combustibili"],
  ["15000000-8", "Alimente, băuturi, tutun și produse conexe"],
  ["30000000-9", "Mașini, echipamente și consumabile de birou și de calcul"],
  ["30192000-1", "Accesorii de birou"],
  ["33000000-0", "Echipament medical, produse farmaceutice și produse de îngrijire personală"],
  ["33600000-6", "Produse farmaceutice"],
  ["33690000-3", "Medicamente diverse"],
  ["34000000-7", "Echipament de transport și produse auxiliare pentru transport"],
  ["34100000-8", "Autovehicule"],
  ["45000000-7", "Lucrări de construcții"],
  ["45200000-9", "Lucrări de construcții complete sau parțiale și lucrări publice"],
  ["45230000-8", "Lucrări de construcții de conducte, de linii de comunicații și electrice, de autostrăzi, de drumuri"],
  ["45233000-9", "Lucrări de construcții, de fundații și de îmbrăcăminte pentru autostrăzi și drumuri"],
  ["45233100-0", "Lucrări de construcții de autostrăzi și drumuri"],
  ["45233140-2", "Lucrări de drumuri"],
  ["45233200-1", "Diverse lucrări de îmbrăcăminte"],
  ["77000000-0", "Servicii agricole, forestiere, horticole, de acvacultură și de apicultură"],
  ["77310000-6", "Servicii de plantare și de întreținere a zonelor verzi"],
  ["79000000-4", "Servicii pentru întreprinderi: juridice, de marketing, de consultanță, de recrutare, de imprimare și de securitate"],
];

type Da = [n: number, authority: keyof typeof F, supplier: keyof typeof F | null, cpv: string | null, value: string, date: string, suspect?: boolean];
/** Direct acquisitions in marts.da_transactions; county is the buyer's. */
const DA: Da[] = [
  [1, "municipiu", "construct", "45233140-2", "12500.10", "2025-03-14 10:12"],
  [2, "municipiu", "construct", "45233140-2", "8300.25", "2025-07-02 09:30"],
  [3, "municipiu", "mic", "30192000-1", "950.40", "2025-01-20 12:00"],
  [4, "municipiu", "servicii", "79000000-4", "23100.00", "2024-11-05 08:45"],
  [5, "comuna", "construct", "45233140-2", "41000.55", "2025-05-09 11:20"],
  [6, "comuna", "mic", "77310000-6", "5600.00", "2024-04-18 14:05"],
  [7, "comuna", "mic", "77310000-6", "6100.35", "2025-04-22 13:40"],
  [8, "comuna", null, "09100000-0", "1200.00", "2025-02-11 10:00"],
  [9, "spital", "medical", "33690000-3", "18700.80", "2025-06-30 15:15"],
  [10, "spital", "medical", "33690000-3", "22400.15", "2026-02-03 09:05"],
  [11, "spital", "medical", "33600000-6", "9900.90", "2024-09-12 10:50"],
  [12, "spital", "foreign", "33600000-6", "31500.00", "2025-10-01 16:30"],
  // above the 2 mil. lei plausibility bound: never in a DA total
  [13, "spital", "servicii", "79000000-4", "2500000.00", "2025-08-08 12:00"],
  [14, "scoala", "mic", "30192000-1", "430.10", "2025-09-15 09:00"],
  [15, "scoala", "medical", "15000000-8", "3300.00", "2025-11-20 10:10"],
  // a zero closing value is not an acquisition total
  [16, "scoala", "construct", "45000000-7", "0", "2025-03-01 08:00"],
  [17, "agentie", "servicii", "79000000-4", "15000.00", "2025-05-05 11:00"],
  [18, "agentie", "foreign", "34100000-8", "64000.00", "2024-12-12 12:12"],
  [19, "municipiu", "partener", null, "2100.00", "2026-01-15 10:30"],
  // inside "drumuri" by code, outside it by the synonym's exclusion
  [20, "comuna", "construct", "45233200-1", "7300.70", "2025-08-19 14:00"],
  [21, "spital", "medical", "33690000-3", "14100.00", "2025-12-17 11:45", true],
];

type Contract = [n: number, authority: keyof typeof F, supplier: keyof typeof F, cpv: string, value: string, full: string, winners: number, date: string, single: boolean | null, ted: string | null];
/** One row per winner; a consortium's value is split equally (C2). */
const CONTRACTS: Contract[] = [
  [1, "municipiu", "construct", "45233140-2", "340000.00", "340000.00", 1, "2025-06-10 12:00", true, "123456-2025"],
  [2, "comuna", "construct", "45233140-2", "45000.01", "90000.02", 2, "2025-09-01 10:00", false, null],
  [2, "comuna", "partener", "45233140-2", "45000.01", "90000.02", 2, "2025-09-01 10:00", false, null],
  [3, "spital", "medical", "33600000-6", "125000.50", "125000.50", 1, "2024-03-15 09:00", null, null],
  // contracts above 2 mil. lei count in full (only DA rows have the plausibility bound)
  [4, "spital", "medical", "33690000-3", "3200000.00", "3200000.00", 1, "2026-03-20 13:00", false, "654321-2026"],
  [5, "consiliu", "servicii", "79000000-4", "87000.00", "87000.00", 1, "2025-02-25 10:30", true, null],
  [6, "aiud", "construct", "45233140-2", "56000.75", "56000.75", 1, "2026-05-05 11:00", null, null],
  [7, "agentie", "servicii", "79000000-4", "41000.00", "41000.00", 1, "2025-07-07 15:00", null, null],
  [8, "municipiu", "servicii", "79000000-4", "22000.00", "22000.00", 1, "2024-10-10 10:00", false, null],
  // after the contracts' complete-until day: provisional
  [9, "scoala", "medical", "15000000-8", "8800.00", "8800.00", 1, "2026-06-20 09:00", null, null],
];

/** Historical risk profiles (marts.entity_flags): a different population from the transactions. */
type Profile = [entity: keyof typeof F, role: "authority" | "supplier", nDas: number, total: string | null, cri: string | null, flags: string[]];
const PROFILES: Profile[] = [
  ["municipiu", "authority", 34, "51234.50", "0.4210", ["da_split", "da_year_end"]],
  ["comuna", "authority", 18, "30500.00", "0.6630", ["da_split", "da_rapid", "da_round"]],
  ["spital", "authority", 45, "98700.10", "0.8120", ["da_split", "da_year_end", "da_rapid", "da_concentration"]],
  // total and count are those of its core.direct_acquisitions below: its sources reconcile
  ["consiliu", "authority", 12, null, "0.2740", ["da_concentration"]],
  ["aiud", "authority", 10, null, "0.1510", []],
  ["scoala", "authority", 9, "4100.00", "0.5050", ["da_round"]],
  ["profilUnu", "authority", 22, "77000.00", "0.9330", ["da_split", "da_year_end", "da_rapid", "da_round", "da_concentration"]],
  ["profilDoi", "authority", 27, "15500.00", "0.0520", []],
  ["profilTrei", "authority", 31, "260000.00", null, []],
  ["construct", "supplier", 24, "88000.00", "0.5810", ["da_concentration", "da_dependence"]],
  ["medical", "supplier", 40, "140000.00", "0.3620", ["da_dependence"]],
  ["servicii", "supplier", 15, "60000.00", "0.7140", ["da_round", "da_concentration", "da_dependence"]],
  ["mic", "supplier", 11, "13000.00", "0.1240", []],
  ["firmaUnu", "supplier", 26, "45000.00", "0.8870", ["da_split", "da_round", "da_concentration", "da_dependence"]],
  ["firmaDoi", "supplier", 13, "9000.00", "0.4730", ["da_rapid"]],
];

/** Latest MF filing (employees, year, turnover) of the firms that filed one. */
const FILINGS: Partial<Record<keyof typeof F, [number, number, string]>> = {
  construct: [3, 2024, "410000.00"], medical: [40, 2024, "5200000.00"], servicii: [300, 2024, "31000000.00"],
  mic: [0, 2023, "52000.00"], partener: [12, 2024, "900000.00"], firmaUnu: [7, 2024, "300000.00"], firmaDoi: [55, 2024, "2400000.00"],
};

/** The two Alba profiles' historical acquisitions, which also are their marts rows. */
function albaAcquisitions(): Da[] {
  const rows: Da[] = [];
  for (let n = 1; n <= 10; n++)
    rows.push([100 + n, "aiud", n % 3 === 0 ? "construct" : "servicii", n % 3 === 0 ? "45233140-2" : "79000000-4",
      (1000 + n * 137.13).toFixed(2), `2025-${String(n).padStart(2, "0")}-0${(n % 9) + 1} 10:00`]);
  for (let n = 1; n <= 12; n++)
    rows.push([200 + n, "consiliu", n % 2 ? "servicii" : "medical", n % 2 ? "79000000-4" : "33690000-3",
      (2000 + n * 211.07).toFixed(2), `${2024 + (n % 3)}-${String(((n * 5) % 6) + 1).padStart(2, "0")}-1${n % 10} 09:00`]);
  return rows;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function seedGoldenFixture(q: DbSql): Promise<void> {
  // CPV catalogue and the curated subjects (one with an exclusion, migration 0081).
  for (const [code, name] of CPV) await q`insert into core.cpv_codes (code, name_ro, revision, division) values (${code}, ${name}, '2008', ${code.slice(0, 2)})`;
  await q.unsafe("alter table reference.cpv_synonym add column if not exists exclude boolean");
  await q`insert into reference.cpv_synonym (term, cpv_prefix, note, exclude) values
    ('drumuri', '45233', 'Include lucrările de îmbrăcăminte ale drumurilor.', false),
    ('drumuri', '452332', null, true),
    ('medicamente', '336', null, false),
    ('parcuri', '7731', 'Include întreținerea zonelor verzi.', false)`;

  // Identities: every entity, with a valid CUI so strict joins (per capita, ONRC) can use it.
  for (const [key, e] of Object.entries(F)) {
    const foreign = key === "foreign";
    await q`insert into core.entities (id, cui_canonical, cui_valid, name_display, name_normalized, county, country_code, is_foreign)
      values (${e.id}, ${foreign ? null : String(91_000_000 + (e.id % 1000))}, ${!foreign}, ${e.name}, ${fold(e.name)}, ${e.county}, ${foreign ? "DE" : "RO"}, ${foreign})`;
  }
  await q`insert into reference.uat (siruta, name, county, tip, population) values (${AIUD_SIRUTA}, 'Aiud', 'Alba', '1', 22000)`;
  await q`insert into reference.authority_uat (entity_id, uat_siruta, population) values (${F.aiud.id}, ${AIUD_SIRUTA}, null)`;
  for (const firm of [F.construct, F.mic])
    await q`insert into reference.company_reps (j_number, cui, person_name, calitate, birth_date, birth_locality, person_key, snapshot_date)
      values (${`J12/${firm.id % 1000}/2010`}, ${String(91_000_000 + (firm.id % 1000))}, ${FIXTURE_PERSON.name}, 'Administrator', '1970-05-01', 'Cluj-Napoca', ${FIXTURE_PERSON.key}, '2026-09-01')`;
  await q`insert into reference.company_reps (j_number, cui, person_name, calitate, birth_date, person_key, snapshot_date)
    values ('J10/9/2015', ${String(91_000_000 + (F.medical.id % 1000))}, 'IONESCU FIXTURE', 'Administrator', null, ${FIXTURE_UNIDENTIFIED_PERSON}, '2026-09-01')`;

  // Transactions.
  const cpvName = new Map(CPV);
  const da = [...DA, ...albaAcquisitions()];
  for (const [n, a, s, cpv, value, date, suspect] of da) {
    const authority = F[a], supplier = s ? F[s] : null;
    await q`insert into marts.da_transactions (sicap_da_id, da_code, authority_id, authority_name, supplier_id, supplier_name, county, cpv_code, cpv_name,
        acquisition_type, estimated_value_ron, closing_value, publication_date, finalization_date, value_suspect)
      values (${id(100_000 + n)}, ${`DA-FX-${n}`}, ${authority.id}, ${authority.name}, ${supplier?.id ?? null}, ${supplier?.name ?? null}, ${authority.county},
        ${cpv}, ${cpv ? cpvName.get(cpv) ?? null : null}, 'Furnizare', ${value === "0" ? "100.00" : value}, ${value}, ${date}, ${date}, ${suspect === true})`;
  }
  for (const [n, a, s, cpv, value, full, winners, date, single, ted] of CONTRACTS) {
    const authority = F[a], supplier = F[s];
    await q`insert into marts.contract_transactions (contract_id, supplier_id, contract_no, ca_notice_id, notice_no, authority_id, authority_name, supplier_name,
        county, cpv_code, cpv_name, procedure_type, acquisition_type, closing_value, contract_value_full, n_winners, finalization_date, tenders_received,
        is_single_bidder, also_in_ted, ted_pubnum)
      values (${id(200_000 + n)}, ${supplier.id}, ${`CT-FX-${n}`}, ${id(300_000 + n)}, ${`CAN-FX-${n}`}, ${authority.id}, ${authority.name}, ${supplier.name},
        ${authority.county}, ${cpv}, ${cpvName.get(cpv) ?? null}, 'Licitatie deschisa', 'Lucrari', ${value}, ${full}, ${winners}, ${date},
        ${single === null ? null : single ? 1 : 3}, ${single}, ${ted !== null}, ${ted})`;
  }
  for (const n of [...new Set(CONTRACTS.map((c) => c[0]))])
    await q`insert into core.contracts (id, raw_id, ca_notice_contract_id, ca_notice_id, contract_no, title, contract_date)
      values (${id(200_000 + n)}, 1, ${id(400_000 + n)}, ${id(300_000 + n)}, ${`CT-FX-${n}`}, ${`Contract fixture ${n}`}, ${CONTRACTS.find((c) => c[0] === n)![7]})`;
  // Source documents of two acquisitions give the source rows their title.
  await q`insert into raw.raw_documents (id, source, external_id, endpoint_version, content_hash, payload) values
    (${id(500_001)}, 'sicap', 'DA-FX-1', 'v1', 'fixture-1', ${JSON.stringify({ directAcquisitionName: "Reparații drum comunal" })}::jsonb),
    (${id(500_101)}, 'sicap', 'DA-FX-101', 'v1', 'fixture-101', ${JSON.stringify({ directAcquisitionName: "Servicii de consultanță" })}::jsonb)`;
  // Historical acquisitions behind the profiles (core): accepted rows only count; one refusal shows it.
  for (const [n, a, s, cpv, value, date] of da.filter(([n]) => n === 1 || n > 100))
    await q`insert into core.direct_acquisitions (id, raw_id, da_code, sicap_da_id, authority_entity_id, supplier_entity_id, cpv_code, cpv_valid, estimated_value_ron,
        closing_value, publication_date, finalization_date, state, acquisition_type)
      values (${id(600_000 + n)}, ${n === 1 || n === 101 ? id(500_000 + n) : null}, ${`DA-FX-${n}`}, ${id(100_000 + n)}, ${F[a].id}, ${s ? F[s].id : null}, ${cpv}, true, ${value},
        ${value}, ${`${date}:00+03`}, ${`${date}:00+03`}, 'Oferta acceptata', 'Furnizare')`;
  await q`insert into core.direct_acquisitions (id, da_code, sicap_da_id, authority_entity_id, supplier_entity_id, cpv_code, closing_value, finalization_date, state)
    values (${id(600_999)}, 'DA-FX-999', ${id(100_999)}, ${F.consiliu.id}, ${F.servicii.id}, '79000000-4', 5000, '2025-03-03 10:00:00+03', 'Oferta respinsa')`;

  // Coverage of the archive: 2024–2026, the last year in part, contracts provisional after 31 May.
  for (const kind of ["da", "award"]) for (const year of [2024, 2025, 2026])
    await q`insert into marts.national_stats (kind, year, n, total_ron) values (${kind}, ${year}, 1, 1)`;
  await q`insert into marts.data_coverage (dataset, observation, calculated_at) values
    ('da', ${JSON.stringify({ date_from: "2024-01-08", date_to: "2026-06-20" })}::jsonb, '2026-06-26 03:00:00+03'),
    ('contracts', ${JSON.stringify({ date_from: "2024-02-01", date_to: "2026-06-25", complete_until: "2026-05-31" })}::jsonb, '2026-06-26 03:00:00+03')`;
  for (const county of ["Alba", "Buzau", "Cluj"])
    await q`insert into marts.spend_by_county (county, role, n, total_ron) values (${county}, 'authority', 1, 1)`;

  // Entity profiles: totals from the rows above, as the marts build derives them (and monitoring/validate.ts checks):
  // the direct acquisitions up to the ceiling, the distinct contracts, each with a positive value.
  for (const [key, e] of Object.entries(F)) {
    const filing = FILINGS[key as keyof typeof F];
    for (const role of ["authority", "supplier"] as const) {
      const column = role === "authority" ? q`authority_id` : q`supplier_id`;
      const [t] = await q`
        select (select count(*)::int from marts.da_transactions where ${column} = ${e.id} and closing_value > 0 and closing_value <= 2000000) n_das,
               (select count(distinct contract_id)::int from marts.contract_transactions where ${column} = ${e.id} and closing_value > 0) n_contracts,
               (select coalesce(sum(closing_value), 0) from marts.da_transactions where ${column} = ${e.id} and closing_value > 0 and closing_value <= 2000000)
                 + (select coalesce(sum(closing_value), 0) from marts.contract_transactions where ${column} = ${e.id}) split,
               (select coalesce(sum(closing_value), 0) from marts.da_transactions where ${column} = ${e.id} and closing_value > 0)
                 + (select coalesce(sum(contract_value_full), 0) from marts.contract_transactions where ${column} = ${e.id}) full_value,
               least((select min(finalization_date) from marts.da_transactions where ${column} = ${e.id}),
                     (select min(finalization_date) from marts.contract_transactions where ${column} = ${e.id})) first_activity,
               greatest((select max(finalization_date) from marts.da_transactions where ${column} = ${e.id}),
                        (select max(finalization_date) from marts.contract_transactions where ${column} = ${e.id})) last_activity
      ` as unknown as { n_das: number; n_contracts: number; split: string; full_value: string; first_activity: string | null; last_activity: string | null }[];
      const profiled = PROFILES.some(([k, r]) => k === key && r === role);
      if (!t || (t.n_das + t.n_contracts === 0 && !profiled)) continue;
      await q`insert into marts.entity_profile (entity_id, role, n_contracts, n_das, total_ron_full, total_ron_split, first_activity, last_activity,
          name_display, county, country_code, is_foreign, uat_siruta, population, employees, employees_year, net_turnover)
        values (${e.id}, ${role}, ${t.n_contracts}, ${t.n_das}, ${t.full_value}, ${t.split}, ${t.first_activity}, ${t.last_activity},
          ${e.name}, ${e.county}, ${key === "foreign" ? "DE" : "RO"}, ${key === "foreign"}, ${key === "aiud" ? AIUD_SIRUTA : null}, null,
          ${role === "supplier" ? filing?.[0] ?? null : null}, ${role === "supplier" ? filing?.[1] ?? null : null}, ${role === "supplier" ? filing?.[2] ?? null : null})`;
    }
  }
  for (const [key, role, nDas, total, cri, flags] of PROFILES) {
    const e = F[key];
    const [own] = total === null ? await q`select coalesce(sum(closing_value), 0)::text v from core.direct_acquisitions
      where authority_entity_id = ${e.id} and state = 'Oferta acceptata'` as unknown as { v: string }[] : [{ v: total }];
    await q`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, cri, n_flags, flags, cui_canonical)
      values (${e.id}, ${role}, ${e.name}, ${e.county}, ${nDas}, ${own!.v}, ${cri}, ${flags.length}, ${JSON.stringify(flags)}::jsonb, ${String(91_000_000 + (e.id % 1000))})`;
  }

  // The agg_* fast paths, with the marts build's own definitions (transaction-marts.ts).
  await q`insert into marts.agg_map_county
    select county, coalesce(sum(cv) filter (where plaf), 0), count(*) filter (where plaf), coalesce(sum(cv), 0), count(*)
    from (select county, closing_value cv, (closing_value <= 2000000) plaf from marts.da_transactions where closing_value > 0
          union all select county, closing_value, true from marts.contract_transactions where closing_value > 0) x
    where county is not null group by county`;
  await q`insert into marts.agg_national
    select src, coalesce(sum(cv) filter (where plaf), 0), count(*) filter (where plaf), coalesce(sum(cv), 0), count(*)
    from (select 'da'::text src, closing_value cv, (closing_value <= 2000000) plaf from marts.da_transactions where closing_value > 0
          union all select 'contracts', closing_value, true from marts.contract_transactions where closing_value > 0) x
    group by src`;
  await q`insert into marts.agg_years
    select y, coalesce(sum(cv) filter (where plaf), 0), count(*) filter (where plaf), coalesce(sum(cv), 0), count(*)
    from (select substr(finalization_date, 1, 4) y, closing_value cv, (closing_value <= 2000000) plaf from marts.da_transactions where closing_value > 0
          union all select substr(finalization_date, 1, 4), closing_value, true from marts.contract_transactions where closing_value > 0) x
    where y is not null group by y`;
  await q`insert into marts.agg_top_entities
    with base as (
      select authority_id eid, 'authority'::text role, authority_name nm, closing_value cv, (closing_value <= 2000000) plaf from marts.da_transactions where closing_value > 0
      union all select authority_id, 'authority', authority_name, closing_value, true from marts.contract_transactions where closing_value > 0
      union all select supplier_id, 'supplier', supplier_name, closing_value, (closing_value <= 2000000) from marts.da_transactions where closing_value > 0
      union all select supplier_id, 'supplier', supplier_name, closing_value, true from marts.contract_transactions where closing_value > 0
    ), g as (
      select role, eid, max(nm) nm, coalesce(sum(cv) filter (where plaf), 0) v_plaf, count(*) filter (where plaf) n_plaf,
             coalesce(sum(cv), 0) v_all, count(*) n_all
      from base where eid is not null group by role, eid
    )
    select g.role, g.eid, g.nm, ep.county, g.v_plaf, g.n_plaf, g.v_all, g.n_all
    from g left join marts.entity_profile ep on ep.entity_id = g.eid and ep.role = g.role`;
}
