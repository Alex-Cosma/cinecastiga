/** Shared by answer exports and the source drawer. Server totals, not the
 * currently displayed page, determine whether a download is partial. */
export async function requestSourceCsv(body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch('/api/ask/rows/csv', {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify(body), signal,
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/csv')) {
    const data = await response.json() as {error?:string};
    throw Error(data.error ?? 'Exportul nu a putut fi generat.');
  }
  const totalHeader=response.headers.get('x-total-rows'), exportedHeader=response.headers.get('x-exported-rows');
  const total=Number(totalHeader), exported=Number(exportedHeader);
  if (!/^\d+$/.test(totalHeader??'') || !/^\d+$/.test(exportedHeader??'') || !Number.isSafeInteger(total) || !Number.isSafeInteger(exported) || exported<0 || total<exported)
    throw Error('Exportul nu a putut fi verificat. Reîncearcă.');
  const blob=await response.blob();
  const count=(n:number)=>n.toLocaleString('ro-RO');
  return {blob,filename:response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]??'surse-seap.csv',
    message:exported<total
      ? `Export parțial: primele ${count(exported)} din ${count(total)} înregistrări. Limita unui fișier este de 100.000 de rânduri; restrânge întrebarea pentru un export integral.`
      : `${count(exported)} ${exported===1?'înregistrare exportată':'înregistrări exportate'}, cu valorile exacte și linkurile către surse.`};
}
export function downloadSourceCsv(file: {blob:Blob;filename:string}) {
  const href=URL.createObjectURL(file.blob),anchor=document.createElement('a');
  anchor.href=href;anchor.download=file.filename;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
}
