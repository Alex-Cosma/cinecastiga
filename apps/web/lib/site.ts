/**
 * Site identity + data coverage, in one place so the header chip, metadata,
 * mails and exports agree.
 *
 * DATA_AS_OF is the last day covered by the current snapshot. The nightly
 * pipeline will set it in the environment; until then it is the frozen
 * 2026-07-31 snapshot.
 */
export const SITE_NAME = "cinecâștigă?";
export const SITE_TAGLINE = "Cine câștigă banii publici din România — și cum";
export const SITE_DESCRIPTION =
  "Achizițiile publice din România (e-licitatie.ro / SICAP), pe înțelesul tuturor: profiluri de autorități și firme, contracte, parteneri și semnale de risc, cu dovada la un click.";

export const DATA_AS_OF: string = process.env.DATA_AS_OF ?? "2026-07-31";
/** "live" once the nightly pipeline runs; "snapshot" while frozen. */
export const DATA_MODE: "live" | "snapshot" = process.env.DATA_MODE === "live" ? "live" : "snapshot";

const MONTHS_RO = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
export function formatAsOf(iso: string = DATA_AS_OF): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_RO[(m ?? 1) - 1]} ${y}`;
}

export function pageTitle(t?: string): string {
  return t ? `${t} — ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`;
}
