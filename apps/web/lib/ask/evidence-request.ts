import { DRILL_SORTS, type DrillOpts, type DrillSort } from "./compile";
import { validateEvidenceScope } from "./evidence";

export function evidenceOptions(body: Record<string, unknown>): DrillOpts | { error: string } {
  const opts: DrillOpts = {};
  if (body["sort"] !== undefined) {
    if (typeof body["sort"] !== "string" || !Object.hasOwn(DRILL_SORTS, body["sort"])) return { error: "Sortare invalidă." };
    opts.sort = body["sort"] as DrillSort;
  }
  if (body["dir"] !== undefined) {
    if (body["dir"] !== "asc" && body["dir"] !== "desc") return { error: "Ordine invalidă." };
    opts.dir = body["dir"];
  }
  if (body["stream"] !== undefined && body["stream"] !== "") {
    if (body["stream"] !== "da" && body["stream"] !== "contracts") return { error: "Sursă invalidă." };
    opts.stream = body["stream"];
  }
  for (const key of ["search", "state"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > (key === "search" ? 200 : 100)) return { error: "Filtru de surse invalid." };
    if (value.trim()) opts[key] = value.trim();
  }
  const scope = validateEvidenceScope(body["scope"]);
  if ("error" in scope) return scope;
  if (Object.keys(scope).length) opts.scope = scope;
  return opts;
}
