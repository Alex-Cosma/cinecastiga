import { searchCpvs, type ElicitatieClient } from "@seap/scraper-clients";

/**
 * SEAP-internal CPV hierarchy used for the direct-acquisition slicing
 * fan-out (DEC-004). Behind an interface because the live behavior of
 * searchCpvs' `parentId` param is unverified (LOW confidence) — Phase 5's
 * live smoke confirms or replaces the implementation.
 */
export interface CpvCatalog {
  /** Top-level cpvCategoryIds. */
  categories(): Promise<number[]>;
  /** SEAP-internal cpvCodeIds within a category. */
  codesFor(categoryId: number): Promise<number[]>;
}

export class SicapCpvCatalog implements CpvCatalog {
  private categoryCache: number[] | null = null;
  private codesCache = new Map<number, number[]>();

  constructor(private readonly client: ElicitatieClient) {}

  async categories(): Promise<number[]> {
    if (this.categoryCache) return this.categoryCache;
    const page = await searchCpvs(this.client, { pageIndex: 0, pageSize: 100 });
    this.categoryCache = page.items.map((i) => i.id);
    return this.categoryCache;
  }

  async codesFor(categoryId: number): Promise<number[]> {
    const cached = this.codesCache.get(categoryId);
    if (cached) return cached;
    const codes: number[] = [];
    for (let pageIndex = 0; ; pageIndex += 1) {
      const params = new URLSearchParams({
        filter: "",
        pageIndex: String(pageIndex),
        pageSize: "100",
        parentId: String(categoryId),
      });
      const result = await this.client.http.getJson<{
        total: number;
        items: Array<{ id: number }>;
      }>(`/api-pub/ComboPub/searchCpvs?${params.toString()}`);
      codes.push(...result.data.items.map((i) => i.id));
      if (codes.length >= result.data.total || result.data.items.length === 0)
        break;
    }
    this.codesCache.set(categoryId, codes);
    return codes;
  }
}
