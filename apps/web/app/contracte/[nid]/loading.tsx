import { G, Ghost } from "@/components/ghost/Ghost";
import "@/components/documents/documents.css";
import "./contract.css";

/**
 * A contract's ghost while its record and its documents' state are read (prod 0.21–0.41 s): the page's own blocks and
 * classes for the usual contract (one winner, the notice in SEAP, three numbers), the fixed words real, the rest lines.
 * The title is not known from most links ("detalii →"): SEAP titles are long, so it is the usual two lines (eight on a
 * phone).
 */
export default function ContractLoading() {
  return (
    <Ghost name="contract" label="Se încarcă contractul…" wait="suspense">
      <div className="profile-head" aria-hidden="true">
        <h1><G.Line w="86%" /><G.Line w="52%" /><G.Lines w={[]} phone={["96%", "90%", "94%", "88%", "92%", "46%"]} /></h1>
        <div>
          <span className="badge plain">contract atribuit prin procedură</span>
          <span className="badge plain"><G.Line inline w="11ch" /></span>
          <span className="note"><G.Line inline w="9ch" /></span>{" "}
          <span className="note"><G.Line inline w="14ch" /></span>
        </div>
        <p className="note"><G.Line w="min(34rem, 92%)" /><G.Line w="38%" only="phone" /></p>
        <div className="ext-links"><a>Anunțul în SEAP ↗</a></div>
      </div>
      <nav className="ext-links" aria-hidden="true"><a>Documente ↓</a></nav>
      <div className="stat-grid" aria-hidden="true">
        <div className="stat"><div className="n"><G.Line w="9ch" /></div><div className="l"><G.Line w="70%" /></div></div>
        <div className="stat"><div className="n"><G.Line w="7ch" /></div><div className="l">Valoare atribuită (tot anunțul)</div></div>
        <div className="stat"><div className="n"><G.Line w="2ch" /></div><div className="l">Oferte primite</div></div>
      </div>
      <section className="section ct-tip-col" aria-hidden="true">
        <h2>Cine cu cine</h2>
        <table className="rank">
          <tbody>
            <tr><td className="county" style={{ width: 140 }}>Autoritate</td><td><G.Line w="58%" /></td></tr>
            <tr><td className="county">Câștigător</td><td><G.Line w="48%" /><G.Line w="72%" only="phone" /><G.Line w="56%" only="phone" /></td></tr>
          </tbody>
        </table>
      </section>
      <section className="df-section" aria-hidden="true">
        <div className="df-heading"><div><h2 className="df-tip">Documentele procedurii</h2></div></div>
        <p className="df-empty"><G.Line w="min(30rem, 90%)" /><G.Line w="60%" only="phone" /></p>
      </section>
      <p className="note" aria-hidden="true">Sursa: <G.Line inline w="min(22rem, 60%)" /></p>
    </Ghost>
  );
}
