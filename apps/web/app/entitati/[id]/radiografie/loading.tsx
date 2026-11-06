import { G, Ghost } from "@/components/ghost/Ghost";
import { DependencyScatterGhost } from "./DependencyScatter";
import { TabsGhost } from "./RadiografieExplorer";
import { SupplierTableGhost } from "./SupplierTable";
import "./radiografie.css";

/**
 * The radiografie while the server reads it (owner, 6 November 2026: route ghosts only on slow pages; a large authority
 * takes about a second): the page's own classes, the fixed words real, lines where the data goes. The sources page
 * below it has its own (surse/loading.tsx).
 */
export default function Loading() {
  return <Ghost className="radiografie-view" name="rv" wait="suspense" label="Se încarcă radiografia…">
    <div className="rv-breadcrumb" aria-hidden="true"><span className="rv-g-link">Profilul instituției</span><span> / Radiografie</span></div>
    <header className="rv-header"><div><h1>Radiografie</h1><p className="rv-authority"><G.Line w="44ch" /><G.Line w="60%" only="phone" /></p></div></header>
    <div className="rv-context" aria-hidden="true">
      <span><strong><G.Line inline w="9ch" /></strong> valoare contractată</span><span><strong><G.Line inline w="6ch" /></strong> contracte distincte</span>
      <span><strong><G.Line inline w="5ch" /></strong> achiziții directe</span><span>Istoric <strong><G.Line inline w="9ch" /></strong></span>
    </div>
    <TabsGhost />
    <DependencyScatterGhost />
    <SupplierTableGhost />
    <footer className="rv-footer" aria-hidden="true"><p>Tipare de verificat, nu dovezi. Valori contractate, nu plăți; cotele asocierilor pot fi estimate. Lipsa unui semnal nu confirmă absența unei probleme.</p><span className="rv-g-link">Metodologie și limite</span></footer>
  </Ghost>;
}
