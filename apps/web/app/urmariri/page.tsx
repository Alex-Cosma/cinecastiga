import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import MonitoringInbox from "./MonitoringInbox";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  if (!await sessionUserId()) redirect(`/login?next=${encodeURIComponent(`/urmariri${view === "watches" ? "?view=watches" : ""}`)}`);
  return <MonitoringInbox key={view} view={view === "watches" ? "watches" : "updates"} />;
}
