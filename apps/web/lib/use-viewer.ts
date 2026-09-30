"use client";

import { useEffect, useState } from "react";
import { authClient } from "./auth-client";

/** Share the auth client's session request, with a stable streamed SSR snapshot. */
export function useViewer() {
  const { data, isPending, error } = authClient.useSession();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return { ready: hydrated && !isPending, userId: hydrated && !isPending ? data?.user?.id : undefined, error: hydrated ? error : null };
}
