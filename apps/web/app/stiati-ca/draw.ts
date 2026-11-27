import { MOSAIC_VARIANTS } from "./mosaic";

/*
 * „Alte fapte” (owner, 27 November 2026): the facts on the board are a draw from the published ones, another at each
 * visit, and the button deals another. A new draw takes first the facts the reader has not been shown since the pool last ran out, then
 * fills up from the rest; it never opens with the fact the last one opened with, and never keeps the arrangement.
 *
 * A board is mixed: at most SAME_KIND facts of one kind (a recipe: the largest contract of a county, a signal's
 * count) while the pool has others, so forty county records do not fill it.
 */
export interface Draw { ids: string[]; variant: number; toneShift: number }
/** How many facts the board shows at once. */
export const BOARD_SIZE = 8;
/** How many facts of one kind a board holds while there are others to show. */
export const SAME_KIND = 2;
/** A fact of the pool: its number and its kind. */
export interface PoolFact { id: string; kind: string }

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The first `take` of `ordered`, passing over a kind that already has SAME_KIND; what was passed over fills up the rest. */
function mixed(ordered: readonly PoolFact[], take: number): string[] {
  const kinds = new Map<string, number>(), picked: string[] = [], passed: string[] = [];
  for (const fact of ordered) {
    const have = kinds.get(fact.kind) ?? 0;
    if (picked.length < take && have < SAME_KIND) { picked.push(fact.id); kinds.set(fact.kind, have + 1); } else passed.push(fact.id);
  }
  return [...picked, ...passed].slice(0, take);
}

/** The board as the page opens: a draw of the pool, in any of the arrangements (made on the server, once per visit). */
export function firstDraw(pool: readonly PoolFact[], random: () => number, size = BOARD_SIZE): Draw {
  return { ids: mixed(shuffled(pool, random), size), variant: Math.floor(random() * MOSAIC_VARIANTS), toneShift: Math.floor(random() * 7) };
}

/**
 * The next draw. `seen` holds every fact shown since the pool last ran out and is updated in place. The facts not yet
 * seen come first, then the seen ones that are not on the board, then the board's own; the mix of kinds is kept over
 * all of them, so a pool whose unseen facts are all of one kind still gives a mixed board.
 */
export function nextDraw(pool: readonly PoolFact[], last: Draw, seen: Set<string>, random: () => number = Math.random, size = BOARD_SIZE): Draw {
  const take = Math.min(size, pool.length);
  for (const id of last.ids) seen.add(id);
  // The round is over when everything has been shown: only the board's own facts stay „seen”.
  if (pool.every((f) => seen.has(f.id))) { seen.clear(); for (const id of last.ids) seen.add(id); }
  const onBoard = new Set(last.ids);
  const fresh = [
    ...shuffled(pool.filter((f) => !seen.has(f.id)), random),
    ...shuffled(pool.filter((f) => seen.has(f.id) && !onBoard.has(f.id)), random),
    ...shuffled(pool.filter((f) => onBoard.has(f.id)), random),
  ];
  const ids = shuffled(mixed(fresh, take), random);
  // Another fact in the large tile, where there is one to put there.
  const lead = ids.findIndex((id) => id !== last.ids[0]);
  if (lead > 0) [ids[0], ids[lead]] = [ids[lead]!, ids[0]!];
  const step = 1 + Math.floor(random() * (MOSAIC_VARIANTS - 1));
  return { ids, variant: (last.variant + step) % MOSAIC_VARIANTS, toneShift: (last.toneShift + 1 + Math.floor(random() * 5)) % 7 };
}
