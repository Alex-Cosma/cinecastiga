import { G, Ghost } from "@/components/ghost/Ghost";
import "@/components/source-evidence.css";

/**
 * The sources behind a radiografie pattern (a 30 s read): its own small ghost, so it never inherits the radiografie's.
 * The back link and the title are real words; the evidence (SourceEvidenceView) is drawn in its classes.
 */
export default function Loading() {
  return <Ghost name="rv-surse" wait="suspense" label="Se încarcă sursele…">
    <span className="back g-quiet" aria-hidden="true">← Înapoi la Radiografie</span>
    <h1 className="page-title">Datele din spatele tiparului</h1>
    <div className="source-evidence" aria-hidden="true">
      <div className="source-evidence-intro"><div><h2><G.Line w="26ch" /><G.Line w="18ch" /></h2><p><G.Line w="30ch" /></p></div></div>
      <p><G.Line w="34ch" /></p>
      <div className="source-evidence-notes"><p><G.Line w="28ch" /></p><ul><li><G.Line w="90%" /><G.Line w="40%" /><G.Line w="86%" only="phone" /><G.Line w="52%" only="phone" /></li></ul></div>
      <p className="hint source-evidence-basis"><G.Line w="22ch" /></p>
      <div className="ask-tablewrap rank-stack"><table className="rank source-evidence-table">
        <thead><tr><th scope="col">Înregistrare și sursă</th><th scope="col">Autoritate / furnizor</th><th scope="col">Data</th><th scope="col" className="num">Valoare exactă · lei</th></tr></thead>
        <tbody><G.Rows n={6} as="tr" cells={(i) => <>
          <td><strong><G.Line w="12ch" /></strong><small><G.Line w="18ch" /></small><span className="source-evidence-links"><G.Line inline w="6ch" /></span></td>
          <td data-label="Autoritate / furnizor"><G.Line w={`${70 - (i % 3) * 12}%`} /><G.Line w="40%" only="phone" /><small><G.Line w="48%" /></small></td>
          <td data-label="Data"><G.Line w="10ch" /></td><td className="num" data-label="Valoare exactă · lei"><G.Line inline w="13ch" /></td>
        </>} /></tbody>
      </table></div>
    </div>
  </Ghost>;
}
