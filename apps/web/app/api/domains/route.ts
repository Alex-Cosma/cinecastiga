import { DomainYearError, getDomainDataset } from "@/lib/domains";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("year");
  if (raw !== null && !/^\d{4}$/.test(raw))
    return Response.json({ error: "An invalid. Alege un an din listă." }, { status: 400 });
  try {
    const data = await getDomainDataset(raw === null ? undefined : Number(raw));
    return Response.json(data, { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } });
  } catch (error) {
    if (error instanceof DomainYearError)
      return Response.json({ error: error.message, years: error.years }, { status: 400 });
    return Response.json({ error: "Datele pe domenii nu au putut fi încărcate acum. Încearcă din nou." }, { status: 503, headers: { "retry-after": "10" } });
  }
}
