/**
 * The page of an institution or a firm. A role opens the page as that party (`?rol=`), which matters only for an
 * entity that is both; the page falls back to its first role when the one asked for is not its own.
 */
export type EntityRole = "authority" | "supplier";

export function entityHref(id: string | number, role?: EntityRole | null): string {
  const rol = role === "authority" ? "autoritate" : role === "supplier" ? "furnizor" : null;
  return `/entitati/${encodeURIComponent(String(id))}${rol ? `?rol=${rol}` : ""}`;
}
