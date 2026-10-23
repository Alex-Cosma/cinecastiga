import type { DaTx } from "@/lib/marts";

/** Stable key of a table row (a consortium contract has one row per member). */
export const txRowKey = (t: Pick<DaTx, "src" | "sicapDaId" | "partnerId">, index: number) => `${t.src}-${t.sicapDaId}-${t.partnerId ?? index}`;

/**
 * Contract rows on the page that look like the same contract published under
 * another award notice: same contract number, date, value and partner, but a
 * different contract record and notice. They are labelled so two identical
 * lines do not read as double counting; nothing is merged or hidden.
 */
export function republishedContractKeys(rows: DaTx[]): Set<string> {
  const groups = new Map<string, { key: string; record: string; notice: string | null }[]>();
  rows.forEach((t, index) => {
    if (t.src !== "contract" || !t.daCode?.trim() || t.closingValue == null) return;
    const identity = [t.daCode.trim().toLowerCase(), t.finalizationDate ?? "", t.closingValue, t.partnerId ?? t.partnerName ?? ""].join("|");
    const list = groups.get(identity) ?? [];
    list.push({ key: txRowKey(t, index), record: t.sicapDaId, notice: t.caNoticeId });
    groups.set(identity, list);
  });
  const keys = new Set<string>();
  for (const list of groups.values()) {
    if (new Set(list.map(item => item.record)).size < 2) continue;
    if (new Set(list.map(item => item.notice ?? "")).size < 2) continue;
    for (const item of list) keys.add(item.key);
  }
  return keys;
}

/** Plain label for a contract row whose amount is not an ordinary contract value. */
export function contractKindLabel(kind: string | null | undefined): { text: string; title: string } | null {
  if (kind === "framework") return {
    text: "plafon acord-cadru",
    title: "Suma publicată este plafonul acordului-cadru: maximul care poate fi comandat, nu valoarea comenzilor efective (contractele subsecvente).",
  };
  if (kind === "amendment") return {
    text: "act adițional",
    title: "Valoarea publicată a unui act adițional; nu este neapărat o comandă nouă sau o creștere a contractului.",
  };
  return null;
}
