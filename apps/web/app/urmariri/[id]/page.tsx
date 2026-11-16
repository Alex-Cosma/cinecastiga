import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
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
  const user = await sessionUserId();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/urmariri/${id}`)}`);
  // A watch that does not exist or is not the reader's is a 404 with a way back, not an error to retry (Z8-22).
  if (!await getMonitoringWatch(user, id)) notFound();
  return <WatchDetail id={id} />;
}
