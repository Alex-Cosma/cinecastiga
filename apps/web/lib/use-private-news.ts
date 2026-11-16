"use client";

import { useEffect, useState } from "react";

/**
 * What waits in the private space (audit Z8-33): invitations to a dossier and updates of watches to review. Read once
 * for a signed-in reader and shared by every caller for a minute, so moving between pages does not ask again.
 */
export interface PrivateNews { invites: number; updates: number }
let cached: { at: number; value: Promise<PrivateNews | null> } | null = null;
const TTL = 60_000;

export function readPrivateNews(): Promise<PrivateNews | null> {
  if (!cached || Date.now() - cached.at > TTL) cached = { at: Date.now(), value: fetch("/api/anchete/noutati", { cache: "no-store" }).then(r => r.ok ? r.json() as Promise<PrivateNews> : null).catch(() => null) };
  return cached.value;
}

export function usePrivateNews(signedIn: boolean): PrivateNews | null {
  const [news, setNews] = useState<PrivateNews | null>(null);
  useEffect(() => {
    if (!signedIn) { setNews(null); return; }
    let live = true;
    void readPrivateNews().then(value => { if (live) setNews(value); });
    return () => { live = false; };
  }, [signedIn]);
  return news;
}

/** "1 noutate", "3 noutăți": the number said beside a name. */
export const newsWords = (n: number) => n === 1 ? "1 noutate" : `${n} ${n < 20 ? "noutăți" : "de noutăți"}`;
