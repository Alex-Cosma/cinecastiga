import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { listPendingInvites } from "@/lib/anchete";
import { monitoringUnreadCount } from "@/lib/monitoring";

/** What waits in the private space (audit Z8-33): invitations to dossiers and updates of watches still to review. */
export async function GET() {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  const [invites, updates] = await Promise.all([listPendingInvites(uid).then(list => list.length).catch(() => 0), monitoringUnreadCount(uid).catch(() => 0)]);
  return NextResponse.json({ invites, updates }, { headers: { "Cache-Control": "no-store" } });
}
