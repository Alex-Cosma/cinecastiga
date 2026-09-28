import {chromium} from '../../apps/web/node_modules/playwright-core/index.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {documents} from './data.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await mkdir('mockups/topic-search/fixtures',{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage(),manifest=[];
try {
  for(const doc of documents.filter(d=>d.state==='ready')){
    const html=`<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>${esc(doc.title)} — exemple fictive</title><link rel="icon" href="data:,"><link rel="stylesheet" href="../../src/fonts.css"><style>@page{size:A4;margin:20mm}*{box-sizing:border-box}body{margin:0;color:#243a30;background:white;font:15px/1.9 'IBM Plex Sans',sans-serif}.page{break-after:page}.page:last-child{break-after:auto}header{font-size:11px;border-bottom:1px solid #cbd4c3;padding-bottom:14px;color:#536253;display:flex;justify-content:space-between}h1{font:600 27px/1.3 'Bricolage Grotesque',sans-serif;margin:35px 0 28px}p{margin:0 0 24px}footer{margin-top:45px;border-top:1px solid #cbd4c3;padding-top:12px;font-size:11px;color:#536253}</style></head><body>${doc.pages.map((p,i)=>`<section class="page"><header><span>DOCUMENT FICTIV · ${doc.contract}</span><span>Pagina ${i+1} / ${doc.pages.length}</span></header><h1>${esc(p.title)}</h1>${p.paragraphs.map(t=>`<p>${esc(t)}</p>`).join('')}<footer>Exemplu fictiv, creat pentru testarea interfeței cinecâștigă?. Nu este un act oficial.<br>${esc(doc.title)}</footer></section>`).join('')}</body></html>`;
    await writeFile(`mockups/topic-search/fixtures/${doc.id}.html`,html);
    await page.goto(`http://127.0.0.1:3112/topic-search/fixtures/${doc.id}.html`);
    await page.evaluate(()=>document.fonts.ready);
    const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
    const n=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
    if(n!==doc.pages.length)throw Error(`${doc.id}: expected ${doc.pages.length} PDF pages, got ${n}`);
    await writeFile(`mockups/topic-search/fixtures/${doc.filename}`,pdf);
    manifest.push({id:doc.id,file:doc.filename,pages:n,sha256:createHash('sha256').update(pdf).digest('hex'),fictional:true});
  }
  await writeFile('mockups/topic-search/fixtures/manifest.json',JSON.stringify(manifest,null,2)+'\n');
  console.log(`Generated ${manifest.length} fictional PDFs with matching physical pages.`);
} finally {await browser.close();}
