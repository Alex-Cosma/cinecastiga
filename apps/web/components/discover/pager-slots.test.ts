import { describe, expect, it } from "vitest";
import { pagerRange, pagerSlots } from "./pager-slots";

const wide = (page: number, pages: number) => pagerSlots(page, pages).map((s) => `${s.gapWide ? "… " : ""}${s.page + 1}`).join(" ");
const phone = (page: number, pages: number) => pagerSlots(page, pages).filter((s) => s.phone).map((s) => `${s.gapPhone ? "… " : ""}${s.page + 1}`).join(" ");

describe("the Descoperă pager (UX audit Z6-14)", () => {
  it("names the first, the current with its neighbours and the last page", () => {
    expect(wide(0, 403209)).toBe("1 2 … 403209");
    expect(wide(201604, 403209)).toBe("1 … 201604 201605 201606 … 403209");
    expect(wide(403208, 403209)).toBe("1 … 403208 403209");
    expect(wide(0, 1)).toBe("1");
    expect(wide(1, 3)).toBe("1 2 3");
  });
  it("keeps a phone's row short: the first, the current and the last once five would show", () => {
    expect(phone(0, 403209)).toBe("1 2 … 403209");
    expect(phone(201604, 403209)).toBe("1 … 201605 … 403209");
    expect(phone(2, 403209)).toBe("1 … 3 … 403209");
    expect(phone(1, 403209)).toBe("1 2 3 … 403209");
  });
  it("says which rows a page holds", () => {
    expect(pagerRange(0, 10, 4032082)).toEqual([1, 10]);
    expect(pagerRange(5, 10, 52)).toEqual([51, 52]);
    expect(pagerRange(0, 10, 0)).toEqual([0, 0]);
  });
});
