import { cookies } from "next/headers";

/**
 * Development only: holds a server render while a `ghost-hold=<ms>` cookie is sent, so a check can photograph a route
 * or Suspense ghost next to the loaded page and compare their heights. Inert in production builds.
 */
export async function ghostHold(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const ms = Number((await cookies()).get("ghost-hold")?.value);
  if (ms > 0 && ms <= 20000) await new Promise((resolve) => setTimeout(resolve, ms));
}
