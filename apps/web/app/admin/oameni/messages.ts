/*
 * The outcomes of the account commands (owner, 7 November 2026): the server actions (../actions.ts) redirect with a
 * short code (?ok=… or ?err=…) and the page shows its Romanian text; a raw library message never reaches the page.
 * An error says where it belongs: in the new-account form or above the accounts table.
 */
export const ACCOUNT_SUCCESS = {
  creat: "Contul a fost creat. Trimite-i parola pe alt canal.",
  parola: "Parola a fost schimbată; sesiunile lui s-au închis.",
  dezactivat: "Contul a fost dezactivat.",
  reactivat: "Contul a fost reactivat.",
  deconectat: "Contul a fost deconectat de pe toate dispozitivele.",
} as const;
export type AccountSuccess = keyof typeof ACCOUNT_SUCCESS;

type Place = "create" | "list";
export const ACCOUNT_ERRORS = {
  "creare-date": { at: "create", text: "Completează emailul și parola." },
  "creare-email": { at: "create", text: "Emailul nu este valid." },
  "creare-exista": { at: "create", text: "Există deja un cont cu acest email." },
  "creare-parola": { at: "create", text: "Parola trebuie să aibă minimum 10 caractere." },
  "creare-parola-lunga": { at: "create", text: "Parola poate avea cel mult 128 de caractere." },
  creare: { at: "create", text: "Contul nu a putut fi creat. Încearcă din nou." },
  "creare-cod": { at: "list", text: "Contul a fost creat, dar codul pe email nu s-a putut activa, așa că l-am dezactivat." },
  "creare-cod-activ": { at: "list", text: "Contul a fost creat, dar codul pe email nu s-a putut activa. Dezactivează-l până se rezolvă." },
  "parola-scurta": { at: "list", text: "Parola nouă trebuie să aibă minimum 10 caractere." },
  "parola-lunga": { at: "list", text: "Parola nouă poate avea cel mult 128 de caractere." },
  parola: { at: "list", text: "Parola nu a putut fi schimbată. Încearcă din nou." },
  "parola-sesiuni": { at: "list", text: "Parola a fost schimbată, dar sesiunile nu s-au închis. Folosește „Deconectează”." },
  "dezactivat-sesiuni": { at: "list", text: "Contul a fost dezactivat, dar sesiunile nu s-au închis. Folosește „Deconectează”." },
  deconectare: { at: "list", text: "Contul nu a putut fi deconectat. Încearcă din nou." },
  "cont-negasit": { at: "list", text: "Contul nu mai există." },
  "contul-tau": { at: "list", text: "Propriul cont se gestionează din pagina contului." },
  actiune: { at: "list", text: "Operațiunea nu a reușit. Încearcă din nou." },
} as const satisfies Record<string, { at: Place; text: string }>;
export type AccountError = keyof typeof ACCOUNT_ERRORS;

/** The success line for `?ok=`, or null. */
export function successText(code: string | undefined): string | null {
  return code && Object.hasOwn(ACCOUNT_SUCCESS, code) ? ACCOUNT_SUCCESS[code as AccountSuccess] : null;
}

/** The error for `?err=`; an unknown code (an old link, a hand-made address) reads as the generic failure. */
export function errorOf(code: string | undefined): { at: Place; text: string } | null {
  if (!code) return null;
  return Object.hasOwn(ACCOUNT_ERRORS, code) ? ACCOUNT_ERRORS[code as AccountError] : ACCOUNT_ERRORS.actiune;
}

/** A Romanian count: „niciun mesaj”, „1 mesaj”, „3 mesaje”, „20 de mesaje”, „101 mesaje”. */
export function counted(n: number, one: string, many: string, none: string): string {
  if (n === 0) return none;
  if (n === 1) return `1 ${one}`;
  const rest = n % 100;
  return `${n.toLocaleString("ro-RO")} ${rest === 0 || rest >= 20 ? "de " : ""}${many}`;
}
