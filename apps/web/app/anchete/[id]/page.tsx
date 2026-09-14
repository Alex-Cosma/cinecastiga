import Link from "next/link";
import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import { getDosar, type CastRelation, type ClipRow } from "@/lib/anchete";
import { encodeSpec } from "@/lib/ask/permalink";
import { FLAG_META } from "@/lib/flags";
import { formatRon, formatInt, cleanName } from "@/lib/format";
import {
  addNoteClip,
  deleteAncheta,
  removeClip,
  saveAnchetaMeta,
  saveClipNote,
  toggleClipPin,
} from "../actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  entity: "entitate",
  contract: "contract",
  notice: "anunț",
  person: "persoană",
  query: "interogare",
  flag: "semnal",
  note: "notă",
};
const KIND_ICON: Record<string, string> = {
  entity: "🏛",
  contract: "📄",
  notice: "📑",
  person: "👤",
  query: "🔎",
  flag: "🚩",
  note: "📝",
};
const STATUSES: [string, string][] = [
  ["activa", "activă"],
  ["publicata", "publicată"],
  ["inchisa", "închisă"],
];

function clipHref(c: ClipRow): string | null {
  switch (c.kind) {
    case "entity":
      return `/entitati/${c.refId}`;
    case "contract":
      return `/contracte/${c.refId}`;
    case "notice":
      return `/anunturi/${c.refId}`;
    case "person":
      return `/?spec=${encodeURIComponent(
        encodeSpec({
          block: "table",
          measure: "value",
          filters: { adminPersonKey: c.refId },
          dim: "supplier",
        }),
      )}`;
    case "query":
      return c.spec
        ? `/intreaba?spec=${encodeURIComponent(encodeSpec(c.spec))}`
        : null;
    case "flag":
      return `/entitati/${c.refId}`;
    default:
      return null;
  }
}

function ClipBody({ c }: { c: ClipRow }) {
  const s = (c.snapshot ?? {}) as Record<string, unknown>;
  const href = clipHref(c);
  const title = (() => {
    switch (c.kind) {
      case "entity":
        return `${cleanName(String(s["name"] ?? "?"))}${s["county"] ? ` (${s["county"]})` : ""}`;
      case "contract":
        return String(s["title"] ?? `contract ${c.refId}`);
      case "notice":
        return `Anunț ${s["noticeNo"] ?? c.refId} · ${cleanName(String(s["authority"] ?? "?"))}`;
      case "person":
        return String(s["name"] ?? c.refId);
      case "query":
        return (
          String(s["title"] ?? ((s["pills"] as string[]) ?? []).join(" · ")) ||
          "întrebare salvată"
        );
      case "flag":
        return `${FLAG_META[String(s["code"] ?? "")]?.title ?? s["code"]} · ${cleanName(String(s["entityName"] ?? "?"))}`;
      default:
        return "";
    }
  })();
  const detail = (() => {
    switch (c.kind) {
      case "entity": {
        const roles = (s["roles"] ?? {}) as Record<
          string,
          { nDas?: number; nContracts?: number; totalRon?: number }
        >;
        const bits: string[] = [];
        if (roles["authority"])
          bits.push(
            `autoritate: ${formatRon(Number(roles["authority"].totalRon ?? 0))}`,
          );
        if (roles["supplier"])
          bits.push(
            `furnizor: ${formatRon(Number(roles["supplier"].totalRon ?? 0))}`,
          );
        if (s["cri"] !== null && s["cri"] !== undefined)
          bits.push(
            `CRI ${Number(s["cri"]).toFixed(2)} · ${String(s["nFlags"] ?? 0)} semnale`,
          );
        return bits.join(" · ");
      }
      case "contract":
        return `${cleanName(String(s["authority"] ?? "?"))} → ${cleanName(String(s["supplier"] ?? "?"))} · ${formatRon(Number(s["valueRon"] ?? 0))} · ${s["date"] ?? ""}`;
      case "notice":
        return `${formatInt(Number(s["nContracts"] ?? 0))} contracte · ${formatRon(Number(s["valueRon"] ?? 0))}`;
      case "person":
        return `${formatInt(Number(s["nFirms"] ?? 0))} firme: ${((s["firms"] as string[]) ?? []).slice(0, 6).join(", ")}`;
      case "query":
        return s["headline"] ? `rezultat la salvare: ${s["headline"]}` : "";
      case "flag":
        return `${s["period"] ?? ""} · ${formatRon(Number(s["totalRon"] ?? 0))} · metodologie ${s["methodology"] ?? "?"}`;
      default:
        return "";
    }
  })();
  if (c.kind === "note") {
    return <div className="clip-note-body">{c.note}</div>;
  }
  return (
    <>
      <div className="clip-title">
        {href ? (
          <Link href={href} target="_blank">
            {title} ↗
          </Link>
        ) : (
          title
        )}
      </div>
      {detail && <div className="clip-detail">{detail}</div>}
      {c.kind === "query" && c.spec != null && (
        <div className="clip-query-sources">
          <Link
            href={`/intreaba?spec=${encodeURIComponent(encodeSpec(c.spec))}&drill=1${s["evidenceScope"] ? "&evidence=" + encodeURIComponent(JSON.stringify(s["evidenceScope"])) : ""}`}
          >
            Vezi înregistrările și sursele SEAP →
          </Link>
          <p className="hint">
            Rezultatul a fost păstrat la salvare. Redeschiderea întrebării
            consultă datele disponibile acum.
          </p>
        </div>
      )}
      {c.note && <div className="clip-why">„{c.note}"</div>}
    </>
  );
}

export default async function DosarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tip?: string }>;
}) {
  const uid = await sessionUserId();
  if (!uid) redirect("/login");
  const { id } = await params;
  const { tip } = await searchParams;
  const dosar = await getDosar(uid, id);
  if (!dosar) redirect("/anchete");
  const inv = dosar.investigation;

  const kinds = [...new Set(dosar.clips.map((c) => c.kind))];
  const shown = tip ? dosar.clips.filter((c) => c.kind === tip) : dosar.clips;
  const nameOf = (refId: string) =>
    dosar.cast.members.find((m) => m.refId === refId)?.name ?? refId;
  const relLabel = (r: CastRelation) =>
    r.valueRon !== undefined
      ? `${r.label}: ${formatRon(r.valueRon)} în ${formatInt(r.count ?? 0)} tranzacții`
      : r.label;

  return (
    <>
      <p className="eyebrow" style={{ marginTop: 4 }}>
        <Link href="/anchete">← anchetele mele</Link> · dosar
      </p>
      <div className="ehead">
        <div className="ehead-main">
          <h1 className="page-title">{inv.title}</h1>
          <div className="id-meta">
            <span className={`st st-${inv.status}`}>
              <i aria-hidden />{" "}
              {STATUSES.find(([k]) => k === inv.status)?.[1] ?? inv.status}
            </span>
            <span>{formatInt(dosar.clips.length)} probe</span>
            {inv.description ? <span>{inv.description}</span> : null}
          </div>
        </div>
        <div className="ehead-acts">
          <a href={`/api/anchete/${inv.id}/export`} className="btn pri">
            ⬇ exportă anexa de probe
          </a>
        </div>
      </div>

      <div className="dosar-layout">
        <div className="dosar-main">
          <div className="dosar-tools">
            {kinds.length > 1 && (
              <div className="chips">
                <Link
                  href={`/anchete/${inv.id}`}
                  className={"chip" + (!tip ? " on" : "")}
                >
                  toate
                </Link>
                {kinds.map((k) => (
                  <Link
                    key={k}
                    href={`/anchete/${inv.id}?tip=${k}`}
                    className={"chip" + (tip === k ? " on" : "")}
                  >
                    {KIND_ICON[k]} {KIND_LABEL[k]}{" "}
                    <span className="c">
                      {dosar.clips.filter((c) => c.kind === k).length}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {shown.length === 0 ? (
            <p className="hint">
              Niciun clip încă — folosește „Adaugă la anchetă" de pe paginile de
              entități, contracte sau rezultate.
            </p>
          ) : (
            <div className="clip-list">
              {shown.map((c) => (
                <div
                  key={c.id}
                  className={`clip-card${c.pinned ? " pinned" : ""}`}
                >
                  <div className="clip-head">
                    <span className="clip-kind">
                      {KIND_ICON[c.kind]} {KIND_LABEL[c.kind]}
                    </span>
                    {c.pinned && <span className="clip-pin-mark">fixat</span>}
                    {c.drift && c.drift.length > 0 && (
                      <span
                        className="clip-drift"
                        title={`diferă față de instantaneu: ${c.drift.join(", ")}`}
                      >
                        ⚠ s-a schimbat: {c.drift.join(", ")}
                      </span>
                    )}
                    <span className="clip-date">
                      {new Date(c.createdAt).toLocaleDateString("ro-RO")}
                    </span>
                  </div>
                  <ClipBody c={c} />
                  <div className="clip-actions">
                    <details>
                      <summary>
                        {c.kind === "note" ? "editează" : "motiv / notă"}
                      </summary>
                      <form action={saveClipNote}>
                        <input type="hidden" name="id" value={inv.id} />
                        <input type="hidden" name="clipId" value={c.id} />
                        <textarea
                          name="note"
                          rows={2}
                          defaultValue={c.note ?? ""}
                        />
                        <button type="submit">salvează</button>
                      </form>
                    </details>
                    <form action={toggleClipPin}>
                      <input type="hidden" name="id" value={inv.id} />
                      <input type="hidden" name="clipId" value={c.id} />
                      <input
                        type="hidden"
                        name="pinned"
                        value={String(!c.pinned)}
                      />
                      <button type="submit">
                        {c.pinned ? "desprinde" : "fixează"}
                      </button>
                    </form>
                    <form action={removeClip}>
                      <input type="hidden" name="id" value={inv.id} />
                      <input type="hidden" name="clipId" value={c.id} />
                      <button type="submit" className="clip-remove">
                        scoate
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="card pad dosar-note">
            <form className="auth-form dosar-addnote" action={addNoteClip}>
              <input type="hidden" name="id" value={inv.id} />
              <label>
                Notă nouă
                <textarea
                  name="note"
                  rows={2}
                  placeholder="observație, pistă, de verificat…"
                />
              </label>
              <button type="submit">adaugă nota</button>
            </form>
          </div>
        </div>

        <aside className="dosar-side">
          {dosar.cast.members.length > 0 && (
            <div className="card pad">
              <h3>Actori</h3>
              <p className="hint">
                Relațiile pe care platforma le cunoaște deja între membrii
                dosarului.
              </p>

              <div className="cast-members">
                {dosar.cast.members.map((m) => (
                  <span key={m.refId} className="cast-chip">
                    {m.kind === "person" ? "👤" : "🏛"} {cleanName(m.name)}
                  </span>
                ))}
              </div>
              {dosar.cast.relations.length > 0 ? (
                <ul className="prose cast-rels">
                  {dosar.cast.relations.map((r, i) => (
                    <li key={i}>
                      <b>{cleanName(nameOf(r.a))}</b> ↔{" "}
                      <b>{cleanName(nameOf(r.b))}</b> — {relLabel(r)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">
                  Nicio legătură directă găsită între membri (încă).
                </p>
              )}
            </div>
          )}
          <div className="card pad">
            <h3>Editează ancheta</h3>
            <form className="auth-form" action={saveAnchetaMeta}>
              <input type="hidden" name="id" value={inv.id} />
              <label>
                Titlu
                <input
                  type="text"
                  name="title"
                  defaultValue={inv.title}
                  maxLength={200}
                />
              </label>
              <label>
                Descriere
                <input
                  type="text"
                  name="description"
                  defaultValue={inv.description ?? ""}
                />
              </label>
              <label>
                Status
                <select name="status" defaultValue={inv.status}>
                  {STATUSES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit">salvează</button>
            </form>
            <form action={deleteAncheta} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={inv.id} />
              <button type="submit" className="dosar-del">
                șterge ancheta definitiv
              </button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
