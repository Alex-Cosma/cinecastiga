import { aliasQueries } from '../ask/entity-alias';
import { fold } from './shared';

/** Conservative identity hints, not topic synonyms or automatic selection.
 * Prefixes are only allowed for administrative names (Cluj → Cluj-Napoca).
 * Keep different legal identities separate even when their names are identical. */
export function entityIntent(query: string) {
  const name = fold(query).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const aliases = aliasQueries(name);
  const administrative = /^(?:primaria|primarie|municipiul|orasul|oras|comuna|sectorul|sector|judetul|cj|consiliul? judetean|prefectura|institutia prefectului)\s+\S/.test(name);
  return {
    name,
    cui: /^(?:ro\s*)?\d+$/.test(name) ? name.replace(/^ro\s*/, '') : null,
    authorityNames: administrative ? aliases : [],
  };
}
