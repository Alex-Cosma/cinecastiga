"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { MatrixRow, PatternRow, RxData } from "@/lib/radiografie";
import { shortName } from "@/lib/radiografie-fmt";
import { useRxTip, fmtM, yrs } from "./RxTip";

interface Cell {
  key: string;
  ids: string[];
  names: string[];
  lots: number;
  single: number;
  known: number;
  tr: number | null;
  v: number;
  framework: boolean;
}
interface Col {
  notice: string;
  d: string;
  lots: number;
  v: number;
  single: number;
  known: number;
  cells: Map<string, Cell>;
  consT: boolean;
  sweep: boolean;
}

const KIND_LABEL: Record<PatternRow["kind"], string> = {
  rotatie: "grup",
  impartire: "împărțire în doi",
  maturare: "măturare",
  consortiu: "consorțiu stabil",
};

/** tenders of one family → columns; consortium = one winner */
function buildCols(rows: MatrixRow[], consortiumKeys: Set<string>, memberIds: Set<string>): { all: Col[]; cols: Col[] } {
  const byNotice = new Map<string, Map<string, MatrixRow[]>>();
  for (const r of rows) {
    let n = byNotice.get(r.notice);
    if (!n) byNotice.set(r.notice, (n = new Map()));
    let c = n.get(r.contractId);
    if (!c) n.set(r.contractId, (c = []));
    c.push(r);
  }
  const all: Col[] = [];
  for (const [notice, contracts] of byNotice) {
    const col: Col = { notice, d: "9999", lots: contracts.size, v: 0, single: 0, known: 0, cells: new Map(), consT: false, sweep: false };
    for (const members of contracts.values()) {
      const ms = [...new Map(members.map((m) => [m.supplierId, m])).values()].sort((a, b) => a.supplierId.localeCompare(b.supplierId));
      const key = ms.map((m) => m.supplierId).join("+");
      const f = members[0]!;
      if (f.d < col.d) col.d = f.d;
      col.v += f.vFull;
      let c = col.cells.get(key);
      if (!c) col.cells.set(key, (c = { key, ids: ms.map((m) => m.supplierId), names: ms.map((m) => m.supplierName), lots: 0, single: 0, known: 0, tr: null, v: 0, framework: f.framework }));
      c.lots++;
      c.v += f.vFull;
      if (f.single !== null) {
        c.known++;
        col.known++;
        if (f.single) {
          c.single++;
          col.single++;
        }
      }
      if (f.tr != null) c.tr = Math.max(c.tr ?? 0, f.tr);
    }
    all.push(col);
  }
  all.sort((a, b) => a.d.localeCompare(b.d));
  const cols = all.filter((c) => {
    if (c.lots >= 3) return true;
    for (const cell of c.cells.values()) if (consortiumKeys.has(cell.key) || cell.ids.some((i) => memberIds.has(i))) return true;
    return false;
  });
  for (const c of cols) {
    c.consT = c.lots < 3;
    c.sweep = c.lots >= 3 && c.cells.size === 1;
  }
  return { all, cols };
}

export default function LotMatrix({
  families,
  patterns,
  familiesWithLots,
  familiesTotal,
}: {
  families: RxData["families"];
  patterns: PatternRow[];
  familiesWithLots: number;
  familiesTotal: number;
}) {
  const tip = useRxTip();
  const famOrder = useMemo(() => {
    const score = new Map<string, number>();
    for (const p of patterns) {
      const s = (p.strength === "puternic" ? 30 : p.strength === "mediu" ? 20 : 10) + p.reps + (p.sharedAdmin ? 10 : 0) + (p.kind === "rotatie" ? 5 : 0);
      score.set(p.cpvClass, Math.max(score.get(p.cpvClass) ?? 0, s));
    }
    return [...score.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  }, [patterns]);
  const [fam, setFam] = useState<string>(famOrder[0] ?? "");

  useEffect(() => {
    const onFocus = (e: Event) => {
      const d = (e as CustomEvent<{ go: string; cls?: string }>).detail;
      if (d.go === "mx" && d.cls && families[d.cls]) setFam(d.cls);
    };
    window.addEventListener("rx-focus", onFocus);
    return () => window.removeEventListener("rx-focus", onFocus);
  }, [families]);

  if (famOrder.length === 0)
    return (
      <div className="rx-panel" id="rx-mx">
        <p className="rx-silence">
          Niciun tipar repetat în {familiesWithLots} familii CPV cu licitații pe loturi (din {familiesTotal} familii în total).
        </p>
      </div>
    );

  const F = families[fam] ?? { name: fam, rows: [], nAll: 0 };
  const pats = patterns.filter((p) => p.cpvClass === fam);
  const consortiumKeys = new Set(pats.filter((p) => p.kind === "consortiu").map((p) => p.setKey));
  const memberIds = new Set(pats.flatMap((p) => p.memberIds));
  const { cols } = buildCols(F.rows, consortiumKeys, memberIds);
  const nLot = cols.filter((c) => !c.consT).length;

  // verdict: red first (rotation / shared admin), then strength, then value
  const RK = { puternic: 3, mediu: 2, slab: 1 };
  const verdicts = [...pats].sort(
    (a, b) =>
      Number(b.kind === "rotatie" || !!b.sharedAdmin) - Number(a.kind === "rotatie" || !!a.sharedAdmin) || RK[b.strength] - RK[a.strength] || b.value - a.value,
  );
  const v0 = verdicts[0]!;
  const title = (p: PatternRow): string => {
    const names = p.memberNames.map(shortName);
    switch (p.kind) {
      case "rotatie":
        return `${p.memberIds.length} firme, aceleași loturi, ${yrs(p.y0, p.y1)}`;
      case "impartire":
        return `${names.join(" și ")} își împart toate loturile, ${yrs(p.y0, p.y1)}`;
      case "maturare":
        return `${names[0]} ia toate loturile, de ${p.reps} ori`;
      case "consortiu":
        return `${names.join(" + ")}, consorțiu de ${p.reps} ori`;
    }
  };
  const stats = (p: PatternRow): string[] => {
    const out = [fmtM(p.value)];
    if (p.kind === "rotatie" || p.kind === "impartire") out.push(p.known ? `${p.single}/${p.known} loturi cu un singur ofertant` : "oferte nepublicate", `${p.reps} din ${nLot} licitații cu loturi`);
    else if (p.kind === "maturare") out.push(yrs(p.y0, p.y1), `${p.reps} din ${nLot} licitații cu loturi`);
    else out.push(yrs(p.y0, p.y1), ...(p.sharedAdmin ? [`același administrator: ${p.sharedAdmin}`] : []));
    return out;
  };

  // rows: brackets from the patterns, everything else collapsed
  const shown = new Set<string>();
  const cellsFor = (key: string, cls = "") => (
    <>
      {cols.map((c, i) => {
        const cell = c.cells.get(key);
        const hasL = cols.slice(0, i).some((x) => x.cells.has(key)),
          hasR = cols.slice(i + 1).some((x) => x.cells.has(key));
        const kls = cell ? `rx-cell w${cell.single > 0 ? " s" : cell.tr != null && cell.tr <= 2 ? " p" : ""}${hasR ? " link" : ""}` : `rx-cell${hasL && hasR ? " thru" : ""}`;
        return (
          <div
            key={c.notice}
            className={kls + cls}
            onMouseMove={
              cell
                ? (e) =>
                    tip.show(
                      <>
                        <b>{cell.names.map(shortName).join(" + ")}</b>
                        {cell.ids.length > 1 && <i> (consorțiu de {cell.ids.length})</i>}
                        <div>
                          {c.notice} · {c.d}
                          {cell.framework ? " · acord-cadru" : ""}
                        </div>
                        <div className="row">
                          <span>loturi</span>
                          <span className="num">
                            {cell.lots} din {c.lots}
                            {cell.known ? ` · ${cell.single} din ${cell.known} cunoscute cu ofertant unic` : ""}
                          </span>
                        </div>
                        <div className="row">
                          <span>valoare</span>
                          <span className="num">{fmtM(cell.v)} lei</span>
                        </div>
                        <div className="row">
                          <span>oferte primite</span>
                          <span className="num">{cell.tr != null ? cell.tr : "nepublicat"}</span>
                        </div>
                      </>,
                      e,
                    )
                : undefined
            }
            onMouseLeave={cell ? tip.hide : undefined}
          >
            {cell && (
              <span className="n">
                {cell.lots}/{c.lots}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
  const rowHead = (cell: { key: string; ids: string[]; names: string[] }, cls: string, extra?: string) => {
    const v = cols.reduce((s, c) => s + (c.cells.get(cell.key)?.v ?? 0), 0);
    return (
      <div className={`rx-rh ${cls}`} title={cell.names.join(" + ")}>
        {cell.ids.length === 1 ? (
          <Link href={`/entitati/${cell.ids[0]}`} target="_blank">
            {shortName(cell.names[0] ?? "")}
          </Link>
        ) : (
          <>
            {cell.names.map(shortName).join(" + ")}
            <span className="cons">consorțiu</span>
          </>
        )}
        <small className="num">{fmtM(v)}</small>
        {extra && <span className="tag">{extra}</span>}
      </div>
    );
  };
  const findCell = (key: string) => {
    for (const c of cols) {
      const cell = c.cells.get(key);
      if (cell) return cell;
    }
    return null;
  };
  const elsewhere = (p: PatternRow) => {
    const L = p.elsewhere;
    if (!L.length) return <div className="rx-else none">nu apar împreună la nicio altă autoritate</div>;
    const tot = L.reduce((s, a) => s + a.n, 0),
      v = L.reduce((s, a) => s + a.value, 0);
    return (
      <div className="rx-else">
        <details>
          <summary>
            și la <b>{L.length === 1 ? "o altă autoritate" : `${L.length} alte autorități`}</b>
            <span className="num">
              {" "}
              · {tot} licitații · {fmtM(v)}
            </span>
          </summary>
          <div className="elist">
            {L.map((a) => (
              <div key={a.authorityId}>
                <Link href={`/entitati/${a.authorityId}`} target="_blank">
                  {shortName(a.authorityName).replace(/\s*\(.*\)$/, "").slice(0, 42)}
                </Link>
                <span className="num">
                  {a.n}× · {fmtM(a.value)} · {yrs(a.y0, a.y1)}
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  };

  const blocks: React.ReactNode[] = [];
  for (const p of pats) {
    if (p.kind === "consortiu") {
      const c = findCell(p.setKey);
      const members = p.memberIds.map((id) => findCell(id)).filter((x): x is Cell => !!x);
      if (!c && members.length === 0) continue;
      blocks.push(
        <div key={p.id} className={`rx-grp${p.sharedAdmin ? " g1" : ""}`}>
          <b>{KIND_LABEL.consortiu}</b>
          <span className="num">{fmtM(p.value)}</span>
          {p.sharedAdmin && <span className="warn">același administrator · {p.sharedAdmin}</span>}
        </div>,
      );
      if (c) {
        shown.add(c.key);
        blocks.push(<div key={p.id + "c"} className="rx-row">{rowHead(c, "ing")}{cellsFor(c.key)}</div>);
      }
      for (const m of members) {
        shown.add(m.key);
        blocks.push(<div key={p.id + m.key} className="rx-row">{rowHead(m, "")}{cellsFor(m.key)}</div>);
      }
      blocks.push(<div key={p.id + "e"} className="rx-rowfull">{elsewhere(p)}</div>);
    } else if (p.kind === "maturare") {
      const c = findCell(p.setKey);
      if (!c) continue;
      shown.add(c.key);
      blocks.push(
        <div key={p.id} className="rx-grp">
          <b>{KIND_LABEL.maturare}</b>
        </div>,
        <div key={p.id + "r"} className="rx-row">{rowHead(c, "swp", `${p.reps}× toate loturile`)}{cellsFor(c.key)}</div>,
        <div key={p.id + "e"} className="rx-rowfull">{elsewhere(p)}</div>,
      );
    } else {
      const keys = [...new Set([...cols.flatMap((c) => [...c.cells.keys()])])].filter((k) => k.split("+").every((id) => p.memberIds.includes(id)));
      const cells = keys.map(findCell).filter((x): x is Cell => !!x).sort((a, b) => cols.reduce((s, c) => s + (c.cells.get(b.key)?.v ?? 0), 0) - cols.reduce((s, c) => s + (c.cells.get(a.key)?.v ?? 0), 0));
      if (cells.length === 0) continue;
      blocks.push(
        <div key={p.id} className={`rx-grp${p.kind === "rotatie" ? " g1" : ""}`}>
          <b>{p.kind === "rotatie" ? `grup de ${p.memberIds.length}` : KIND_LABEL.impartire}</b>
          <span className="num">{fmtM(p.value)}</span>
        </div>,
      );
      for (const c of cells) {
        shown.add(c.key);
        blocks.push(<div key={p.id + c.key} className="rx-row">{rowHead(c, "ing")}{cellsFor(c.key)}</div>);
      }
      blocks.push(<div key={p.id + "e"} className="rx-rowfull">{elsewhere(p)}</div>);
    }
  }
  const others = new Set<string>();
  for (const c of cols) for (const k of c.cells.keys()) if (!shown.has(k)) others.add(k);

  return (
    <div className="rx-panel" id="rx-mx">
      <div className="rx-tabs">
        {famOrder.map((f) => (
          <button key={f} type="button" className={f === fam ? "on" : ""} onClick={() => setFam(f)}>
            {families[f]?.name ?? f} ({f})
          </button>
        ))}
        <span className="silence">· niciun tipar în celelalte {Math.max(0, familiesWithLots - famOrder.length)} familii cu loturi</span>
      </div>

      <div className={`rx-verdict${v0.kind === "rotatie" || v0.sharedAdmin ? " red" : ""}`}>
        <div className="vt">
          <span className={`str ${v0.strength}`}>{v0.strength}</span>
          {title(v0)}
        </div>
        <div className="vs num">{stats(v0).join(" · ")}</div>
        {verdicts.length > 1 && (
          <div className="vo">
            {verdicts.slice(1).map((p) => (
              <span key={p.id}>{title(p)}</span>
            ))}
          </div>
        )}
      </div>

      <div className="rx-mx" style={{ gridTemplateColumns: `minmax(200px, 280px) repeat(${Math.max(1, cols.length)}, minmax(0, 1fr))` }}>
        <div className="rx-ch" />
        {cols.map((c) => (
          <div
            key={c.notice}
            className="rx-ch"
            onMouseMove={(e) =>
              tip.show(
                <>
                  <b>{c.notice}</b>
                  <div>{c.d}</div>
                  <div className="row">
                    <span>loturi</span>
                    <span className="num">
                      {c.lots} · {c.cells.size} câștigători
                    </span>
                  </div>
                  <div className="row">
                    <span>ofertant unic</span>
                    <span className="num">{c.known ? `${c.single} din ${c.known} cunoscute` : "oferte nepublicate"}</span>
                  </div>
                  <div className="row">
                    <span>valoare</span>
                    <span className="num">{fmtM(c.v)} lei</span>
                  </div>
                </>,
                e,
              )
            }
            onMouseLeave={tip.hide}
          >
            <b>{c.d.slice(0, 4)}</b>
            <span>{c.d.slice(5, 7)}</span>
            <br />
            {c.consT ? "1 contract" : `${c.lots} loturi`}
            {c.sweep && (
              <>
                <br />
                <span className="pat swp">măturare</span>
              </>
            )}
          </div>
        ))}
        {blocks}
        {others.size > 0 && (
          <div className="rx-row">
            <div className="rx-rh oth">alte {others.size} firme</div>
            {cols.map((c) => {
              const L = [...c.cells.values()].filter((x) => others.has(x.key));
              return (
                <div
                  key={c.notice}
                  className="rx-cell oth"
                  onMouseMove={L.length ? (e) => tip.show(<>{L.map((x) => <div key={x.key}>{x.names.map(shortName).join(" + ")}</div>)}</>, e) : undefined}
                  onMouseLeave={tip.hide}
                >
                  {L.length > 0 && <span className="n">{L.length}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {tip.el}
    </div>
  );
}
