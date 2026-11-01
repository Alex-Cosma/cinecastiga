import { createDb, onrcIdentityBirthDate, type DbSql } from "@seap/db";
import { onrcBirthYear } from "./format";

/*
 * An individual practice — PFA, întreprindere individuală, cabinet individual
 * (psiholog, medic, avocat), birou notarial — is one person working on their
 * own; the holder's name is in the entity's name. ONRC lists no representative
 * for it (the cabinets are registered with their professional body, the PFA's
 * holder is not in the representatives' file), so nothing links it to the
 * firms the same person administers.
 *
 * Owner decision of 1 November 2026 (variant B): when the holder's name matches
 * exactly one dated ONRC representative, the page says so as a lead, never as a
 * fact: "Același nume în Registrul Comerțului …, potrivire doar după nume". The
 * match never enters a signal, the risk score, Ask's "conduse azi de" or any
 * count of a person's firms.
 */

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The forms, in the order they are tried, on the folded name. */
const FORMS: { form: IndividualForm; pattern: RegExp }[] = [
  { form: "psiholog", pattern: /cabinet (individual )?de psiholog[a-z]*|cabinet individual de psiholog[a-z]*/ },
  { form: "medic", pattern: /cabinet (medical|stomatologic|de medicina)[a-z ]* individual|cabinet medical individual/ },
  { form: "avocat", pattern: /cabinet (individual )?de avocat|^cabinet avocat/ },
  { form: "notar", pattern: /birou (individual )?notarial|^notar public/ },
  { form: "pfa", pattern: /(^| )(p ?f ?a|persoana fizica autorizata)( |$)/ },
  { form: "ii", pattern: /(^| )(i ?i|intreprindere individuala)( |$)/ },
];
export type IndividualForm = "psiholog" | "medic" | "avocat" | "notar" | "pfa" | "ii";

/** The words of the form and titles, never part of the holder's name. */
const NOISE = /cabinet|individual[a-z]*|de|psiholog[a-z]*|medical|stomatologic|medicina|avocat|birou|notarial|notar|public|persoana|fizica|autorizata|intreprindere|pfa|p f a|ii|i i|dr|doctor|prof|ing|ec|av/g;

/** The practice's form and its holder's folded name ("nastasa maria monica"), or null. */
export function individualHolder(entityName: string | null | undefined): { form: IndividualForm; holder: string } | null {
  if (!entityName) return null;
  const spaced = fold(entityName).replace(/[^a-z]+/g, " ").trim();
  const form = FORMS.find((f) => f.pattern.test(spaced))?.form;
  if (!form) return null;
  // "P.F.A." and "I.I." spaced out are letters, not words: drop the phrase before the words.
  const holder = ` ${spaced} `.replace(/ (p f a|i i) /g, " ").trim()
    .split(" ").filter((w) => w && !new RegExp(`^(${NOISE.source})$`).test(w)).join(" ");
  // At least a surname and a first name: a single word matches too many people.
  return holder.split(" ").length >= 2 && holder.length >= 5 ? { form, holder } : null;
}

export interface HolderTwin {
  personKey: string;
  name: string;
  birthYear: number | null;
  locality: string | null;
  /** Firms the person represents in ONRC. */
  firms: number;
}

/** The one dated ONRC representative with the holder's name, or null (none, or namesakes). */
export async function readHolderTwin(q: DbSql, entityName: string | null | undefined): Promise<HolderTwin | null> {
  const found = individualHolder(entityName);
  if (!found) return null;
  const rows = (await q`
    select r.person_key, max(r.person_name) nm, max(extract(year from r.birth_date))::int by,
           max(extract(year from r.snapshot_date))::int sy, max(r.birth_locality) bl, count(distinct r.cui)::int firms
    from reference.company_reps r
    where split_part(r.person_key, '|', 1) = ${found.holder} and ${onrcIdentityBirthDate(q, "r")}
    group by r.person_key
    limit 2
  `) as unknown as { person_key: string; nm: string; by: number | null; sy: number | null; bl: string | null; firms: number }[];
  if (rows.length !== 1) return null;
  const r = rows[0]!;
  const { birthYear } = onrcBirthYear(r.by, r.sy);
  return { personKey: r.person_key, name: r.nm, birthYear, locality: r.bl && /\p{L}/u.test(r.bl) ? r.bl : null, firms: Number(r.firms) };
}

const g = globalThis as unknown as { __seapHolderSql?: DbSql };
export const getHolderTwin = (entityName: string | null | undefined) => readHolderTwin((g.__seapHolderSql ??= createDb().sql), entityName);
