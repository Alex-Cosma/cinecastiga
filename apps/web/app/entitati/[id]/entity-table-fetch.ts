/**
 * Whether the entity tables must request `url`. The server-rendered first page
 * (`initialData`) is shown without a request only while it is still the response
 * on screen for that same URL and no retry was asked for. A page change, a return
 * to page 1 after another page, or a retry always fetches.
 */
export function shouldFetchEntityTable<T>(state: {
  url: string;
  attempt: number;
  shown: { url: string; data: T | null } | null;
  initialData: T | undefined;
}): boolean {
  const { url, attempt, shown, initialData } = state;
  const showingInitial = initialData !== undefined && shown !== null && shown.url === url && shown.data === initialData;
  return attempt > 0 || !showingInitial;
}

/** What a reader sees when a table page fails: never the raw exception (SQL, network or parser text). */
export const ENTITY_TABLE_ERROR = "Înregistrările nu au putut fi încărcate acum. Încearcă din nou peste câteva momente.";
