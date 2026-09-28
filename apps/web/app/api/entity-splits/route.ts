import { NextResponse } from "next/server";
import { getSplitPairsPaged } from "@/lib/marts";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  const role = params.get("rol");
  const page = Number(params.get("page") ?? "1");
  if (!/^[1-9]\d{0,17}$/.test(id) || !["autoritate", "furnizor"].includes(role ?? "") ||
      !Number.isSafeInteger(page) || page < 1) {
    return NextResponse.json({ ok: false, error: "Selecție invalidă." }, { status: 400 });
  }
  try {
    const result = await getSplitPairsPaged(id, role === "autoritate" ? "authority" : "supplier", page);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "Grupurile nu au putut fi încărcate. Încearcă din nou." }, { status: 503 });
  }
}
