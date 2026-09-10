import { sessionUserId } from "@/lib/session";
import { getDosar, type ClipRow } from "@/lib/anchete";
import { encodeSpec } from "@/lib/ask/permalink";
import { FLAG_META } from "@/lib/flags";

/**
 * Evidence-annex export: numbered probe with internal permalinks + the
 * snapshot values and their capture date. Derived numbers always leave with
 * the methodology version and the signal-not-proof caveat.
 */

const KIND_TITLE: Record<string, string> = {
  entity: "Entități",
  contract: "Contracte",
  notice: "Anunțuri de atribuire",
  person: "Persoane",
  query: "Interogări și grafice",
  flag: "Semnale de risc",
  note: "Note",
};

function ron(v: unknown): string {
  const n = Number(v ?? 0);
  return `${new Intl.NumberFormat("ro-RO").format(Math.round(n))} lei`;
}

function clipLink(c: ClipRow, base: string): string | null {
  switch (c.kind) {
    case "entity":
      return `${base}/entitati/${c.refId}`;
    case "contract":
      return `${base}/contracte/${c.refId}`;
    case "notice":
      return `${base}/anunturi/${c.refId}`;
    case "person": {
      const spec = {
        block: "table",
        measure: "value",
        filters: { adminPersonKey: c.refId },
        dim: "supplier",
      };
      return `${base}/?spec=${encodeURIComponent(encodeSpec(spec))}`;
    }
    case "query":
      return c.spec ? `${base}/?spec=${encodeURIComponent(encodeSpec(c.spec))}` : null;
    case "flag":
      return `${base}/entitati/${c.refId}`;
    default:
      return null;
  }
}

function clipBody(c: ClipRow): string {
  const s = c.snapshot ?? {};
  switch (c.kind) {
    case "entity": {
      const roles = (s["roles"] ?? {}) as Record<
        string,
        { nDas?: number; nContracts?: number; totalRon?: number }
      >;
      const parts: string[] = [];
      if (roles["authority"])
        parts.push(`ca autoritate: ${ron(roles["authority"].totalRon)} (${roles["authority"].nDas ?? 0} achiziții directe, ${roles["authority"].nContracts ?? 0} contracte)`);
      if (roles["supplier"])
        parts.push(`ca furnizor: ${ron(roles["supplier"].totalRon)} (${roles["supplier"].nDas ?? 0} achiziții directe, ${roles["supplier"].nContracts ?? 0} contracte)`);
      if (s["cri"] !== null && s["cri"] !== undefined)
        parts.push(`CRI ${Number(s["cri"]).toFixed(2)} · ${s["nFlags"] ?? 0} semnale`);
      return `**${s["name"] ?? "?"}**${s["county"] ? ` (${s["county"]})` : ""}\n  ${parts.join(" · ")}`;
    }
    case "contract":
      return `**${s["title"] ?? "?"}**\n  ${s["authority"] ?? "?"} → ${s["supplier"] ?? "?"} · ${ron(s["valueRon"])} · ${s["date"] ?? "dată necunoscută"}`;
    case "notice":
      return `**Anunț ${s["noticeNo"] ?? c.refId}** · ${s["authority"] ?? "?"}\n  ${s["nContracts"] ?? "?"} contracte · ${ron(s["valueRon"])}`;
    case "person":
      return `**${s["name"] ?? "?"}** · ${s["nFirms"] ?? "?"} firme: ${((s["firms"] as string[]) ?? []).join(", ")}`;
    case "query": {
      const pills = (s["pills"] as string[]) ?? [];
      const headline = s["headline"] ? `\n  Rezultat la momentul salvării: ${s["headline"]}` : "";
      return `**Interogare:** ${pills.join(" · ") || "(spec salvat)"}${headline}`;
    }
    case "flag": {
      const meta = FLAG_META[String(s["code"] ?? "")];
      return `**${meta?.title ?? s["code"]}** pe ${s["entityName"] ?? "?"}\n  ${s["period"] ?? ""} · ${ron(s["totalRon"])} · metodologie ${s["methodology"] ?? "?"}\n  Evidență: \`${JSON.stringify(s["evidence"] ?? {})}\``;
    }
    case "note":
      return c.note ?? "";
    default:
      return "";
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await sessionUserId();
  if (!uid) return new Response("neautentificat", { status: 401 });
  const { id } = await ctx.params;
  const dosar = await getDosar(uid, id);
  if (!dosar) return new Response("inexistent", { status: 404 });

  const base = new URL(req.url).origin;
  const inv = dosar.investigation;
  const lines: string[] = [];
  lines.push(`# ${inv.title}`);
  lines.push("");
  if (inv.description) lines.push(inv.description, "");
  lines.push(`*Anexă de probe generată de cinecâștigă?. Status anchetă: ${inv.status}.*`);
  lines.push("");
  lines.push(
    "> **Avertisment metodologic:** semnalele de risc și indicele compus (CRI) sunt indicatori statistici, nu dovezi de nereguli. Fiecare cifră derivată poartă versiunea metodologiei; verificați valorile live prin link-urile atașate înainte de publicare.",
  );
  lines.push("");

  let n = 0;
  for (const kind of ["entity", "person", "contract", "notice", "flag", "query", "note"]) {
    const group = dosar.clips.filter((c) => c.kind === kind);
    if (group.length === 0) continue;
    lines.push(`## ${KIND_TITLE[kind]}`);
    lines.push("");
    for (const c of group) {
      n += 1;
      const link = clipLink(c, base);
      lines.push(`### Proba ${n}`);
      lines.push("");
      lines.push(clipBody(c));
      if (c.kind !== "note" && c.note) lines.push(`  \n  *Motiv:* ${c.note}`);
      lines.push(
        `  \n  *Instantaneu: ${String(c.createdAt).slice(0, 10)}*${c.drift?.length ? ` · **datele s-au schimbat între timp: ${c.drift.join(", ")}**` : ""}${link ? ` · [verifică live](${link})` : ""}`,
      );
      lines.push("");
    }
  }

  if (dosar.cast.relations.length > 0) {
    lines.push("## Relații cunoscute între membrii dosarului");
    lines.push("");
    const nameOf = (refId: string) =>
      dosar.cast.members.find((m) => m.refId === refId)?.name ?? refId;
    for (const r of dosar.cast.relations) {
      const money =
        r.valueRon !== undefined ? ` — ${ron(r.valueRon)} în ${r.count ?? "?"} tranzacții` : "";
      lines.push(`- ${nameOf(r.a)} ↔ ${nameOf(r.b)}: ${r.label}${money}`);
    }
    lines.push("");
  }

  const md = lines.join("\n");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="ancheta-${inv.id.slice(0, 8)}.md"`,
    },
  });
}
