export const FEEDBACK_CATEGORIES = { data:"Problemă cu datele", bug:"Ceva nu funcționează", idea:"Sugestie", other:"Altceva" } as const;
export type FeedbackCategory = keyof typeof FEEDBACK_CATEGORIES;
export type FeedbackInput = { id:string; category:FeedbackCategory; message:string; sourcePath:string | null };
export type FeedbackEntry = FeedbackInput & { createdAt:string };
export type FeedbackPage = { items:FeedbackEntry[]; total:number; page:number; pages:number };
export const feedbackIdValid = (id:string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Public paths only. Never attach investigation IDs, invitation tokens, or query strings. */
export function feedbackSourcePath(raw:unknown):string | null {
  if (typeof raw !== "string" || raw.length > 400 || !raw.startsWith("/") || raw.startsWith("//") || /[\\\s\u0000-\u001f]/.test(raw)) return null;
  const path = raw.split(/[?#]/)[0]!;
  return /^\/(?:$|(?:intreaba|cauta|domenii|harta|metodologie|supra-prag|semnale)\/?$|(?:achizitii|contracte|anunturi|semnale)\/\d+\/?$|entitati\/\d+(?:\/(?:radiografie(?:\/surse)?|comparatii|legaturi))?\/?$)/.test(path) ? path : null;
}

export function feedbackInput(raw:unknown):FeedbackInput | { error:string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error:"Verifică formularul și încearcă din nou." };
  const value = raw as Record<string,unknown>;
  if (Object.keys(value).some(key => !["id","category","message","sourcePath","website"].includes(key)) || value.website) return { error:"Verifică formularul și încearcă din nou." };
  if (typeof value.id !== "string" || !feedbackIdValid(value.id)) return { error:"Redeschide formularul și încearcă din nou." };
  if (typeof value.category !== "string" || !Object.hasOwn(FEEDBACK_CATEGORIES,value.category)) return { error:"Alege tipul problemei." };
  if (typeof value.message !== "string" || value.message.trim().length < 20 || value.message.trim().length > 3000 || value.message.includes("\0")) return { error:"Descrie problema în 20–3.000 de caractere." };
  return { id:value.id, category:value.category as FeedbackCategory, message:value.message.trim(), sourcePath:feedbackSourcePath(value.sourcePath) };
}
