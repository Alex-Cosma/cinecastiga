import {
  listDirectAcquisitions,
  type ElicitatieClient,
} from "@seap/scraper-clients";
import type { IsoDate } from "../window.js";
import type { CpvCatalog } from "./cpv-catalog.js";

/**
 * Adaptive slicing for the DA list's ~2000-record window (DEC-004):
 * probe the day unsliced → overflow? fan out by cpvCategoryId → an
 * overflowing category fans out by cpvCodeId. Code-level slices are
 * returned unprobed (probing thousands is wasteful) — the scraper treats
 * leaf-level searchTooLong as data loss.
 */

export interface DaSlice {
  day: IsoDate;
  cpvCategoryId?: number;
  cpvCodeId?: number;
}

export function sliceKey(slice: DaSlice): string {
  if (slice.cpvCodeId !== undefined)
    return `c${slice.cpvCategoryId}:k${slice.cpvCodeId}`;
  if (slice.cpvCategoryId !== undefined) return `c${slice.cpvCategoryId}`;
  return "d";
}

async function probeOverflow(
  client: ElicitatieClient,
  slice: DaSlice,
): Promise<boolean> {
  const { data } = await listDirectAcquisitions(client, {
    finalizationDateStart: slice.day,
    finalizationDateEnd: slice.day,
    pageIndex: 0,
    pageSize: 1,
    ...(slice.cpvCategoryId !== undefined
      ? { cpvCategoryId: slice.cpvCategoryId }
      : {}),
    ...(slice.cpvCodeId !== undefined ? { cpvCodeId: slice.cpvCodeId } : {}),
  });
  return data.searchTooLong === true;
}

export async function resolveLeafSlices(
  client: ElicitatieClient,
  catalog: CpvCatalog,
  day: IsoDate,
): Promise<DaSlice[]> {
  if (!(await probeOverflow(client, { day }))) {
    return [{ day }];
  }

  const slices: DaSlice[] = [];
  for (const categoryId of await catalog.categories()) {
    const categorySlice: DaSlice = { day, cpvCategoryId: categoryId };
    if (!(await probeOverflow(client, categorySlice))) {
      slices.push(categorySlice);
      continue;
    }
    for (const codeId of await catalog.codesFor(categoryId)) {
      slices.push({ day, cpvCategoryId: categoryId, cpvCodeId: codeId });
    }
  }
  return slices;
}
