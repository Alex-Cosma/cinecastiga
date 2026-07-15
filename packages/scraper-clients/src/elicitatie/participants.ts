import type { ElicitatieClient } from "./client.js";
import type { ListEnvelope } from "./types.js";

/**
 * SEAP participant enumeration. Contracting authorities are the complete,
 * finite partition used to fully scrape direct acquisitions (each DA belongs
 * to exactly one authority, and per-authority volume rarely hits the DA list's
 * 2000-row cap) — see the DA scraper. The participant `id` doubles as the DA
 * list's `contractingAuthorityId` filter (live-verified 2026-07-15).
 */
export interface ParticipantListItem {
  id: number;
  name?: string;
  cui?: string;
  county?: string;
  city?: string;
  [key: string]: unknown;
}

/** participantType 2 = Autoritate Contractantă. */
const AUTORITATE_CONTRACTANTA = { id: 2, text: "Autoritate Contractanta" };

export function listContractingAuthorities(
  client: ElicitatieClient,
  req: { pageIndex: number; pageSize: number },
): Promise<ListEnvelope<ParticipantListItem>> {
  return client.http
    .postJson<ListEnvelope<ParticipantListItem>>(
      "/api-pub/Participants/GetParticipants/",
      {
        pageSize: req.pageSize,
        pageIndex: req.pageIndex,
        participantType: AUTORITATE_CONTRACTANTA.id,
        participantTypeItem: AUTORITATE_CONTRACTANTA,
      },
    )
    .then((r) => r.data);
}

/** Every contracting authority, paged until exhausted (reconcile vs `total`). */
export async function fetchAllContractingAuthorities(
  client: ElicitatieClient,
  pageSize = 2000,
): Promise<ParticipantListItem[]> {
  const all: ParticipantListItem[] = [];
  let reportedTotal = 0;
  for (let pageIndex = 0; ; pageIndex += 1) {
    const page = await listContractingAuthorities(client, {
      pageIndex,
      pageSize,
    });
    reportedTotal = page.total;
    all.push(...page.items);
    if (page.items.length === 0 || all.length >= page.total) break;
  }
  if (all.length < reportedTotal) {
    throw new Error(
      `authority enumeration incomplete: got ${all.length} of ${reportedTotal}`,
    );
  }
  return all;
}
