import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getMonitoringWatch, monitoringRunExists } from "@/lib/monitoring";
import { sessionUserId } from "@/lib/session";
import UpdateDetail from "../../../UpdateDetail";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await sessionUserId(), { id } = await params;
  const watch = user ? await getMonitoringWatch(user, id).catch(() => null) : null;
  return { title: watch ? `Verificare · ${watch.title.slice(0, 60)}` : "Urmăriri", robots: { index: false, follow: false } };
}
export default async function Page({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const user = await sessionUserId();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/urmariri/${id}/actualizari/${runId}`)}`);
  if (!await monitoringRunExists(user, id, runId)) notFound();
  return <UpdateDetail id={id} runId={runId} />;
}
