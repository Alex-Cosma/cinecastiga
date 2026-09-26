import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import UpdateDetail from "../../../UpdateDetail";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  if (!await sessionUserId()) redirect(`/login?next=${encodeURIComponent(`/urmariri/${id}/actualizari/${runId}`)}`);
  return <UpdateDetail id={id} runId={runId} />;
}
