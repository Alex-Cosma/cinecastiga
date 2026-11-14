import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '@seap/db';
import { runNormalize } from './pipeline.js';

// Direct-award details are loaded a batch per transaction (14 November 2026); a batch that is not the simple case
// goes document by document, so a bad document is still quarantined alone and the cursor still passes it.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))) throw Error('Dedicated test database required');
const connection = url ? createDb(url) : null;
afterAll(async () => { await connection?.sql.end(); });

const detail = (da: number, items: number[], extra: Record<string, unknown> = {}) => ({
  directAcquisitionID: da, uniqueIdentificationCode: `DA${da}`, sysAcquisitionContractType: { text: 'Furnizare' },
  estimatedValue: 100, closingValue: 90, publicationDate: '2023-05-02T10:00:00', finalizationDate: '2023-05-03T10:00:00',
  sysDirectAcquisitionState: { text: 'Oferta acceptata' },
  directAcquisitionItems: items.map((id) => ({ directAcquisitionItemID: id, catalogItemName: `Produs ${id}`, itemQuantity: 2, itemMeasureUnit: 'bucata', catalogItemPrice: 10, itemClosingPrice: 9 })),
  ...extra,
});

describe.skipIf(!connection)('da-detail batches', () => {
  const q = () => connection!.sql;
  beforeEach(async () => {
    await q()`truncate core.quarantine,core.normalize_watermarks,core.da_items,core.direct_acquisitions,raw.raw_documents restart identity cascade`;
  });
  const insert = async (payloads: unknown[]) => {
    let n = 0;
    for (const payload of payloads) { n++; await q()`insert into raw.raw_documents(source,external_id,endpoint_version,content_hash,payload) values('fixture',${`fixture:da:${n}`},'da-detail:v1',${`fixture:da:${n}`},${JSON.stringify(payload)}::jsonb)`; }
  };

  it('loads a clean batch in one go: headers, lines, cursor', async () => {
    await insert([detail(1, [11, 12]), detail(2, [21]), detail(3, [])]);
    const report = await runNormalize(connection!.db, q(), { only: 'da-detail:v1' });
    expect(report.processed).toBe(3);
    expect(await q()`select sicap_da_id::int,da_code,closing_value::float from core.direct_acquisitions order by 1`).toEqual([
      { sicap_da_id: 1, da_code: 'DA1', closing_value: 90 }, { sicap_da_id: 2, da_code: 'DA2', closing_value: 90 }, { sicap_da_id: 3, da_code: 'DA3', closing_value: 90 },
    ]);
    expect((await q()`select sicap_item_id::int from core.da_items order by 1`).map((r) => r.sicap_item_id)).toEqual([11, 12, 21]);
    const [mark] = await q()`select last_raw_id::int n from core.normalize_watermarks where transform='da-detail:v1'`;
    expect(mark!.n).toBe(3);
  });

  it('a later document of the same acquisition wins, as one by one', async () => {
    await insert([detail(1, [11], { closingValue: 50 }), detail(1, [11, 12], { closingValue: 70 })]);
    await runNormalize(connection!.db, q(), { only: 'da-detail:v1' });
    expect(await q()`select closing_value::float from core.direct_acquisitions`).toEqual([{ closing_value: 70 }]);
    expect((await q()`select sicap_item_id::int from core.da_items order by 1`).map((r) => r.sicap_item_id)).toEqual([11, 12]);
  });

  it('quarantines a document that does not parse and loads the rest', async () => {
    await insert([detail(1, [11]), { directAcquisitionID: 'not a number' }, detail(3, [31])]);
    const report = await runNormalize(connection!.db, q(), { only: 'da-detail:v1' });
    expect(report.processed).toBe(2);
    expect(report.quarantined).toBe(1);
    expect((await q()`select sicap_da_id::int from core.direct_acquisitions order by 1`).map((r) => r.sicap_da_id)).toEqual([1, 3]);
    const [mark] = await q()`select last_raw_id::int n from core.normalize_watermarks where transform='da-detail:v1'`;
    expect(mark!.n).toBe(3);
  });

  it('a second run loads nothing again', async () => {
    await insert([detail(1, [11])]);
    await runNormalize(connection!.db, q(), { only: 'da-detail:v1' });
    const again = await runNormalize(connection!.db, q(), { only: 'da-detail:v1' });
    expect(again.processed).toBe(0);
  });
});
