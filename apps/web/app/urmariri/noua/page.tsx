import Link from "next/link";
import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import { decodeSpec } from "@/lib/ask/permalink";
import { validateSpec } from "@/lib/ask/spec";
import { evidenceOptions } from "@/lib/ask/evidence-request";
import FollowSetup from "../FollowSetup";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const values = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  if (!await sessionUserId()) redirect(`/login?next=${encodeURIComponent(`/urmariri/noua?${new URLSearchParams(values)}`)}`);
  const spec = validateSpec(decodeSpec(values.spec ?? ""));
  let optionsInput: unknown;
  try { optionsInput = JSON.parse(values.options ?? "{}"); } catch { optionsInput = null; }
  const options = optionsInput && typeof optionsInput === "object" && !Array.isArray(optionsInput) && Object.keys(optionsInput).every(key => ["scope", "search", "state", "stream"].includes(key)) ? evidenceOptions(optionsInput as Record<string, unknown>) : { error: "Selecția surselor nu este validă." };
  if ("error" in spec || "error" in options) return <section className="mon-empty"><h1>De unde vrei să pornești?</h1><p>Deschide o entitate sau aplică o întrebare, apoi alege „Urmărește modificările”. Condițiile aplicate vor fi păstrate exact.</p><Link className="mon-primary" href="/intreaba?mode=builder">Construiește întrebarea →</Link></section>;
  return <FollowSetup spec={spec} options={options} {...(values.title ? { title: values.title } : {})} {...(values.recipeId ? { recipeId: values.recipeId } : {})} {...(values.recipeVersion ? { recipeVersion: Number(values.recipeVersion) } : {})} />;
}
