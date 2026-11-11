import {createDb} from '@seap/db';
import {buildUnitPrices} from '../aggregate/unit-prices.js';
/** Rebuilds marts.unit_price_lines from the local archive (no source traffic). The processing run does the same. */
const {sql}=createDb();
try {await buildUnitPrices(sql,console.log);}
finally {await sql.end();}
