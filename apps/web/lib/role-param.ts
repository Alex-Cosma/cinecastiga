/**
 * The `rol` URL value, one reading for every page and route (audit Q3F7, 5 Nov 2026). Entity pages and their APIs
 * write the Romanian spelling (`furnizor`, `autoritate`); /semnale writes the English one (`supplier`, `authority`).
 * Each read only its own, so `/semnale?rol=furnizor` showed institutions. Both spellings are read everywhere; anything
 * else is null and each caller keeps its own default.
 */
export type RoleParam = "authority" | "supplier";

export function parseRoleParam(value: unknown): RoleParam | null {
  switch (value) {
    case "furnizor":
    case "supplier":
      return "supplier";
    case "autoritate":
    case "authority":
      return "authority";
    default:
      return null;
  }
}
