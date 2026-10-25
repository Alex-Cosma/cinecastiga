import { countWords } from './answer-text';
import { formatInt } from '../format';

/**
 * A refused source request, with its HTTP status. A trend's sources and CSV
 * answer 409 when the data moved the answer's months since it was computed
 * (plan §2.8): the screen reloads the answer instead of listing other records.
 */
export class SourceRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
/** The answer on screen is older than the data its sources would list (409). */
export const answerOutdated = (error: unknown): boolean => error instanceof SourceRequestError && error.status === 409;

/** Shared by answer exports and the source drawer. Server totals, not the
 * currently displayed page, determine whether a download is partial. */
export async function requestSourceCsv(body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch('/api/ask/rows/csv', {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify(body), signal,
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/csv')) {
    const data = await response.json() as {error?:string};
    throw new SourceRequestError(data.error ?? 'Exportul nu a putut fi generat.', response.status);
  }
  const totalHeader=response.headers.get('x-total-rows'), exportedHeader=response.headers.get('x-exported-rows');
  const total=Number(totalHeader), exported=Number(exportedHeader);
  if (!/^\d+$/.test(totalHeader??'') || !/^\d+$/.test(exportedHeader??'') || !Number.isSafeInteger(total) || !Number.isSafeInteger(exported) || exported<0 || total<exported)
    throw Error('Exportul nu a putut fi verificat. Reîncearcă.');
  const blob=await response.blob();
  return {blob,filename:response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]??'surse-seap.csv',
    message:sourceCsvMessage(exported,total)};
}
/** The line after an export: every count with its noun through countWords (plan G10). */
export function sourceCsvMessage(exported:number,total:number):string {
  return exported<total
    ? `Export parțial: primele ${formatInt(exported)} din ${countWords(total,'înregistrare','înregistrări')}. Limita unui fișier este de 100.000 de rânduri; restrânge întrebarea pentru un export integral.`
    : `${countWords(exported,'înregistrare exportată','înregistrări exportate')}, cu valorile exacte și linkurile către surse.`;
}
export function downloadSourceCsv(file: {blob:Blob;filename:string}) {
  const href=URL.createObjectURL(file.blob),anchor=document.createElement('a');
  anchor.href=href;anchor.download=file.filename;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
}
