/** Pure, offline normalization. Decimal arithmetic never uses binary floats. */
type Amount = number | string | null | undefined;
export interface ContractMoneyInput {
  contractValue?: Amount;
  defaultCurrencyContractValue?: Amount;
  currencyRate?: Amount;
  currency?: { text?: string | null | undefined; localeKey?: string | null | undefined } | null | undefined;
}
export function decimal(value: Amount): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(s);
  if (!m) return null;
  const exponent = Number(m[4] ?? 0);
  if (Math.abs(exponent) > 30 || s.length > 100) return null;
  const digits = m[2]! + (m[3] ?? '');
  const place = m[2]!.length + exponent;
  const plain = place <= 0 ? `0.${'0'.repeat(-place)}${digits}`
    : place >= digits.length ? digits + '0'.repeat(place - digits.length)
    : `${digits.slice(0, place)}.${digits.slice(place)}`;
  return m[1] + plain;
}
function parts(s: string): [bigint, number] {
  const [whole, fraction = ''] = s.split('.');
  return [BigInt(whole! + fraction), fraction.length];
}
function agrees(a: string, b: string, rate = '1'): boolean {
  const [av, as] = parts(a), [bv, bs] = parts(b), [rv, rs] = parts(rate);
  const scale = Math.max(as, bs + rs, 2);
  const delta = av * 10n ** BigInt(scale - as) - bv * rv * 10n ** BigInt(scale - bs - rs);
  return (delta < 0n ? -delta : delta) <= 10n ** BigInt(scale - 2);
}
export function normalizeContractMoney(input: ContractMoneyInput) {
  const originalValue = decimal(input.contractValue);
  const reportedRon = decimal(input.defaultCurrencyContractValue);
  const currencyRate = decimal(input.currencyRate);
  const code = input.currency?.localeKey?.trim().toUpperCase();
  const text = input.currency?.text?.trim().toUpperCase();
  const originalCurrency = code && /^[A-Z]{3}$/.test(code) ? code : text && /^[A-Z]{3}$/.test(text) ? text : null;
  let amountStatus: 'ron' | 'converted' | 'missing_value' | 'missing_currency' | 'missing_conversion' | 'inconsistent' | 'invalid' = 'missing_value';
  let valueRon: string | null = null;
  const malformed = [input.contractValue, input.defaultCurrencyContractValue, input.currencyRate].some(v => v != null && v !== '' && decimal(v) === null);
  if (malformed || [originalValue, reportedRon].some(v => v !== null && parts(v)[0] < 0n)) amountStatus = 'invalid';
  else if (code && text && /^[A-Z]{3}$/.test(code) && /^[A-Z]{3}$/.test(text) && code !== text) amountStatus = 'inconsistent';
  else if (!originalCurrency) amountStatus = 'missing_currency';
  else if (originalValue === null) amountStatus = 'missing_value';
  else if (originalCurrency === 'RON') {
    if (reportedRon !== null && !agrees(reportedRon, originalValue)) amountStatus = 'inconsistent';
    else { amountStatus = 'ron'; valueRon = originalValue; }
  } else if (reportedRon === null || currencyRate === null || parts(currencyRate)[0] <= 0n) amountStatus = 'missing_conversion';
  else if (!agrees(reportedRon, originalValue, currencyRate)) amountStatus = 'inconsistent';
  else { amountStatus = 'converted'; valueRon = reportedRon; }
  return { originalValue, originalCurrency, valueRon, currencyRate, amountStatus,
    amountEvidence: { version: 1, source: 'SEAP award-contracts:v1', reportedRon,
      conversion: amountStatus === 'converted' ? 'source-equivalent-and-rate' : amountStatus === 'ron' ? 'original-RON' : null,
      toleranceRon: '0.01' } };
}
