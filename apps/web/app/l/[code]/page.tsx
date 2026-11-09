import { notFound, redirect } from "next/navigation";
import { shortLinkStore } from "@/lib/short-links";

export const dynamic = "force-dynamic";

/** cinecastiga.ro/l/<code> (owner, 9 November 2026): the long address it stands for, or the site's 404. */
export default async function ShortLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = await shortLinkStore().open(code);
  if (!target) notFound();
  redirect(target);
}
