/*
 * The motion of „Alte fapte” (owner, 27 November 2026: „cu o animație așa de spinning / shuffle”). The tiles turn
 * their faces down (their content fades, the coloured card stays), gather into one pile in the middle of the board,
 * the pile turns once, and the new tiles are dealt from it to their places, face up as they land. The facts and the
 * arrangement are swapped in the middle of the turn, when the pile moves fastest.
 *
 * Transform and opacity only; the tiles' layout is never animated. With reduced motion the board is swapped at once
 * (the caller checks `motionReduced`).
 */
const PILE_W = 150, PILE_H = 104;
const GATHER = 300, GATHER_STEP = 14, HALF_TURN = 180, DEAL = 440, DEAL_STEP = 30;
const REST = "translate(0px, 0px) rotate(0deg) scale(1, 1)";
/** At rest after the pile's whole turn: the dealt tiles only straighten on their way, they do not spin again. */
const REST_TURNED = "translate(0px, 0px) rotate(360deg) scale(1, 1)";
/** The whole run for a board of `count` tiles, for whatever turns alongside it. */
export const shuffleTime = (count: number) => GATHER + GATHER_STEP * count + 2 * HALF_TURN + DEAL + DEAL_STEP * count;

export const motionReduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const tilesOf = (board: HTMLElement) => Array.from(board.querySelectorAll<HTMLElement>(":scope > .fact-card"));
const finished = (animations: Animation[]) => Promise.all(animations.map((a) => a.finished));

/** Where the pile gathers, from the board's corner: the middle of the part of the board that is on screen. */
function pileSpot(board: HTMLElement) {
  const r = board.getBoundingClientRect();
  const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
  return { x: r.width / 2, y: (bottom > top ? (top + bottom) / 2 : r.top + r.height / 2) - r.top };
}

/** Tile `i` as a card of the pile: every card the same size, each a little askew. `turn` adds the pile's rotation. */
function inPile(tile: HTMLElement, board: DOMRect, spot: { x: number; y: number }, i: number): (turn: number) => string {
  const r = tile.getBoundingClientRect();
  const dx = board.left + spot.x - (r.left + r.width / 2) + ((i * 53) % 17) - 8;
  const dy = board.top + spot.y - (r.top + r.height / 2) + ((i * 29) % 13) - 6;
  const askew = ((i * 37) % 23) - 11;
  return (turn) => `translate(${dx}px, ${dy}px) rotate(${askew + turn}deg) scale(${PILE_W / r.width}, ${PILE_H / r.height})`;
}

/**
 * Gathers the board's tiles, calls `swap` (which must put the new tiles in the board before it returns), and deals
 * the new ones. Resolves when the board is at rest.
 */
export async function shuffleBoard(board: HTMLElement, swap: () => void): Promise<void> {
  const mine: Animation[] = [];
  const run = (tile: HTMLElement, from: string, to: string, timing: KeyframeAnimationOptions) => {
    const a = tile.animate([{ transform: from }, { transform: to }], { fill: "both", ...timing });
    mine.push(a);
    return a;
  };
  try {
    const spot = pileSpot(board);
    const old = tilesOf(board), rect = board.getBoundingClientRect();
    const pile = old.map((tile, i) => inPile(tile, rect, spot, i));
    board.setAttribute("data-shuffling", "");
    await finished(old.map((tile, i) => run(tile, REST, pile[i]!(0), { duration: GATHER, delay: i * GATHER_STEP, easing: "cubic-bezier(.5,0,.7,.5)" })));
    await finished(old.map((tile, i) => run(tile, pile[i]!(0), pile[i]!(180), { duration: HALF_TURN, easing: "cubic-bezier(.4,0,1,1)" })));
    swap();
    for (const a of mine.splice(0)) a.cancel();
    const fresh = tilesOf(board), now = board.getBoundingClientRect();
    const dealt = fresh.map((tile, i) => inPile(tile, now, spot, i));
    // Each tile's content comes back as that tile lands (stiati-ca.css reads --deal).
    fresh.forEach((tile, i) => tile.style.setProperty("--deal", `${i * DEAL_STEP}ms`));
    await finished(fresh.map((tile, i) => run(tile, dealt[i]!(180), dealt[i]!(360), { duration: HALF_TURN, easing: "cubic-bezier(0,0,.3,1)" })));
    board.removeAttribute("data-shuffling");
    await finished(fresh.map((tile, i) => run(tile, dealt[i]!(360), REST_TURNED, { duration: DEAL, delay: i * DEAL_STEP, easing: "cubic-bezier(.2,.7,.2,1)" })));
  } catch {
    // A cancelled animation (the page was left mid-run): the board is simply at rest.
  } finally {
    board.removeAttribute("data-shuffling");
    for (const a of mine) a.cancel();
  }
}
