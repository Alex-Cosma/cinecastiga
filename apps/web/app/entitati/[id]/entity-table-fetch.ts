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
