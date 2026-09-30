export async function feedbackBody(request:Request):Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("format");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body");
  const chunks:Uint8Array[] = []; let size=0;
  try {
    for (;;) { const { value,done } = await reader.read(); if (done) break; size+=value.byteLength; if (size>16384) { await reader.cancel(); throw new Error("size"); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset=0; for (const chunk of chunks) { body.set(chunk,offset); offset+=chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}
