import { notFound, redirect } from "next/navigation";
import { shortLinkStore } from "@/lib/short-links";
import { shortLinkTarget } from "@/lib/short-links-shared";

export const dynamic = "force-dynamic";

/**
 * cinecastiga.ro/l/<code> (owner, 9 November 2026): the long address it stands for, or the site's 404. The stored
 * address is checked again before the redirect (launch audit, 12 November 2026), so a row written before the stricter
 * check, or by hand, can never send a reader to another site.
 */
export default async function ShortLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const stored = await shortLinkStore().open(code);
  const target = stored ? shortLinkTarget(stored) : null;
  if (!target) notFound();
  redirect(target);
}
