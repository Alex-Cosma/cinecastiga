import { G, Ghost } from "@/components/ghost/Ghost";
import "@/components/record/record.css";
import "@/components/source-evidence.css";

/**
 * The sources behind a Radiografie finding (a 30 s read): its own ghost on the record template, so it never inherits the
 * Radiografie's. The back link, the section's words and the table's headings are real; the finding, its value and the
 * rows are lines. The section title differs between a pattern and a group of acquisitions: a line here.
 */
export default function Loading() {
  return <Ghost as="article" className="record rx-sources-record" name="rv-surse" wait="suspense" label="Se încarcă sursele…">
    <span className="back g-quiet" aria-hidden="true">← Radiografia instituției</span>
    <header className="record-head" aria-hidden="true">
      <div className="record-title">
        <h1><G.Line w="88%" /><G.Line w="46%" /><G.Lines w={[]} phone={["70%"]} /></h1>
        <p className="record-parties"><G.Line w="82%" /><G.Line w="40%" only="phone" /></p>
      </div>
      <div className="record-value">
        <p className="record-amount"><G.Line w="10ch" /></p>
        <p className="record-amount-label"><G.Line w="80%" /></p>
        <p className="record-value-note"><G.Line w="90%" /><G.Line w="60%" /></p>
      </div>
      <p className="record-meta"><span><G.Line inline w="16ch" /></span><span><G.Line inline w="5ch" /></span><span><G.Line inline w="22ch" /></span><span>Pistă de verificat, nu dovadă</span></p>
      {/* Its one action (saving in an investigation) is a signed-in viewer's: no row for it while loading. */}
    </header>
    <section className="record-section" aria-hidden="true">
      <h2><G.Line w="14ch" /></h2>
      <div className="source-evidence">
        <div className="source-evidence-intro"><div><p className="source-evidence-count"><G.Line w="30ch" /></p></div></div>
        <span className="source-evidence-csv">Descarcă înregistrările · CSV ↓</span>
        <div className="source-evidence-notes"><p><G.Line w="28ch" /></p><ul><li><G.Line w="90%" /><G.Line w="40%" /><G.Line w="86%" only="phone" /><G.Line w="52%" only="phone" /></li></ul></div>
        <p className="hint source-evidence-basis">Valori înregistrate, nu plăți</p>
        <div className="ask-tablewrap rank-stack"><table className="rank source-evidence-table">
          <thead><tr><th scope="col">Înregistrarea</th><th scope="col">Instituție și furnizor</th><th scope="col">Data</th><th scope="col" className="num">Valoare · lei</th></tr></thead>
          <tbody><G.Rows n={4} as="tr" cells={(i) => <>
            <td className="se-record"><span className="se-title"><G.Line w="90%" /><G.Line w={`${50 + (i % 3) * 12}%`} /></span><span className="se-code"><G.Line w="22ch" /></span><span className="source-evidence-links"><G.Line inline w="6ch" /></span></td>
            <td className="se-parties" data-label="Instituție și furnizor"><span className="se-party"><span className="se-role">Instituția</span><G.Line w="70%" /></span><span className="se-party"><span className="se-role">Câștigătorul</span><G.Line w={`${64 - (i % 3) * 10}%`} /></span></td>
            <td data-label="Data"><G.Line w="10ch" /></td><td className="num" data-label="Valoare · lei"><G.Line inline w="13ch" /></td>
          </>} /></tbody>
        </table></div>
      </div>
    </section>
  </Ghost>;
}
