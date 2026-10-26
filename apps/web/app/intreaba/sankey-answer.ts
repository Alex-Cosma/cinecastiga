import { countWords, formatShare } from "../../lib/ask/answer-text";
import { divisionShortName } from "../../lib/ask/cpv-divisions";
import type { EvidenceScope } from "../../lib/ask/evidence";
import {
  SANKEY_DOMAINS, SANKEY_REST, SANKEY_SHOWN, SANKEY_SUGGEST_SHARE, sankeyShown, type SankeyData, type SankeyDomain, type SankeyPartner,
} from "../../lib/ask/sankey-shared";
import type { AskSpec } from "../../lib/ask/spec";
import { readableCpvName } from "../../lib/entity-summary";
import { cleanName, formatInt, formatRon } from "../../lib/format";
import type { KitTip } from "./builder/kit-types";

/*
 * The flow's answer as words and geometry (plan §4.9 P6–P8; final sankey §3,
 * §4; kit §6 sankey): the partners the applied question shows (6, 10 or 15)
 * and their rest, the five domains and theirs, the flows between them folded
 * to what shows, each node's facts and records, the domain suggestion and the
 * note on contracts with several winners. Pure: SankeyAnswer.tsx draws it,
 * answer-csv.ts exports the same flows.
 */

export interface FlowNode {
  id: string;
  /** Rest nodes are dotted, with no "Scoate din calcul" (final §3.4). */
  rest: boolean;
  name: string;
  /** The whole name (the menu, the title), when the label is cut. */
  full: string;
  value: number;
  count: number;
  /** "21,2%" of the flow's total. */
  share: string;
  /** "14 înregistrări · 2 domenii", "10 înregistrări · 5 firme". */
  facts: string;
  /** "Un singur contract." on a domain with one record (final §3.4). */
  single?: string;
  /** „În asociere cu X și Y (?)” on a partner that shares contracts (final §3.10, kit §6 sankey 4). */
  joint?: string;
  scope: EvidenceScope;
  scopeLabel: string;
  /** A domain one CPV level down can be opened (final §3.3): its code, below eight digits. */
  deeper?: string;
}
export interface FlowLink { partner: string; domain: string; value: number; count: number; label: string; scope: EvidenceScope }

export interface SankeyView {
  partners: FlowNode[];
  domains: FlowNode[];
  links: FlowLink[];
  total: number;
  /** „43% din valoare vine din contracte în asociere…” under the flow, when any (final §3.10). */
  joint: string | null;
}

/** The partners' noun by the centre's role (final §1): firms of an institution, institutions of a firm. */
export function flowNoun(data: Pick<SankeyData, "focal">): readonly [string, string, "f" | "m"] {
  return data.focal.role === "authority" ? ["firmă", "firme", "f"] : ["instituție", "instituții", "f"];
}
/** A domain's name: a division's short one (cpv-divisions), else the catalogue's with ș/ț, else its code. */
export function domainName(domain: Pick<SankeyDomain, "code" | "name">): string {
  if (domain.code.length === 2) return divisionShortName(domain.code);
  return domain.name ? readableCpvName(domain.name) : `CPV ${domain.code}`;
}
const cut = (name: string, max = 34) => name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;

/**
 * The flow as drawn: the first `shown` partners (sankey.shown, 6 without the key), the rest of the
 * partners as one dotted node ("alte 276 de firme"), the five domains and theirs ("alte 29 de
 * domenii"), each flow folded to those nodes.
 */
export function sankeyView(data: SankeyData, spec: Pick<AskSpec, "sankey">): SankeyView {
  const shown = Math.min(sankeyShown(spec), data.partners.length);
  const kept = data.partners.slice(0, shown), keptIds = new Set(kept.map((p) => p.entityId));
  const [one, many] = flowNoun(data);
  const total = data.totals.value;
  const share = (v: number) => total > 0 ? formatShare(v / total) : "—";
  const role = data.focal.role === "authority" ? "supplier" as const : "authority" as const;
  const focal = cleanName(data.focal.name);
  const partners: FlowNode[] = kept.map((p) => partnerNode(p, share, role, focal));
  const restPartners = data.totals.partners - shown;
  if (restPartners > 0) {
    const value = total - kept.reduce((t, p) => t + p.value, 0);
    const count = data.totals.count - kept.reduce((t, p) => t + p.count, 0);
    const name = restPartners === 1 ? `o altă ${one}` : `alte ${countWords(restPartners, one, many)}`;
    partners.push({
      id: SANKEY_REST, rest: true, name, full: name, value, count, share: share(value), facts: countWords(count, "înregistrare", "înregistrări"),
      scope: { role, excludeEntityIds: kept.map((p) => p.entityId) }, scopeLabel: `${name} · relația cu ${focal}`,
    });
  }
  const domains: FlowNode[] = data.domains.map((d) => domainNode(d, share, data.stemLen, focal));
  const restDomains = data.totals.domains - data.domains.length;
  if (restDomains > 0) {
    const value = total - data.domains.reduce((t, d) => t + d.value, 0);
    const count = data.totals.count - data.domains.reduce((t, d) => t + d.count, 0);
    const name = restDomains === 1 ? "un alt domeniu" : `alte ${countWords(restDomains, "domeniu", "domenii")}`;
    domains.push({
      id: SANKEY_REST, rest: true, name, full: name, value, count, share: share(value), facts: countWords(count, "înregistrare", "înregistrări"),
      scope: { excludeCpvPrefixes: data.domains.map((d) => d.code) }, scopeLabel: `${name} · ${focal}`,
    });
  }
  // The flows, the partners past `shown` folded into the rest (the answer holds the first 15 apart).
  const folded = new Map<string, FlowLink>();
  for (const flow of data.flows) {
    const partner = keptIds.has(flow.partnerId) ? flow.partnerId : SANKEY_REST;
    const key = `${partner}|${flow.categoryCode}`;
    const at = folded.get(key);
    if (at) { at.value += flow.value; at.count += flow.count; continue; }
    const p = partners.find((n) => n.id === partner), d = domains.find((n) => n.id === flow.categoryCode);
    folded.set(key, {
      partner, domain: flow.categoryCode, value: flow.value, count: flow.count,
      label: `${p?.full ?? "?"} → ${d?.full ?? "?"}`,
      scope: { ...p?.scope, ...(d && !d.rest ? { cpvPrefixes: [d.id] } : d?.rest ? { excludeCpvPrefixes: data.domains.map((x) => x.code) } : {}) },
    });
  }
  return {
    partners, domains, links: [...folded.values()].filter((l) => l.value > 0).sort((a, b) => b.value - a.value), total,
    joint: total > 0 && data.joint > 0 ? `${formatShare(data.joint / total)} din valoare vine din contracte în asociere, împărțite egal între câștigători.` : null,
  };
}

function partnerNode(p: SankeyPartner, share: (v: number) => string, role: "supplier" | "authority", focal: string): FlowNode {
  const full = cleanName(p.name);
  // „În asociere cu A, B și C”, „…, B, C și încă 4 firme”: the firms that won the same contracts with it.
  const names = [...(p.with ?? []).map(cleanName), ...(p.withMore ? [`încă ${countWords(p.withMore, "firmă", "firme")}`] : [])];
  const joint = names.length ? `În asociere cu ${names.length > 1 ? `${names.slice(0, -1).join(", ")} și ${names[names.length - 1]}` : names[0]}` : undefined;
  return {
    id: p.entityId, rest: false, name: cut(full), full, value: p.value, count: p.count, share: share(p.value),
    facts: `${countWords(p.count, "înregistrare", "înregistrări")} · ${countWords(p.domains, "domeniu", "domenii")}`,
    ...(joint ? { joint } : {}),
    scope: { role, entityIds: [p.entityId] }, scopeLabel: `${full} · relația cu ${focal}`,
  };
}
function domainNode(d: SankeyDomain, share: (v: number) => string, stemLen: number, focal: string): FlowNode {
  const full = domainName(d);
  return {
    id: d.code, rest: false, name: cut(full), full: `${full} · CPV ${d.code}`, value: d.value, count: d.count, share: share(d.value),
    facts: `${countWords(d.count, "înregistrare", "înregistrări")} · ${countWords(d.partners, "partener", "parteneri")}`,
    ...(d.count === 1 ? { single: "Un singur contract." } : {}),
    ...(d.code.length < 8 && (stemLen === 0 || stemLen < 8) ? { deeper: d.code } : {}),
    scope: { cpvPrefixes: [d.code] }, scopeLabel: `${full} · ${focal}`,
  };
}

/** „99,9% e Construcții · Detaliază ›” (final §3.3, trusa-5): one domain with at least 90% of the value, a level below it. */
export function sankeySuggestion(data: SankeyData): { code: string; text: string } | null {
  const top = data.domains[0];
  if (!top || data.totals.value <= 0 || top.code.length >= 8 || top.value / data.totals.value < SANKEY_SUGGEST_SHARE) return null;
  return { code: top.code, text: `${formatShare(top.value / data.totals.value)} e ${cut(domainName(top), 42)}` };
}

/** „Arată 6 · 10 · 15” (kit §6 sankey 5): the lengths, with no more than the partners the selection has. */
export function shownOptions(data: Pick<SankeyData, "totals">): { value: string; label: string; disabled?: string }[] {
  return SANKEY_SHOWN.map((n, i) => ({
    value: String(n), label: String(n),
    ...(i > 0 && data.totals.partners <= SANKEY_SHOWN[i - 1]! ? { disabled: "Selecția are mai puțini parteneri." } : {}),
  }));
}

/** The (?) of the domains (final §3.3) and of the shares (§3.2). */
export const DOMAINS_TIP: KitTip = { title: "Domenii", text: "Domeniul = codul CPV declarat de instituție pentru fiecare înregistrare. Detaliază coboară un nivel." };
export const JOINT_FLOW_TIP: KitTip = { title: "În asociere", text: "Contracte cu mai mulți câștigători: valoarea fiecăruia e împărțită egal între ei, ca să nu se numere de două ori." };

/** The bar of a partner on a phone (final §4 „Mobil”): its domains as text, largest first ("Ape uzate 99% · Construcții 1%"). */
export function partnerDomainsWords(view: SankeyView, partner: string): string {
  const own = view.links.filter((l) => l.partner === partner);
  const sum = own.reduce((t, l) => t + l.value, 0);
  const parts = own.slice(0, 2).map((l) => `${view.domains.find((d) => d.id === l.domain)?.name ?? "?"} ${sum > 0 ? formatShare(l.value / sum).replace(",0%", "%") : "—"}`);
  return own.length > 2 ? `${parts.join(" · ")} · încă ${formatInt(own.length - 2)}` : parts.join(" · ");
}

/**
 * The geometry of the flow (final §3.10): each side's nodes stacked by value with a gap, a node at least
 * `min` px tall so its label (name, value and share, records) sits beside it; what the small ones take the
 * large ones give up (each side on its own). A link is a band from its slice of the partner to its slice
 * of the domain, each as thick as its share of that node. Heights in px, for the HTML labels beside them.
 */
export interface FlowBand { link: FlowLink; y0: number; h0: number; y1: number; h1: number }
export interface FlowGeometry { height: number; left: Map<string, { y: number; h: number }>; right: Map<string, { y: number; h: number }>; bands: FlowBand[] }
export function flowGeometry(view: SankeyView, opts: { gap?: number; min?: number; perNode?: number } = {}): FlowGeometry {
  const gap = opts.gap ?? 10, min = opts.min ?? 44, perNode = opts.perNode ?? 58;
  const count = Math.max(view.partners.length, view.domains.length, 1);
  const height = Math.max(260, count * perNode);
  const stack = (nodes: readonly FlowNode[]) => {
    const free = height - gap * Math.max(0, nodes.length - 1);
    const fixed = new Set<string>();
    let scale = 0;
    // Water-filling: a node under the minimum takes it, the others share what is left by value.
    for (let pass = 0; pass <= nodes.length; pass++) {
      const open = nodes.filter((n) => !fixed.has(n.id));
      const left = free - min * fixed.size, sum = open.reduce((t, n) => t + n.value, 0);
      scale = sum > 0 ? left / sum : 0;
      const small = open.filter((n) => n.value * scale < min);
      if (!small.length) break;
      for (const n of small) fixed.add(n.id);
    }
    const out = new Map<string, { y: number; h: number }>();
    let y = 0;
    for (const n of nodes) { const h = fixed.has(n.id) ? min : n.value * scale; out.set(n.id, { y, h }); y += h + gap; }
    return out;
  };
  const left = stack(view.partners), right = stack(view.domains);
  const value = (nodes: readonly FlowNode[], id: string) => Math.max(nodes.find((n) => n.id === id)?.value ?? 0, 1);
  const usedL = new Map<string, number>(), usedR = new Map<string, number>();
  const bands = view.links.map((link): FlowBand => {
    const l = left.get(link.partner), r = right.get(link.domain);
    const h0 = l ? Math.max(0.8, l.h * link.value / value(view.partners, link.partner)) : 0.8;
    const h1 = r ? Math.max(0.8, r.h * link.value / value(view.domains, link.domain)) : 0.8;
    const y0 = (l?.y ?? 0) + (usedL.get(link.partner) ?? 0), y1 = (r?.y ?? 0) + (usedR.get(link.domain) ?? 0);
    usedL.set(link.partner, (usedL.get(link.partner) ?? 0) + h0);
    usedR.set(link.domain, (usedR.get(link.domain) ?? 0) + h1);
    return { link, y0, h0, y1, h1 };
  });
  return { height, left, right, bands };
}

/** The shown CSV's rows: the flows on screen, the partners past `shown` folded as on screen. */
export function sankeyCsvRows(data: SankeyData, spec: Pick<AskSpec, "sankey">, csvQ: (value: unknown) => string): string[] {
  const view = sankeyView(data, spec);
  const name = (nodes: readonly FlowNode[], id: string) => nodes.find((n) => n.id === id)?.full ?? id;
  return ["partener,domeniu,cod_cpv,valoare_lei,inregistrari",
    ...view.links.map((l) => [csvQ(name(view.partners, l.partner)), csvQ(name(view.domains, l.domain)), csvQ(l.domain === SANKEY_REST ? "" : l.domain), l.value, l.count].join(","))];
}

/** Domains past the first five fold into one node: the answer never draws more (final §3.4). */
export const MAX_DOMAINS = SANKEY_DOMAINS;
/** A formatted value for a node label: "332,5 mil. lei". */
export const nodeValue = (value: number) => formatRon(value);
