import { cache } from "react";
import { getEntityFlags, getEntityProfile } from "@/lib/marts";

/*
 * The signals page's entity, read once per request by its layout (the 404 before the page streams), the browser title
 * and the page.
 */

export const loadFlags = cache(getEntityFlags);
export const loadProfile = cache(getEntityProfile);

export const validId = (id: string) => /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id));
