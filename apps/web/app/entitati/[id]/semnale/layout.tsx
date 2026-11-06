import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { redirectCanonicalEntityInLayout } from "@/lib/entity-navigation";
import { loadFlags, loadProfile, validId } from "./load";

/*
 * Above the page's ghost (loading.tsx): an id that is not an entity answers 404 before anything streams, instead of a
 * 200 with the ghost and then "not found"; a merged identity redirects (307) to its canonical id first. The page reads
 * the same entity from React's cache.
 */
export default async function EntitySignalsLayout({ params, children }: { params: Promise<{ id: string }>; children: ReactNode }) {
  const { id } = await params;
  await redirectCanonicalEntityInLayout(id);
  if (!validId(id)) notFound();
  const [, profile] = await Promise.all([loadFlags(id), loadProfile(id)]);
  if (!profile) notFound();
  return children;
}
