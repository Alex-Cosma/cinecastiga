/** Destructive/mock integration suites must never inherit the application DB. */
export function requireDedicatedTestDatabase(value: string | undefined): string {
  if (!value) throw new Error("TEST_DATABASE_URL is required; use an empty, migrated disposable seap_test_* database");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL"); }
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:","postgresql:"].includes(url.protocol) || !/^seap_test_[a-z0-9_]+$/.test(name)) {
    throw new Error("Refusing integration test connection: the database name must start with seap_test_");
  }
  return value;
}
