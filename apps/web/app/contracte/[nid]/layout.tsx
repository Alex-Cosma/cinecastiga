import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { sharedSql } from "@/lib/shared-db";

/*
 * Above the contract's ghost (loading.tsx): an id that is no contract answers 404 before anything streams. Under the
 * loading boundary the page could only say "not found" inside a 200 (Next streams the ghost first). One lookup on the
 * unique contract id; the page reads the contract itself.
 */
export default async function ContractLayout({ params, children }: { params: Promise<{ nid: string }>; children: ReactNode }) {
  const { nid } = await params;
  if (!/^\d{1,18}$/.test(nid)) notFound();
  const [found] = await sharedSql()`select 1 from core.contracts where ca_notice_contract_id = ${nid} limit 1`;
  if (!found) notFound();
  return children;
}
