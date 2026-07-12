import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../src/client.js";
import { rawDocuments } from "../src/schema/raw.js";
import { eq } from "drizzle-orm";

// Integration test — requires docker Postgres (infra/docker-compose.yml)
// with migrations applied. Fails loud when the database is unreachable.

const TEST_SOURCE = "test:integration";

const { db, sql } = createDb();

beforeAll(async () => {
  await db.delete(rawDocuments).where(eq(rawDocuments.source, TEST_SOURCE));
});

afterAll(async () => {
  await db.delete(rawDocuments).where(eq(rawDocuments.source, TEST_SOURCE));
  await sql.end();
});

describe("raw.raw_documents", () => {
  const row = {
    source: TEST_SOURCE,
    externalId: "CN0000001",
    endpointVersion: "v1",
    contentHash: "abc123",
    payload: { title: "Achiziție test", valoare: 1234.56, items: [1, 2, 3] },
  };

  it("inserts and roundtrips jsonb payload", async () => {
    const [inserted] = await db.insert(rawDocuments).values(row).returning();
    expect(inserted).toBeDefined();
    expect(inserted!.payload).toEqual(row.payload);
    expect(inserted!.fetchedAt).toBeInstanceOf(Date);
  });

  it("rejects duplicate (source, external_id, content_hash)", async () => {
    const err = await db
      .insert(rawDocuments)
      .values(row)
      .then(() => null)
      .catch((e: unknown) => e as Error & { cause?: { code?: string } });
    expect(err).not.toBeNull();
    // Postgres unique_violation surfaces as the wrapped error's cause
    expect(err!.cause?.code).toBe("23505");
  });

  it("allows same external_id with different content_hash (changed payload)", async () => {
    const [inserted] = await db
      .insert(rawDocuments)
      .values({ ...row, contentHash: "def456" })
      .returning();
    expect(inserted).toBeDefined();
  });
});
