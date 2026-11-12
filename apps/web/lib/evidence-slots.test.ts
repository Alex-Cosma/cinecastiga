import { afterEach, describe, expect, it } from "vitest";
import { EvidenceBusyError, evidenceSlotState, withEvidenceSlot } from "./evidence-slots";

const g = globalThis as unknown as { __seapEvidenceSlots?: unknown };
afterEach(() => { delete g.__seapEvidenceSlots; });

function gate() {
  let open!: () => void;
  const done = new Promise<void>((resolve) => { open = resolve; });
  return { done, open };
}

describe("evidence read slots (launch audit H2, 12 November 2026)", () => {
  it("runs at most `max` reads at once and hands each freed slot to the next in line", async () => {
    const gates = [gate(), gate(), gate()];
    const order: number[] = [];
    const runs = gates.map((gt, i) => withEvidenceSlot(async () => { order.push(i); await gt.done; return i; }, 2, 1000));
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual([0, 1]);
    expect(evidenceSlotState()).toEqual({ busy: 2, waiting: 1 });
    gates[0]!.open();
    await runs[0];
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual([0, 1, 2]);
    expect(evidenceSlotState()).toEqual({ busy: 2, waiting: 0 });
    gates[1]!.open(); gates[2]!.open();
    expect(await Promise.all(runs)).toEqual([0, 1, 2]);
    expect(evidenceSlotState()).toEqual({ busy: 0, waiting: 0 });
  });

  it("refuses a reader that waited too long, and frees the slot when a read fails", async () => {
    const held = gate();
    const first = withEvidenceSlot(() => held.done, 1, 1000);
    await expect(withEvidenceSlot(async () => 1, 1, 20)).rejects.toBeInstanceOf(EvidenceBusyError);
    expect(evidenceSlotState()).toEqual({ busy: 1, waiting: 0 });
    held.open(); await first;
    await expect(withEvidenceSlot(async () => { throw new Error("boom"); }, 1, 20)).rejects.toThrow("boom");
    expect(evidenceSlotState()).toEqual({ busy: 0, waiting: 0 });
  });
});
