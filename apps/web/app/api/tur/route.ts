import { NextResponse } from "next/server";
import { getTourData } from "@/lib/tour-data";

/**
 * GET /api/tur — the welcome tour's figures (lib/tour-data.ts): every county and subject, last full year.
 * The same for every visitor and slow to change, so a browser keeps it for an hour.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getTourData(), { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    console.error("tour figures failed", error);
    // The tour still runs, without figures.
    return NextResponse.json({ error: "Cifrele turului nu sunt disponibile acum." }, { status: 503 });
  }
}
