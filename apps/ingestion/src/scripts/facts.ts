import { createDb } from "@seap/db";
import { buildFacts } from "../facts/build.js";

/**
 * Propose the „Știați că” facts from the marts as they stand (the nightly processing does this after the search stage).
 *   pnpm --filter ingestion facts
 */
const { sql } = createDb();
try { console.log(JSON.stringify(await buildFacts(sql, console.log))); }
finally { await sql.end({ timeout: 10 }); }
