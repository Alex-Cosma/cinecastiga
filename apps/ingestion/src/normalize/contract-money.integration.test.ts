import { afterAll, describe, expect, it } from 'vitest';
import { createDb, contractRonValue, contractOriginalValue, readContractMoneyQuality, type DbSql } from '@seap/db';
import { normalizeContractMoney } from './contract-money.js';
import { runContractMoneyQuality } from './contract-money-quality.js';
import { PARSERS } from './parsers.js';
import { sql as query } from 'drizzle-orm';

const isolated = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/').pathname.startsWith('/seap_test_currency_');
const { sql, db } = createDb();
afterAll(() => sql.end());
describe.skipIf(!isolated)('monetary database constraints and publication gate (isolated DB only)', () => {
  it('replays the actual parser twice without converting again or changing the legacy evidence', async () => {
    const rollback = Error('parser fixture rollback');
    await expect(db.transaction(async tx => {
      const ctx = { tx, cpvCatalog: new Set<string>(), cpvByPrefix: new Map<string,string>(), units: new Map() };
      const payload = { caNoticeId: -900004, items: [{ caNoticeContractId: -900004, caNoticeId: -900004,
        contractValue: 100, defaultCurrencyContractValue: 500, currencyRate: 5, currency: { text: 'EUR' } }] };
      await PARSERS['award-contracts:v1']!.load(ctx, -1n, payload);
      await PARSERS['award-contracts:v1']!.load(ctx, -2n, payload);
      const rows = await tx.execute(query`select original_value::text,original_currency,value_ron::text,
        contract_value::text,currency,amount_raw_id::text from core.contracts where ca_notice_contract_id=-900004`);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({original_value:'100',original_currency:'EUR',value_ron:'500',contract_value:'500',currency:'EUR',amount_raw_id:'-2'});
      throw rollback;
    })).rejects.toBe(rollback);
  });
  it('preserves legacy RON, excludes unknown units, rejects incoherent writes and blocks a stale source', async () => {
    const rollback = Error('currency fixture rollback');
    await expect(sql.begin(async tx => {
      const q = tx as unknown as DbSql;
      await q`insert into core.contracts(id,raw_id,ca_notice_id,ca_notice_contract_id,contract_value,currency)
        values(-900001,1,null,-900001,100,'RON'),(-900002,1,null,-900002,500,'EUR'),(-900003,-900010,-900010,-900003,500,'EUR')`;
      const source = {caNoticeId:-900010,items:[{caNoticeId:-900010,caNoticeContractId:-900003,contractValue:100,
        defaultCurrencyContractValue:500,currencyRate:5,currency:{text:'EUR'}}]};
      await q`insert into raw.raw_documents(id,source,external_id,endpoint_version,content_hash,payload)
        values(-900010,'elicitatie','award:-900010','award-contracts:v1',${'0'.repeat(64)},${JSON.stringify(source)}::jsonb)`;
      const money = normalizeContractMoney({contractValue:100,defaultCurrencyContractValue:500,currencyRate:5,currency:{text:'EUR'}});
      await q`update core.contracts set original_value=${money.originalValue},original_currency=${money.originalCurrency},
        value_ron=${money.valueRon},currency_rate=${money.currencyRate},amount_status=${money.amountStatus},amount_raw_id=raw_id,
        amount_evidence=${JSON.stringify(money.amountEvidence)}::jsonb where id=-900003`;
      const rows=await q`select c.id::text,${contractRonValue(q)}::text ron,${contractOriginalValue(q)}::text original
        from core.contracts c where c.id between -900003 and -900001 order by c.id`;
      expect(rows.map(r=>[r.id,r.ron,r.original])).toEqual([['-900003','500','100'],['-900002',null,null],['-900001','100','100']]);
      expect((await readContractMoneyQuality(q)).sourceErrors).toBe(0);
      // Numerically coherent, but different from the archived original:
      await q`update core.contracts set original_value=101,value_ron=505 where id=-900003`;
      expect((await readContractMoneyQuality(q)).sourceErrors).toBeGreaterThan(0);
      await q`update core.contracts set original_value=100,value_ron=500 where id=-900003`;
      await expect(tx.savepoint(async s => {
        await s`update core.contracts set value_ron=600 where id=-900003`;
      })).rejects.toThrow(/contracts_money_consistent/);
      await q`update core.contracts set raw_id=2 where id=-900003`;
      const [stale]=await q`select ${contractRonValue(q)} ron from core.contracts c where id=-900003`;
      expect(stale?.ron).toBeNull();
      const report=await readContractMoneyQuality(q);
      expect(report.structuralErrors).toBeGreaterThan(0);
      await expect(runContractMoneyQuality(q)).rejects.toThrow('Publication blocked');
      const [saved]=await q`select observation from marts.contract_money_quality where id=1`;
      expect(saved?.observation.structuralErrors).toBeGreaterThan(0);
      throw rollback;
    })).rejects.toBe(rollback);
  }, 180_000);
});
