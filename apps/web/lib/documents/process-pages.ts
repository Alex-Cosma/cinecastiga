import {readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {runTool} from './process';
/** One page at a time, no total-page or 100k-character rejection. */
export async function readPdfPage(pdf:string,page:number,dir:string,signal:AbortSignal){
 const output=join(dir,'page-text.txt');
 await runTool('pdftotext',['-f',String(page),'-l',String(page),'-layout','-enc','UTF-8',pdf,output],signal);
 let text=await readFile(output,'utf8'),method='native';
 if(text.trim().length<30){
  const raster=join(dir,'page');await runTool('pdftoppm',['-f',String(page),'-l',String(page),'-singlefile','-scale-to','2400','-png',pdf,raster],signal);
  await runTool('tesseract',[raster+'.png',raster,'-l','ron+eng'],signal);
  text=await readFile(raster+'.txt','utf8');method='ocr';await rm(raster+'.png',{force:true});await rm(raster+'.txt',{force:true});
 }
 return {page,text:text.replace(/\u0000/g,'').trim(),method};
}
