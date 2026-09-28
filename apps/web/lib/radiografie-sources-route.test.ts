import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), sql: Object.assign(vi.fn(async () => []), { begin: vi.fn(), end: vi.fn(async () => { }) }) }));
vi.mock("@seap/db", () => ({ createDb: () => ({ sql: mocks.sql }) }));
vi.mock("@/lib/signal-evidence", () => ({ readSignalEvidence: vi.fn() }));
vi.mock("@/lib/radiografie-evidence", async () => ({ ...await import("./radiografie-evidence"), readRadiografieEvidence: mocks.read }));
vi.mock("@/lib/ask/evidence", () => import("./ask/evidence"));
import { GET } from "../app/api/evidence/sources/route";
beforeEach(() => { vi.clearAllMocks(); mocks.sql.begin.mockImplementation(async (_isolation, fn) => fn(mocks.sql)); });
describe("public radiography source pages", () => {
    it("rejects invalid identifiers and pages before reading", async () => { for (const query of ['id=invalid&type=slicing&supplierId=1', 'id=1&type=slicing&supplierId=1&page=-1', 'id=1&type=slicing&supplierId=1&page=1.5'])
        expect((await GET(new Request(`http://localhost/api/evidence/sources?kind=radiografie&format=json&${query}`))).status).toBe(400); expect(mocks.read).not.toHaveBeenCalled(); });
    it("keeps exact full totals and warnings while paging current source records", async () => { mocks.read.mockResolvedValue({ title: "Test", methodology: "test", sourceCount: 51, totalExact: "9007199254740993.001", warnings: ["Coverage changed"], context: {}, records: Array.from({ length: 51 }, (_, i) => ({ refId: String(i + 1), src: "da", valueExact: "1.001" })) }); const response = await GET(new Request('http://localhost/api/evidence/sources?kind=radiografie&id=1&type=slicing&supplierId=2&format=json&page=1')); const data = await response.json(); expect(data.records).toHaveLength(1); expect(data.records[0].refId).toBe('51'); expect(data.totalExact).toBe('9007199254740993.001'); expect(data.sourceCount).toBe(51); expect(data.warnings).toEqual(['Coverage changed']); expect(response.headers.get('cache-control')).toBe('no-store'); expect(mocks.sql.end).toHaveBeenCalled(); });
    it("returns an explicit missing-selection response", async () => { mocks.read.mockResolvedValue(null); const r = await GET(new Request('http://localhost/api/evidence/sources?kind=radiografie&id=1&type=pattern&patternId=2&format=json')); expect(r.status).toBe(404); expect(mocks.sql.end).toHaveBeenCalled(); });
});
