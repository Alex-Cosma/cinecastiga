import { sessionUserId } from "@/lib/session";
import { getMonitoringDigestStatus } from "@/lib/monitoring-digests";

export const dynamic = "force-dynamic";
export async function GET() {
  const userId = await sessionUserId();
  if (!userId) return Response.json({ error:"Autentifică-te pentru a vedea preferințele de e-mail." }, { status:401 });
  return Response.json(await getMonitoringDigestStatus(userId), { headers:{ "Cache-Control":"private, no-store" } });
}
