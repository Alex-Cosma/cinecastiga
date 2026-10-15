import { describe, expect, it } from 'vitest';
import { normalizeContractMoney as normalize } from './contract-money.js';

describe('contract money: source units and exact conversions', () => {
  it('preserves the audited EUR amount and the separate SEAP equivalent', () => {
    expect(normalize({ contractValue: '5195772', defaultCurrencyContractValue: '27427441.23', currencyRate: '5.2788', currency: { text: 'EUR' } }))
      .toMatchObject({ originalValue: '5195772', originalCurrency: 'EUR', valueRon: '27427441.23', amountStatus: 'converted' });
  });
  it('keeps USD distinct from RON', () => {
    expect(normalize({ contractValue: '100.01', defaultCurrencyContractValue: '456.25', currencyRate: '4.562', currency: { localeKey: 'USD' } }))
      .toMatchObject({ originalValue: '100.01', originalCurrency: 'USD', valueRon: '456.25', amountStatus: 'converted' });
  });
  it('keeps exact RON and sub-cent values without converting again', () => {
    const input = { contractValue: '9999999999999999.001', currency: { text: 'RON' } };
    expect(normalize(input).valueRon).toBe(input.contractValue);
    expect(normalize(input)).toEqual(normalize(input));
    expect(normalize({ contractValue: 1e-7, currency: { text: 'ron' } }).valueRon).toBe('0.0000001');
  });
  it('accepts zero as known zero, never as missing', () => {
    expect(normalize({ contractValue: 0, currency: { text: 'RON' } })).toMatchObject({ amountStatus: 'ron', valueRon: '0' });
  });
  it.each([
    [{ contractValue: 100 }, 'missing_currency'],
    [{ currency: { text: 'RON' }, defaultCurrencyContractValue: 100 }, 'missing_value'],
    [{ contractValue: 100, currency: { text: 'EUR' } }, 'missing_conversion'],
    [{ contractValue: 100, defaultCurrencyContractValue: 500, currency: { text: 'EUR' } }, 'missing_conversion'],
    [{ contractValue: 100, defaultCurrencyContractValue: 500, currencyRate: 0, currency: { text: 'EUR' } }, 'missing_conversion'],
    [{ contractValue: 100, defaultCurrencyContractValue: 600, currencyRate: 5, currency: { text: 'EUR' } }, 'inconsistent'],
    [{ contractValue: 100, defaultCurrencyContractValue: 500, currency: { text: 'RON' } }, 'inconsistent'],
    [{ contractValue: 100, currency: { text: 'EUR', localeKey: 'RON' } }, 'inconsistent'],
    [{ contractValue: -1, currency: { text: 'RON' } }, 'invalid'],
    [{ contractValue: '1,23', currency: { text: 'RON' } }, 'invalid'],
    [{ contractValue: NaN, currency: { text: 'RON' } }, 'invalid'],
  ] as const)('excludes ambiguous values: %j', (input, status) => {
    expect(normalize(input)).toMatchObject({ amountStatus: status, valueRon: null });
  });
  it('rejects converting the already-converted amount a second time', () => {
    expect(normalize({ contractValue: 500, defaultCurrencyContractValue: 500, currencyRate: 5, currency: { text: 'EUR' } }))
      .toMatchObject({ amountStatus: 'inconsistent', valueRon: null });
  });
  it('uses a fixed one-ban source tolerance without float drift', () => {
    const base = { contractValue: '100', currencyRate: '5', currency: { text: 'EUR' } };
    expect(normalize({ ...base, defaultCurrencyContractValue: '500.01' }).amountStatus).toBe('converted');
    expect(normalize({ ...base, defaultCurrencyContractValue: '500.0101' }).amountStatus).toBe('inconsistent');
  });
});
