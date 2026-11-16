/*
 * The pages a „Descoperă” pager names (UX audit Z6-14, the pager of /semnale everywhere): the first, the current with its
 * neighbours and the last on a wide screen; on a phone the first, the current and the last, so a six-digit page fits.
 * A gap (…) stands where pages are skipped, for each screen apart.
 */
export interface PagerSlot { page: number; wide: boolean; phone: boolean; gapWide: boolean; gapPhone: boolean }

export function pagerSlots(page: number, pages: number): PagerSlot[] {
  const last = Math.max(0, pages - 1), at = Math.min(Math.max(0, page), last);
  const wide = new Set([0, Math.max(0, at - 1), at, Math.min(last, at + 1), last]);
  const phone = wide.size <= 4 ? wide : new Set([0, at, last]);
  let prevWide = -1, prevPhone = -1;
  return [...wide].sort((a, b) => a - b).map((p) => {
    const slot: PagerSlot = { page: p, wide: true, phone: phone.has(p), gapWide: prevWide >= 0 && p - prevWide > 1, gapPhone: phone.has(p) && prevPhone >= 0 && p - prevPhone > 1 };
    prevWide = p;
    if (phone.has(p)) prevPhone = p;
    return slot;
  });
}

/** „1–10”: the rows of a page, as /semnale writes them (page from 0). */
export function pagerRange(page: number, pageSize: number, total: number): [number, number] {
  return total ? [page * pageSize + 1, Math.min(total, (page + 1) * pageSize)] : [0, 0];
}
