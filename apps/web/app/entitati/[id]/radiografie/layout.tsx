import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { redirectCanonicalEntityInLayout } from "@/lib/entity-navigation";
import { isRadiografieAuthority } from "@/lib/radiografie";

/*
 * Above the Radiografie's ghost (loading.tsx, and its sources page's): a merged identity redirects (307) to its
 * canonical id and an id that is not an authority answers 404 before anything streams, instead of a 200 with the ghost
 * and then a meta refresh or "not found".
 */
export default async function RadiografieLayout({ params, children }: { params: Promise<{ id: string }>; children: ReactNode }) {
  const { id } = await params;
  await redirectCanonicalEntityInLayout(id);
  if (!await isRadiografieAuthority(id)) notFound();
  return children;
}
