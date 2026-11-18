import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import { FLAG_META, FLAG_ORDER, flagLabel } from "@/lib/flags";
import Link from "next/link";
import { cleanName } from "@/lib/format";
import EntityCrumb from "../EntityCrumb";
import { ghostHold } from "@/lib/ghost-hold";
import { RISK_CRITERIA, riskPoints } from "@/lib/risk-score";
import { parseRoleParam } from "@/lib/role-param";
import { readSignalCase } from "@/lib/signal-case";
import { getEntitySignalCounts, parseSignalState } from "@/lib/signals";
import CasePage from "@/app/semnale/case/CasePage";
import DropRolParam from "../DropRolParam";
import CaseRegion from "./CaseRegion";
import "./entity-signals.css";
import { loadFlags, loadProfile, validId } from "./load";

/*
 * An entity's signals, one pattern a page (owner, 6 November 2026: under /entitati/{id}/ like its other analyses,
 * `?tip=` the pattern, `?rol=` only for an entity that both buys and sells). Without `tip`, the pattern with the most
 * points, else the first signal found, in the entity page's order. The page itself is the case page (Oglinda).
 * Loading (owner, 6 November 2026): a slow route, so a ghost (loading.tsx) while the server reads the case; the layout
 * answers a missing entity with a 404 before it. Its tabs and pager keep the shown case in place, dimmed (CaseRegion).
 */

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function resolve(id: string, sp: Search) {
  const [flags, profile] = await Promise.all([loadFlags(id), loadProfile(id)]);
  if (!profile) return null;
  const roles = [...new Set([...flags.map((r) => r.role), ...profile.roles.map((r) => r.role)])];
  const role = parseRoleParam(one(sp["rol"])) ?? roles[0] ?? "authority";
  let tip = one(sp["tip"]);
  if (!tip || !Object.hasOwn(FLAG_META, tip)) {
    const row = flags.find((r) => r.role === role);
    const points = row ? riskPoints(row.scoreParts, row.score) : {};
    tip = (Object.entries(points) as [string, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!tip) {
      const counts = await getEntitySignalCounts(id, role);
      const criteria = RISK_CRITERIA[role] as readonly string[];
      tip = [...criteria, ...FLAG_ORDER.filter((c) => !criteria.includes(c)), ...Object.keys(counts)].find((c) => (counts[c] ?? 0) > 0 && FLAG_META[c]);
    }
  }
  const p = one(sp["p"]);
  // No signal at all (UX audit bug, 16 November 2026): the page says so instead of an empty first pattern („De 0 ori…”).
  return { profile, role, bothRoles: roles.length > 1, none: !tip, state: parseSignalState({ tip: tip ?? "da_split", rol: role, ent: id, ...(p ? { p } : {}) }) };
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }): Promise<Metadata> {
  const { id } = await params;
  if (!validId(id)) return { title: "Semnale" };
  const r = await resolve(id, await searchParams).catch(() => null);
  // „Reprezentant comun” lists people by name (owner, 18 November 2026, legal audit): out of search engines, links followed.
  return { title: r ? `${r.none ? "Semnale" : flagLabel(r.state.code)} · ${cleanName(r.profile.name)}` : "Semnale",
    ...(r && !r.none && r.state.code === "net_shared_admin" ? { robots: { index: false, follow: true } } : {}) };
}

export default async function EntitySignalsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  await ghostHold();
  const { id } = await params;
  const sp = await searchParams;
  await redirectCanonicalEntity(id, "/semnale", sp);
  if (!validId(id)) notFound();
  const r = await resolve(id, sp);
  if (!r) notFound();
  if (r.none) {
    const name = cleanName(r.profile.name) || `entitatea ${id}`;
    return <div className="sgc">
      <EntityCrumb id={id} name={name} role={r.role} bothRoles={r.bothRoles} current="Semnale" />
      <h1 className="sgc-title">Niciun semnal</h1>
      <div className="sgc-empty"><p>Nu am găsit niciun tipar în înregistrările {r.role === "authority" ? "acestei instituții" : "acestei firme"}. Lipsa unui tipar nu certifică absența neregulilor.</p>
        {/* The method: Complet's (owner, 18 November 2026). */}
        <p data-only="complet"><Link href="/metodologie#indice">Ce tipare căutăm →</Link></p></div>
    </div>;
  }
  const data = await readSignalCase({ ...r.state, entity: id });
  if (!data) notFound();
  return <>
    {!r.bothRoles && sp["rol"] !== undefined && <DropRolParam />}
    <CaseRegion><CasePage data={data} state={r.state} /></CaseRegion>
  </>;
}
