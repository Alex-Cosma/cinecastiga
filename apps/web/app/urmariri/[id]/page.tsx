import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMonitoringWatch } from "@/lib/monitoring";
import { sessionUserId } from "@/lib/session";
import WatchDetail from "../WatchDetail";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await sessionUserId(), { id } = await params;
  const watch = user ? await getMonitoringWatch(user, id).catch(() => null) : null;
  return { title: watch ? `${watch.title.slice(0, 70)} · urmărire` : "Urmăriri", robots: { index: false, follow: false } };
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await sessionUserId()) redirect(`/login?next=${encodeURIComponent(`/urmariri/${id}`)}`);
  return <WatchDetail id={id} />;
}
