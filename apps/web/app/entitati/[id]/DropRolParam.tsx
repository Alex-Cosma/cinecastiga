"use client";

import { useEffect } from "react";
import { writeAddress } from "@/lib/address";

/**
 * Drops `?rol=` from the address of an entity with a single role, without a reload: the role only picks a side of an
 * entity that both buys and sells (owner, 4 November 2026). Links from elsewhere may still carry it.
 */
export default function DropRolParam() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("rol")) return;
    url.searchParams.delete("rol");
    writeAddress(`${url.pathname}${url.search}${url.hash}`);
  }, []);
  return null;
}
