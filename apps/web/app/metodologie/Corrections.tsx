import Link from "next/link";
import EntityName from "@/components/EntityName";
import InfoMark from "@/components/InfoMark";
import { formatInt, formatRon } from "@/lib/format";
import type { CorrectionRow } from "@/lib/seap-corrections";
import type { CorrectionsData } from "@/lib/seap-corrections-data";
import CorrectionsSearch from "./CorrectionsSearch";

/** What one row says: the name, SEAP → the site, and why with the basis behind an "i". */
function Row({ r }: { r: CorrectionRow }) {
  return (
    <li id={r.key} data-q={`${r.name} ${r.cui ?? ""} ${r.seap}`}>
      <b><EntityName id={r.entityId}>{r.name}</EntityName></b>
      <span className="mt-corr-x"><span>SEAP: {r.seap}</span><span aria-hidden="true"> → </span><span>la noi: {r.shown}{" "}
        <InfoMark title="De ce" label={`De ce: ${r.name}`} text={<>{r.why} <b>Pe ce ne bazăm:</b> {r.basis}.</>} /></span></span>
    </li>
  );
}

/**
 * „Unde corectăm datele SEAP” (owner, 21 November 2026), in the Regulile lane after the signals' rules: the kinds with
 * their counts, then every row of each kind in its own fold, one search over all of them. The exclusions keep their own
 * page (/metodologie/excluderi), one line here.
 */
export default function Corrections({ data }: { data: CorrectionsData }) {
  const { groups, ruleMerges, contracts } = data;
  const listed = groups.reduce((n, g) => n + g.rows.length, 0) + (contracts?.decisions.length ?? 0);
  return (
    <details suppressHydrationWarning id="corecturi">
      <summary>Unde corectăm datele SEAP</summary>
      <div className="mt-body">
        <p>Unde SEAP are o greșeală dovedită, afișăm varianta corectată. Înregistrarea din sursă rămâne neschimbată în arhivă.</p>
        <div className="mt-tw">
          <table className="mt-ktab mt-corr-t">
            <thead><tr><th>Ce corectăm</th><th className="mt-n">Câte</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.kind}><td><a href={`#corecturi-${g.kind}`}>{g.title}</a></td><td className="mt-n">{formatInt(g.rows.length)}</td></tr>
              ))}
              {contracts && (
                <tr><td><a href="#corecturi-contracte">Valori de contract hotărâte de mână</a></td><td className="mt-n">{formatInt(contracts.decisions.length)}</td></tr>
              )}
              {ruleMerges.map((m) => (
                <tr key={m.reason}><td>{m.label} <span className="mt-corr-rule">după regulă, fără listă</span></td><td className="mt-n">{formatInt(m.n)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <CorrectionsSearch rootId="corecturi" total={listed} />
        {groups.map((g) => (
          <details suppressHydrationWarning className="mt-corr-g" id={`corecturi-${g.kind}`} key={g.kind}>
            <summary>{g.title} <span className="mt-chip">{formatInt(g.rows.length)}</span></summary>
            <p className="mt-corr-lead">{g.lead}</p>
            <ul className="mt-corr">{g.rows.map((r) => <Row key={r.key} r={r} />)}</ul>
          </details>
        ))}
        {contracts && (
          <details suppressHydrationWarning className="mt-corr-g" id="corecturi-contracte">
            <summary>Valori de contract hotărâte de mână <span className="mt-chip">{formatInt(contracts.decisions.length)}</span></summary>
            <p className="mt-corr-lead">
              Contractele de peste 1 miliard de lei intră în totaluri, cu excepțiile de mai jos. Un contract mai mic e aici doar dacă valoarea lui din SEAP e, cel mai probabil, o greșeală de redactare. {contracts.heldByGuard > 0 && <>Alte {formatInt(contracts.heldByGuard)} sunt ținute deoparte automat: propriul anunț le contrazice valoarea. </>}
              <a href="#peste-miliard">Regula</a>
            </p>
            <ul className="mt-corr">
              {contracts.decisions.map((d) => (
                <li key={d.natId} id={`corectura-contract-${d.natId}`} data-q={`${d.natId} ${d.reason}`}>
                  <b><Link href={`/contracte/${d.natId}`} prefetch={false}>Contractul {d.natId}</Link></b>
                  <span className="mt-corr-x"><span>SEAP: {d.valueRon ? formatRon(d.valueRon) : "valoarea de pe pagina contractului"}</span><span aria-hidden="true"> → </span><span>la noi: {d.decision === "include" ? "intră în totaluri" : "nu intră în totaluri"}{" "}
                    <InfoMark title="De ce" label={`De ce: contractul ${d.natId}`} text={<>{d.reason} <b>Pe ce ne bazăm:</b> anunțul de atribuire.</>} /></span></span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p>Separat, contractele a căror identitate e incertă sunt scoase temporar din totaluri: <Link href="/metodologie/excluderi" prefetch={false}>lista excluderilor</Link>.</p>
      </div>
    </details>
  );
}
