import { G, Ghost } from "@/components/ghost/Ghost";
import "@/components/documents/documents.css";
import "@/components/record/record.css";
import "@/components/record/record-pages.css";

/**
 * A contract's ghost while its record, context and documents' state are read: the record template's own blocks and
 * classes (the head with its value panel, the award's facts, the parties, the documents) for the usual contract, the
 * fixed words real, the rest lines. Titles are long: two lines, more on a phone.
 */
export default function ContractLoading() {
  return (
    <Ghost as="article" className="record record-entry contract-record" name="contract" label="Se încarcă contractul…" wait="suspense">
      <header className="record-head" aria-hidden="true">
        <div className="record-title">
          <h1><G.Line w="86%" /><G.Line w="52%" /><G.Lines w={[]} phone={["92%", "70%"]} /></h1>
          <p className="record-parties"><G.Line w="78%" /><G.Line w="60%" only="phone" /></p>
        </div>
        <div className="record-value">
          <p className="record-amount"><G.Line w="9ch" /></p>
          <p className="record-amount-label">Valoarea contractului <span className="record-not-paid">· nu e plată</span></p>
        </div>
        <p className="record-meta"><span className="record-kind">Contract</span><span><G.Line inline w="12ch" /></span><span><G.Line inline w="16ch" /></span></p>
        <div className="record-actions"><a className="record-seap">Verifică în SEAP ↗</a></div>
      </header>
      <section className="record-section" aria-hidden="true">
        <h2>Atribuirea</h2>
        <dl className="record-facts">
          <div><dt>Oferte primite</dt><dd><G.Line w="4ch" /></dd></div>
          <div><dt>Procedura</dt><dd><G.Line w="60%" /></dd></div>
          <div><dt>Domeniu CPV</dt><dd><G.Line w="80%" /></dd></div>
        </dl>
      </section>
      <section className="record-section" aria-hidden="true">
        <h2>Instituție și câștigători</h2>
        {/* The parties as rows (UX audit Z7-12): the institution one line, the winner a row. */}
        <p className="record-institution"><span className="record-party-role">Instituția</span> <span className="record-party-name"><G.Line inline w="22ch" /></span></p>
        <ul className="record-parties-list">
          <li><div className="record-party-who"><p className="record-party-role">Câștigătorul</p><p className="record-party-name"><G.Line w="64%" /></p><p className="record-party-line"><G.Line w="30%" /></p></div>
            <div className="record-party-what"><p className="record-party-line"><G.Line w="86%" /></p></div></li>
        </ul>
      </section>
      <section className="df-section" aria-hidden="true">
        <div className="df-heading"><div><h2 className="df-tip">Documentele procedurii</h2></div></div>
        <p className="df-empty"><G.Line w="min(30rem, 90%)" /><G.Line w="60%" only="phone" /></p>
      </section>
    </Ghost>
  );
}
