import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {isProxyFailure,PROXY_FAILURE_PREFIX} from './award-backfill.js';
const root=join(import.meta.dirname,'../../../..');
const read=(f:string)=>readFileSync(join(root,f),'utf8');
describe('ordinary award detail retry selects proxy failures only (no network)',()=>{
 it('matches every task error the gate writes after the proxy attempts are exhausted',()=>{
  // The literal messages in @seap/db: the retry budget's final failure and CollectionProxyFailureError.
  const written=[...read('packages/db/src/collection-retry.ts').matchAll(/error='(Cerere prin proxy[^']*)'/g),...read('packages/db/src/collection.ts').matchAll(/new CollectionProxyFailureError\('([^']*)'\)/g)].map(m=>m[1]!);
  expect(written.length).toBeGreaterThanOrEqual(3);
  for(const message of written){expect(message.startsWith(PROXY_FAILURE_PREFIX)).toBe(true);expect(isProxyFailure(message)).toBe(true);}
 });
 it('leaves validation, unavailable, interrupted and unknown failures alone',()=>{
  for(const error of ['Detaliu SEAP: identificatorul intern lipsește.','Detaliu SEAP indisponibil (HTTP 404); celelalte anunțuri continuă.',
   'Worker întrerupt. Verifică răspunsul și arhiva înainte de reprogramare.','Cererea sau arhivarea nu a fost confirmată. Verifică jurnalul înainte de reluare.',
   'SEAP a refuzat accesul (403).','',null,undefined,42])expect(isProxyFailure(error)).toBe(false);
 });
});
