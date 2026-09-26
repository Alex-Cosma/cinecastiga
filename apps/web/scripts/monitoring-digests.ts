/** Read-only preview by default. Actual delivery requires an explicit --send. */
import { resolve } from "node:path";

try {
  process.loadEnvFile(resolve(import.meta.dirname,"../.env.local"));
} catch { /* Deployment supplies environment directly. */ }
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--send" && !arg.startsWith("--day="))) {
  console.error("Utilizare: pnpm --filter web monitoring:digests [--day=AAAA-LL-ZZ] [--send]. Fără --send este doar o previzualizare.");
  process.exit(1);
}
const period = args.find(arg => arg.startsWith("--day="))?.slice(6);
const { runMonitoringDigests } = await import("../lib/monitoring-digests");
try {
  const report = await runMonitoringDigests({ send:args.includes("--send"),...(period ? { period } : {}) });
  // Operational output contains counts only; no addresses, codes, private titles,
  // source data, SMTP responses, or credentials are logged.
  console.log(JSON.stringify(report,null,2));
} catch (error) {
  console.error(error instanceof Error && /^(Ziua|Zi calendaristică|Rezumatul|Trimiterea|Rezumatele)/.test(error.message)
    ? error.message : "Rezumatul nu a putut fi procesat. Verifică baza de date și configurația serverului.");
  process.exitCode = 1;
}
