import { describe, expect, it } from "vitest";
import { acquireExportSlot, exportSlotsInUse } from "./export-slots";

describe("export slots", () => {
  it("refuses beyond the cap and frees a slot on release", () => {
    const a = acquireExportSlot(2);
    const b = acquireExportSlot(2);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(acquireExportSlot(2)).toBeNull();
    a!();
    const c = acquireExportSlot(2);
    expect(c).not.toBeNull();
    b!();
    c!();
    expect(exportSlotsInUse()).toBe(0);
  });

  it("releases only once", () => {
    const a = acquireExportSlot(1);
    a!();
    a!();
    expect(exportSlotsInUse()).toBe(0);
    const b = acquireExportSlot(1);
    expect(b).not.toBeNull();
    expect(acquireExportSlot(1)).toBeNull();
    b!();
  });
});
