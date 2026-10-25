import Term from "../../../components/Term";
import type { KitTip } from "./kit-types";

/**
 * The kit's (?) (component 16) is always the shared Term tip (kit G4): a real
 * button that opens on Enter, Space or a tap, closes on Escape (only the tip,
 * not its window), and floats above the nearest `.qb-tipwrap` on that row's
 * width, so it cannot widen the page; in a window it opens downward, inside
 * the window. Under 600 px the kit CSS gives it a 44 px target without
 * growing the row, and a chip with a (?) anchors its own (`.qb-tipwrap-sm`).
 */
export default function HelpTip({ tip }: { tip: KitTip }) {
  return "id" in tip ? <Term tip id={tip.id} /> : <Term tip title={tip.title} text={tip.text} />;
}

/**
 * Why a control is shown but cannot be used: read with the control through
 * aria-describedby (kit §8, aria-disabled rather than disabled), and shown in
 * a (?) beside it when the caller gives one.
 */
export function DisabledReason({ id, reason }: { id: string; reason: string }) {
  return <span id={id} className="qb-sr">{reason}</span>;
}
