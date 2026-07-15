import type { ElicitatieClient } from "./client.js";
import type { CpvSearchItem, ListEnvelope } from "./types.js";

/** A SICAP DA CPV category (the coarse 12-bucket grouping, ids 1..12). */
export interface CpvCategory {
  id: number;
  text?: string;
}

/**
 * The DA-list `cpvCategoryId` filter keys on SICAP's 12 coarse categories
 * (id 1..12), NOT the CPV code ids from searchCpvs. Used to reconstruct a
 * day's TRUE DA total (the 12 categories partition it) for completeness checks.
 * Live-verified 2026-07-15.
 */
export async function getCpvCategories(
  client: ElicitatieClient,
): Promise<CpvCategory[]> {
  const result = await client.http.getJson<{ results?: CpvCategory[] }>(
    "/api-pub/ComboPub/getCpvCategories",
  );
  return result.data.results ?? [];
}

/**
 * SEAP-internal CPV ids (cpvCodeId ≠ the CPV code string). Needed for the
 * adaptive slicing fan-out on the direct-acquisition list.
 */
export async function searchCpvs(
  client: ElicitatieClient,
  req: { filter?: string; pageIndex: number; pageSize: number },
): Promise<ListEnvelope<CpvSearchItem>> {
  const params = new URLSearchParams({
    filter: req.filter ?? "",
    pageIndex: String(req.pageIndex),
    pageSize: String(req.pageSize),
    parentId: "",
  });
  const result = await client.http.getJson<ListEnvelope<CpvSearchItem>>(
    `/api-pub/ComboPub/searchCpvs?${params.toString()}`,
  );
  return result.data;
}

/** Fetch the full CPV id list by paging until exhausted. */
export async function fetchAllCpvs(
  client: ElicitatieClient,
  pageSize = 100,
): Promise<CpvSearchItem[]> {
  const all: CpvSearchItem[] = [];
  for (let pageIndex = 0; ; pageIndex += 1) {
    const page = await searchCpvs(client, { pageIndex, pageSize });
    all.push(...page.items);
    if (all.length >= page.total || page.items.length === 0) break;
  }
  return all;
}
