/** Site identity. Observed coverage is read from the database in lib/coverage.ts. */
export const SITE_NAME = "cinecâștigă?";
export const SITE_TAGLINE = "Cine câștigă banii publici din România — și cum";
export const SITE_DESCRIPTION =
  "Achizițiile publice din România (e-licitatie.ro / SICAP), pe înțelesul tuturor: profiluri de autorități și firme, contracte, parteneri și semnale de risc, cu dovada la un click.";

export function pageTitle(t?: string): string {
  return t ? `${t} — ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`;
}
