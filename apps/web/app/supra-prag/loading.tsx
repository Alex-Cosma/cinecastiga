import Term from "@/components/Term";
import { G, Ghost, rankWidth } from "@/components/ghost/Ghost";
import FunnelGhost from "@/components/table-filters/FunnelGhost";
import { TED_LABEL } from "@/lib/ted-labels";
import "./supra-prag.css";

/* Decorative widths of the country chips (in characters), close to the real names and counts; not data. */
const CHIPS = [19, 15, 16.5, 16, 18.5, 17, 17.5, 17.5, 16, 17.5, 15.5, 15.5];

/**
 * The page's ghost while the TED statistics and the list are read (prod 0.35–0.72 s): the static title, subtitle and
 * labels real, the numbers as lines, the twelve country chips, the list's header and its first twelve rows in the real
 * table; the rest of the page of 60 is reserved (`.tp-ghost-rest`) so the document keeps its length.
 */
export default function SupraPragLoading() {
  return (
    <Ghost name="supra-prag" label="Se încarcă atribuirile TED…" wait="suspense">
      <h1 className="page-title">Atribuiri publicate în TED</h1>
      <p className="page-sub">
        Anunțuri de atribuire din Jurnalul Oficial al UE. Valorile TED <strong>nu se adaugă</strong> totalurilor SEAP.
      </p>
      <p className="hint ted-tip-line" inert>
        <G.Line inline w="min(36rem, 74%)" /><Term tip title="Acoperire TED" text="" />{" · "}<a>Acoperire →</a>
      </p>

      <section className="section" inert>
        <div className="stat-row ted-stats">
          <div className="stat"><div className="n"><G.Line w="5ch" /></div><div className="l">rezultate de loturi TED <Term id="rezultat-lot-ted" tip /></div></div>
          <div className="stat"><div className="n"><G.Line w="5ch" /></div><div className="l">{TED_LABEL["ted-only"]!.title}</div></div>
          <div className="stat"><div className="n"><G.Line w="4ch" /></div><div className="l">marcate cu un câștigător străin</div></div>
          <div className="stat"><div className="n"><G.Line w="5ch" /></div><div className="l">cu o singură ofertă primită</div></div>
        </div>
        <p className="hint"><G.Line w="min(30rem, 92%)" /><G.Line w="40%" only="phone" /></p>
        <p className="note"><G.Line w="min(44rem, 94%)" /><G.Line w="96%" only="phone" /><G.Line w="30%" only="phone" /></p>
      </section>

      <section className="section" inert>
        <h2 className="ted-tip-line">Firme străine câștigătoare, după țară <Term id="ted-tari" tip /></h2>
        <div className="filters" style={{ flexWrap: "wrap" }}>
          {CHIPS.map((w, i) => <a key={i}><G.Line inline w={`${w}ch`} /></a>)}
        </div>
      </section>

      <section className="section">
        <h2>Explorează atribuirile</h2>
        <p className="hint"><G.Line w="16rem" /></p>
        <table className="rank list-anchor tp-ghost-table">
          {/* The loaded table's column shares (its long titles widen the second column). */}
          <colgroup><col className="c1" /><col className="c2" /><col className="c3" /><col className="c4" /></colgroup>
          <thead inert>
            <tr>
              <th><span className="th-filter"><FunnelGhost label="Autoritate" /><span className="th-sep" aria-hidden="true">→</span><FunnelGhost label="Câștigător" /><span className="th-sep" aria-hidden="true">·</span><FunnelGhost label="Țara" /></span></th>
              <th><span className="th-filter"><FunnelGhost label="Obiect" /><span className="th-sep" aria-hidden="true">·</span><FunnelGhost label="SEAP" /><Term id="ted-fara-potrivire" tip className="ted-tip-above" /><span className="th-sep" aria-hidden="true">·</span><FunnelGhost label="Oferte" /></span></th>
              <th><FunnelGhost label="Procedură" /></th>
              <th style={{ textAlign: "right" }}><span className="th-filter"><a>Valoare</a><FunnelGhost /><Term id="ted-valori" tip /></span></th>
            </tr>
          </thead>
          <tbody inert>
            <G.Rows n={12} as="tr" cells={(i) => <>
              <td><G.Line w={rankWidth(i, 74, 4, 46)} /><div className="arrow-to"><G.Line w="52%" /></div><div className="county"><G.Line w="28%" /></div></td>
              <td className="county">
                <div className="obj-title"><G.Line w="88%" /></div><G.Line w="72%" /><div><G.Line w="7rem" /></div>
                <div className="badges"><span className="ted-label only"><G.Line inline w="15ch" /></span><span className="badge"><G.Line inline w="15ch" /></span><span className="badge"><G.Line inline w="10ch" /></span></div>
              </td>
              <td className="county"><G.Line w="7rem" /></td>
              <td className="num" style={{ whiteSpace: "normal" }}>
                <div><G.Line inline w="9ch" /></div>
                <div className="county"><G.Line w="92%" /><G.Line w="70%" /><G.Line w="54%" only="phone" /></div>
                <details style={{ textAlign: "left", marginTop: "0.5rem", maxWidth: "24rem" }}><summary>Valorile și referințele din sursă</summary></details>
                <div className="src"><a>TED <G.Line inline w="11ch" /></a></div>
              </td>
            </>} />
          </tbody>
        </table>
        {/* The other 48 rows of a page of 60, reserved: the document keeps its length when the list arrives. */}
        <div className="tp-ghost-rest" aria-hidden="true" />
        <div className="pager" inert>
          <span className="off">← anterioarele</span><span className="pager-pos"><G.Line inline w="20ch" /></span><a>următoarele →</a>
        </div>
        <p className="note ted-tip-line ted-tip-up" inert>
          Potrivirile posibile sunt marcate separat de cele confirmate <Term id="potrivire-ted" tip /> · <a>Metodologia →</a>
        </p>
      </section>
    </Ghost>
  );
}
