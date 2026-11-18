import { describe, expect, it } from "vitest";
import { NOTICE_PAGE_SIZE, noticePage, noticePages } from "./paging";

describe("a notice's records pages", () => {
  it("shows ten records a page", () => {
    expect(NOTICE_PAGE_SIZE).toBe(10);
    expect(noticePages(42)).toBe(5);
    expect(noticePages(572)).toBe(58);
    expect(noticePages(10)).toBe(1);
    expect(noticePages(11)).toBe(2);
  });

  it("keeps one page for an empty or filtered-out list", () => {
    expect(noticePages(0)).toBe(1);
  });

  it("reads the page from the address, the first page when it is missing or not a page", () => {
    expect(noticePage(undefined)).toBe(1);
    expect(noticePage("")).toBe(1);
    expect(noticePage("3")).toBe(3);
    expect(noticePage("0")).toBe(1);
    expect(noticePage("-2")).toBe(1);
    expect(noticePage("abc")).toBe(1);
    expect(noticePage("2.7")).toBe(2);
    expect(noticePage("Infinity")).toBe(1);
  });
});
