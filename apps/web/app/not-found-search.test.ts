import { describe, expect, it } from "vitest";
import { parseTopicScope } from "../lib/topic-search/shared";
import { searchHref, searchWords } from "./not-found-search";

describe("404 search", () => {
  it("searches the words of the address's last segment", () => {
    expect(searchWords("/nu-exista")).toBe("nu exista");
    expect(searchWords("/achizitii/lucrari_de+drumuri.html")).toBe("lucrari de drumuri html");
    expect(searchWords("/entitati/99999999999")).toBe("99999999999");
    expect(searchWords("/cauta/Prim%C4%83ria%20Buz%C4%83u/")).toBe("Primăria Buzău");
    expect(searchWords("/x/%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("offers the plain search page when nothing searchable is left", () => {
    for (const path of ["/", "", "/a", "/x/-/"]) expect(searchWords(path)).toBeNull();
    expect(searchHref(null)).toBe("/cauta");
    expect(searchHref(null, "entities")).toBe("/cauta?tab=entities");
  });

  it("builds an address /cauta accepts", () => {
    const href = searchHref(searchWords(`/${"a".repeat(300)}`), "entities");
    expect(() => parseTopicScope(new URL(href, "http://x").searchParams)).not.toThrow();
    expect(new URL(searchHref("nu exista"), "http://x").searchParams.get("q")).toBe("nu exista");
  });
});
