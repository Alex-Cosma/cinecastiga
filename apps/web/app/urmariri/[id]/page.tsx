import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import WatchDetail from "../WatchDetail";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await sessionUserId()) redirect(`/login?next=${encodeURIComponent(`/urmariri/${id}`)}`);
  return <WatchDetail id={id} />;
}
