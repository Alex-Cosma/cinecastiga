/* The thirteen-question workbench. Queries and evidence stay tied to applied state. */
(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const clone=x=>JSON.parse(JSON.stringify(x));
  const icon=n=>window.UI.icon(({bars:'list',total:'database',time:'clock',category:'list',compare:'people',change:'clock',network:'people',flow:'road',check:'shield',distribution:'list',scatter:'compass',star:'building'})[n]||n), arrow=()=>icon('arrow');
  const chevron='<svg class="q-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
  const check='<svg class="q-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>';
  const profileBlocks=['compare','distribution','scatter','entity_card'];
  const authorityLabels={'2084803':'Spitalul Județean Cluj','2146445':'Primăria Cluj-Napoca','2143172':'Consiliul Județean Cluj','2146146':'CNAIR'};
  const kinds={all:'instituțiilor publice',spital:'spitalelor',oras_municipiu:'primăriilor de oraș',consiliu_judetean:'consiliilor județene',comuna:'primăriilor de comună',scoala:'școlilor'};
  const sourceNames={contracts:'Contracte',da:'Achiziții directe',all:'Toate achizițiile'};
  const S={loaded:null,applied:null,draft:null,result:null,layout:'visual',collapsed:false,changes:[],guide:0};
  let picker=null,anchor=null,field=null,choice=null,recordIndex=null;
  const profile=q=>profileBlocks.includes(q.block);
  const def=id=>window.CQ.blocks.find(b=>b.id===id);
  const formatMoney=n=>window.CQ.formatMoney(n);
  const countyName=s=>s==='all'?'toată România':fold(s)==='bucuresti'?'București':s;
  const authorityName=id=>authorityLabels[id]||window.MOCK_DATA.authorities.find(a=>a.id===id)?.name||'alege o instituție';
  const supplierName=id=>window.MOCK_DATA.records.find(r=>r.supplierId===id)?.supplierName||'alege o firmă';
  const isFocal=q=>['network','sankey','distribution'].includes(q.block);
  const period=q=>q.yearFrom===q.yearTo?String(q.yearFrom):q.yearFrom+'–'+q.yearTo;
  const queryUrl=q=>'#question?'+new URLSearchParams({qspec:JSON.stringify(q)});
  const smooth=()=>matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth';
  function sync(params){
    const key=params.qspec||'';if(key===S.loaded)return;
    let q=window.CQ.defaults;try{if(key)q=window.CQ.sanitize(JSON.parse(key));}catch(_){q=window.CQ.defaults;}
    S.applied=clone(q);S.draft=clone(q);S.loaded=key;S.result=window.CQ.run(q);S.changes=[];S.collapsed=false;
  }
  function differences(){
    if(!S.applied)return 0;
    const keys=Object.keys(S.draft).filter(k=>S.draft[k]!==S.applied[k]);
    return keys.filter(k=>!['yearFrom','yearTo'].includes(k)).length+(keys.some(k=>['yearFrom','yearTo'].includes(k))?1:0);
  }
  function rerender(selector){window.UI.rerender();if(selector)$(selector)?.focus({preventScroll:true});}
  function phrase(key,text){
    const changed=key==='period'?(S.draft.yearFrom!==S.applied.yearFrom||S.draft.yearTo!==S.applied.yearTo):S.draft[key]!==S.applied[key];
    return '<button class="q-phrase'+(changed?' q-changed':'')+'" data-action="q-pick" data-field="'+key+'" aria-haspopup="dialog"><span>'+esc(text)+'</span>'+chevron+'</button>';
  }
  function chip(key,text,remove=false){return '<span class="q-chip"><button data-action="q-pick" data-field="'+key+'" aria-haspopup="dialog">'+icon(key==='dataset'?'database':key==='county'?'pin':key==='period'?'clock':'list')+'<span>'+esc(text)+'</span>'+chevron+'</button>'+(remove?'<button class="q-chip-remove" data-action="q-remove" data-field="'+key+'" aria-label="Elimină condiția '+esc(text)+'">'+icon('x')+'</button>':'')+'</span>';}
  function focalPhrase(q){return phrase('focal',q.focusRole==='supplier'?supplierName(q.supplierId):authorityName(q.authorityId));}
  function sentence(q){
    const what=q.authorityId?phrase('authorityId',authorityName(q.authorityId)):phrase('authorityKind',kinds[q.authorityKind]||kinds.all);
    const where='<span class="q-phrase-unit">'+phrase('county',countyName(q.county))+',</span> în <span class="q-phrase-unit">'+phrase('period',period(q))+'<span class="q-question-mark">?</span></span>';
    switch(q.block){
      case 'table':return q.dim==='supplier'?'Cine furnizează '+what+'<br class="q-desktop-break"> din '+where:q.dim==='county'?'Cum se ordonează '+phrase('dim','județele')+' după achiziții în '+phrase('period',period(q))+'?':'Ce '+phrase('authorityKind',q.authorityKind==='all'?'instituții':({spital:'spitale',oras_municipiu:'primării de oraș',consiliu_judetean:'consilii județene',comuna:'primării de comună',scoala:'școli'})[q.authorityKind])+' cumpără cel mai mult din '+where;
      case 'stat':return (q.measure==='count'?'Câte achiziții apar în înregistrările ':'Cât valorează achizițiile ')+what+'<br class="q-desktop-break"> din '+where;
      case 'timeseries':return 'Cum evoluează achizițiile '+what+'<br class="q-desktop-break"> din '+where;
      case 'map':return 'Cum se împart achizițiile '+what+'<br class="q-desktop-break"> pe județe, în '+phrase('period',period(q))+'?';
      case 'breakdown':return 'Ce cumpără '+(q.authorityId?phrase('authorityId',authorityName(q.authorityId)):phrase('authorityKind',({all:'instituțiile publice',spital:'spitalele',oras_municipiu:'primăriile de oraș',consiliu_judetean:'consiliile județene',comuna:'primăriile de comună',scoala:'școlile'})[q.authorityKind]))+'<br class="q-desktop-break"> din '+where;
      case 'compare':return 'Compară profilul '+phrase('authorityId',authorityName(q.authorityId))+'<br class="q-desktop-break"> cu '+phrase('compareId',authorityName(q.compareId))+'.';
      case 'trend':return 'Ce '+phrase('dim',q.dim==='supplier'?'firme':q.dim==='county'?'județe':'instituții')+' au cea mai mare schimbare<br class="q-desktop-break"> între '+phrase('yearFrom',q.yearFrom)+' și '+phrase('yearTo',q.yearTo)+'?';
      case 'network':return 'Cu cine lucrează<br class="q-desktop-break"> '+focalPhrase(q)+'?';
      case 'sankey':return 'Cum se împart achizițiile '+focalPhrase(q)+'<br class="q-desktop-break"> între parteneri și domenii?';
      case 'fact_check':return 'A cumpărat '+phrase('authorityId',authorityName(q.authorityId))+'<br class="q-desktop-break"> de la '+phrase('supplierId',supplierName(q.supplierId))+'?';
      case 'distribution':return 'Unde se situează '+phrase('authorityId',authorityName(q.authorityId))+'<br class="q-desktop-break"> după indicele de risc?';
      case 'scatter':return 'Cine iese din tipar<br class="q-desktop-break"> după risc și volumul achizițiilor?';
      case 'entity_card':return 'Care instituție are<br class="q-desktop-break"> '+phrase('rankBy',q.rankBy==='risk'?'cel mai ridicat indice de risc':'cea mai mare valoare în profil')+'?';
      default:return esc(window.CQ.describe(q));
    }
  }
  function conditions(q){
    if(profile(q))return '<span class="c-profile-scope">'+icon('database')+' Profiluri istorice · achiziții directe</span><span class="c-profile-scope">4 profiluri disponibile în extras</span>'+(q.county!=='all'?chip('county',countyName(q.county),true):'')+(q.authorityKind!=='all'?chip('authorityKind',kinds[q.authorityKind],true):'');
    let html=chip('dataset',sourceNames[q.dataset]);
    if(q.authorityKind!=='all'&&(q.authorityId||['trend','network','sankey','fact_check'].includes(q.block)))html+=chip('authorityKind','Tip: '+(kinds[q.authorityKind]||q.authorityKind),true);
    if(['trend','network','sankey','fact_check'].includes(q.block)){
      if(q.block!=='trend')html+=chip('period',period(q));
      html+=chip('county',countyName(q.county));
    }
    if(q.category!=='all')html+=chip('category',q.category,true);
    if(q.supplierId&&!['fact_check','network','sankey'].includes(q.block))html+=chip('supplierId',supplierName(q.supplierId),true);
    html+='<button class="q-add" data-action="q-pick" data-field="add" aria-haspopup="dialog">'+icon('plus')+' Adaugă o condiție</button>';
    return html;
  }
  function presentation(q){
    if(q.block==='table')return 'Arată '+phrase('topN','primele '+q.topN)+' '+phrase('dim',q.dim==='supplier'?'firme':q.dim==='county'?'județe':'instituții')+', după '+phrase('measure',q.measure==='count'?'numărul de achiziții':'valoarea înregistrată')+'.';
    if(q.block==='trend')return 'Arată '+phrase('topN','primele '+q.topN)+', după diferența în lei dintre cei doi ani.';
    if(['stat','timeseries','map'].includes(q.block))return 'Măsoară '+phrase('measure',q.measure==='count'?'numărul de achiziții':'valoarea înregistrată')+'.';
    if(profile(q))return 'Perioada și definiția profilului sunt explicate lângă rezultat.';
    return 'Fiecare parte a rezultatului are propriile înregistrări-sursă.';
  }
  function editor(){
    const q=S.draft,n=differences(),errors=window.CQ.validate(q)||[];
    if(S.collapsed&&!n)return '<section class="q-editor q-compact"><div><p class="eyebrow">ÎNTREBAREA TA <span class="q-applied-dot"></span></p><h1>'+esc(window.CQ.describe(q))+'</h1><p>'+esc(S.result.scopeLabel)+'</p></div><button class="button secondary" data-action="q-expand">Modifică întrebarea '+icon('plus')+'</button></section>';
    return '<section class="q-editor c-editor'+(n?' q-editor-pending':'')+'"><div class="q-editor-top"><p class="eyebrow"><span class="q-accent-line"></span>ÎNTREBAREA TA <span class="c-type-number">'+String(window.CQ.blocks.findIndex(b=>b.id===q.block)+1).padStart(2,'0')+' / 13</span></p><span class="q-editor-tip">Cuvintele evidențiate se pot schimba</span></div><h1 class="q-sentence c-sentence c-sentence-'+q.block+'">'+sentence(q)+'</h1><div class="q-conditions">'+conditions(q)+'</div>'+(S.changes.length?'<div class="c-scope-change">'+icon('info')+'<div><b>Ce se schimbă odată cu întrebarea</b><p>'+S.changes.map(esc).join(' · ')+'</p></div></div>':'')+'<div class="q-editor-bottom"><div class="q-output-controls">'+presentation(q)+'</div><div class="q-apply-area">'+(n?'<button class="q-discard" data-action="q-discard">Renunță la modificări</button>':'<span class="q-ready">'+check+' Întrebare aplicată</span>')+'<button class="button primary q-apply" data-action="q-apply" '+(errors.length?'disabled':'')+'>'+(n?'Actualizează răspunsul':'Vezi răspunsul')+' '+arrow()+'</button></div></div>'+(errors.length?'<p class="c-query-errors" role="alert">'+errors.map(esc).join(' ')+'</p>':'')+(n?'<div class="q-pending-line" role="status"><span class="q-pending-dot"></span>'+n+' '+(n===1?'modificare neaplicată':'modificări neaplicate')+'<span>Răspunsul de mai jos păstrează întrebarea anterioară.</span></div>':'')+'</section>';
  }
  function answer(){
    const r=S.result,q=S.applied,n=differences(),isProfile=profile(q),count=r.rows.length;
    return '<section class="q-answer c-answer" id="q-answer" tabindex="-1"><div class="q-answer-heading"><div><p class="eyebrow">'+(n?'RĂSPUNSUL ANTERIOR':'RĂSPUNSUL TĂU')+' <span class="q-live-label">'+check+' Verificabil, până la sursă</span></p><h2>'+esc(r.title)+'</h2><p class="q-applied-scope">'+esc(r.scopeLabel)+'</p></div><div class="c-answer-actions"><button class="button primary c-sources-button" data-action="q-evidence">'+icon('list')+' Vezi înregistrările <b>'+count.toLocaleString('ro-RO')+'</b></button><button class="button secondary q-save" data-action="q-save">'+icon('folder')+' '+(n?'Salvează răspunsul afișat':'Salvează în anchetă')+'</button></div></div><div class="c-proof-strip"><span class="c-proof-icon">'+icon('shield')+'</span><span><b>'+count.toLocaleString('ro-RO')+' înregistrări</b><small>'+(isProfile?'Baza exactă a profilurilor':'În întrebarea aplicată')+'</small></span><span class="c-proof-arrow">→</span><span><b>'+formatMoney(r.total)+'</b><small>'+(isProfile?'Valoare înregistrată în profil':'Suma valorilor sursă')+'</small></span><span class="c-proof-arrow">→</span><span class="c-proof-result"><b>'+esc(def(q.block)?.label||'Răspunsul')+'</b><small>Calculul și selecția la vedere</small></span><button class="text-button" data-action="q-evidence">Verifică tu '+arrow()+'</button></div>'+(isProfile?'<div class="c-profile-notice">'+icon('info')+'<p><b>Profilul include și oferte neacceptate.</b> Valorile reproduc baza de calcul existentă. Înregistrările și stările lor pot fi verificate integral; acestea nu sunt plăți sau exclusiv achiziții atribuite.</p></div>':'')+'<div class="c-result-toolbar c-toolbar-'+q.block+'"><span>'+esc(def(q.block)?.description||'')+'</span><div class="segmented q-segmented" aria-label="Afișare"><button class="'+(S.layout==='visual'?'active':'')+'" data-action="q-layout" data-layout="visual" aria-pressed="'+(S.layout==='visual')+'">'+icon('eye')+' Vizual</button><button class="'+(S.layout==='table'?'active':'')+'" data-action="q-layout" data-layout="table" aria-pressed="'+(S.layout==='table')+'">'+icon('list')+' Tabel</button></div></div>'+window.Answers.render(r,S.layout)+'<div class="c-result-foot"><button class="text-button" data-action="q-share">'+icon('link')+' Copiază întrebarea</button><button class="text-button" data-action="q-evidence">'+icon('download')+' Datele și exportul CSV</button><span>'+esc(r.scopeNote||'')+'</span></div><div class="c-evidence-promise"><div class="c-paper-glyph" aria-hidden="true"><span>SEAP</span><i></i><i></i><i></i></div><div><p class="eyebrow">CIFRELE NU CER ÎNCREDERE OARBĂ.</p><h3>Ai întrebări despre un rezultat? <br>Începe cu înregistrările lui.</h3><p>Vezi cine, ce, când și la ce valoare. Deschide sursa SEAP sau exportă datele ca să faci propriile calcule.</p></div><button class="button secondary" data-action="q-evidence">Deschide sursele '+arrow()+'</button></div><div class="c-next-questions"><div><p class="eyebrow">CONTINUĂ DE AICI</p><h3>Ce ai vrea să verifici mai departe?</h3></div>'+followups(q).map(id=>'<button data-action="q-kind" data-kind="'+id+'">'+icon(def(id)?.icon||'arrow')+'<span>'+esc(def(id)?.label||id)+'</span>'+arrow()+'</button>').join('')+'</div></section>';
  }
  function followups(q){const map={table:['network','fact_check','trend'],stat:['breakdown','timeseries','table'],timeseries:['trend','breakdown','table'],map:['table','breakdown','timeseries'],breakdown:['table','sankey','fact_check'],compare:['distribution','network','fact_check'],trend:['timeseries','table','fact_check'],network:['fact_check','sankey','compare'],sankey:['network','breakdown','fact_check'],fact_check:['network','timeseries','table'],distribution:['scatter','compare','entity_card'],scatter:['distribution','compare','entity_card'],entity_card:['distribution','compare','network']};return map[q.block]||['table','stat','network'];}
  function guide(){if(!S.guide)return '';const s=[['Pornește de la ce vrei să afli.','Toate cele 13 întrebări sunt în catalog. Alege una, apoi schimbă expresiile evidențiate.'],['Fă întrebarea mai precisă.','Adaugă condiții și aplică-le când ești gata. Rezultatul anterior rămâne vizibil.'],['Verifică fiecare cifră.','„Vezi înregistrările” deschide lista completă, calculul, exportul și linkurile directe SEAP.']][S.guide-1];return '<aside class="q-guide"><span class="q-guide-number">0'+S.guide+'</span><div><b>'+s[0]+'</b><p>'+s[1]+'</p></div><div class="q-guide-actions"><span>'+S.guide+' / 3</span><button class="text-button" data-action="q-guide-next">'+(S.guide===3?'Am înțeles':'Mai departe')+' '+arrow()+'</button><button class="icon-button" data-action="q-guide-close" aria-label="Închide ghidul">'+icon('x')+'</button></div></aside>';}
  function render(params={}){
    sync(params);const q=S.draft;
    return '<div class="q-page c-page"><div class="q-breadcrumb"><div><a href="#home">Descoperă</a><span>/</span><b>Construiește o întrebare</b></div><button class="text-button" data-action="q-guide">'+icon('eye')+' Arată-mi cum</button></div><div class="q-page-intro"><div><h2>Curiozitatea ta. Datele, la vedere.</h2><p>13 feluri de a întreba. De fiecare dată, până la sursă.</p></div><span class="c-transparency-mark">'+icon('shield')+' TRANSPARENȚĂ, DE LA PRIMUL CLICK</span></div>'+guide()+'<div class="c-question-navigation"><div class="q-kind-tabs">'+['table','timeseries','breakdown'].map(id=>'<button data-action="q-kind" data-kind="'+id+'" class="'+(q.block===id?'active':'')+'" aria-pressed="'+(q.block===id)+'">'+icon(def(id)?.icon||'list')+esc(({table:'Cine câștigă?',timeseries:'Cum se schimbă în timp?',breakdown:'Pe ce se duc banii?'})[id])+'</button>').join('')+'</div><button class="c-catalog-button" data-action="q-catalog" aria-haspopup="dialog">'+icon('compass')+' Toate întrebările <span>13</span>'+chevron+'</button></div>'+editor()+answer()+'</div>';
  }
  function ensurePicker(){
    if(picker)return;picker=document.createElement('dialog');picker.id='q-picker';picker.setAttribute('aria-labelledby','q-picker-title');document.body.appendChild(picker);
    picker.addEventListener('close',()=>{document.body.style.overflow='';anchor?.classList.remove('q-picker-active');if(anchor?.isConnected)anchor.focus({preventScroll:true});});
    picker.addEventListener('click',e=>{if(e.target===picker){const r=picker.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)picker.close();}});
    window.addEventListener('resize',()=>{if(picker.open)position();});window.addEventListener('hashchange',()=>{if(picker.open)picker.close();});
  }
  function position(){
    if(matchMedia('(max-width:600px)').matches){picker.style.left='';picker.style.top='';return;}
    const r=anchor?.getBoundingClientRect()||{left:innerWidth/2-200,bottom:180};const box=picker.getBoundingClientRect();
    picker.style.left=Math.max(18,Math.min(innerWidth-box.width-18,picker.classList.contains('c-catalog-dialog')?(innerWidth-box.width)/2:r.left))+'px';
    picker.style.top=Math.max(18,Math.min(innerHeight-box.height-18,picker.classList.contains('c-catalog-dialog')?95:r.bottom+12))+'px';
  }
  function showPicker(title,intro,body,invoker,catalog=false){
    ensurePicker();if(!picker.open)anchor=invoker;picker.classList.toggle('c-catalog-dialog',catalog);
    picker.innerHTML='<div class="q-picker-head"><h2 id="q-picker-title">'+esc(title)+'</h2><button class="icon-button" data-action="q-picker-close" aria-label="Închide fără modificări">'+icon('x')+'</button></div><p class="q-picker-intro">'+esc(intro)+'</p>'+body;
    picker.querySelectorAll('.q-choice').forEach(b=>b.tabIndex=b.getAttribute('aria-checked')==='true'?0:-1);
    if(!picker.open)picker.showModal();document.body.style.overflow='hidden';anchor?.classList.add('q-picker-active');position();
    requestAnimationFrame(()=>(picker.querySelector('[autofocus]')||picker.querySelector('[aria-checked="true"]')||picker.querySelector('input')||picker.querySelector('button'))?.focus());
  }
  function footer(label='Păstrează alegerea',submit=false){return '<div class="q-picker-footer"><button type="button" class="text-button" data-action="q-picker-close">Renunță</button><button class="button primary" '+(submit?'type="submit"':'data-action="q-picker-commit"')+'>'+label+' '+check+'</button></div>';}
  function catalogue(el){
    field='catalog';const groups=[...new Set(window.CQ.blocks.map(b=>b.group))];
    const body='<label class="q-picker-search">'+icon('search')+'<input id="c-catalog-search" type="search" placeholder="De exemplu: cine, comparație, relație, risc…" aria-label="Caută o întrebare" autofocus></label><div class="c-catalog-grid">'+groups.map(g=>'<section class="c-catalog-group"><h3>'+esc(g)+'</h3>'+window.CQ.blocks.filter(b=>b.group===g).map(b=>'<button class="c-catalog-item '+(S.draft.block===b.id?'selected':'')+'" data-action="q-catalog-select" data-kind="'+b.id+'" data-search-text="'+esc(fold(b.label+' '+b.description+' '+b.id+' '+g))+'"><span class="c-catalog-glyph c-glyph-'+b.id+'">'+catalogGlyph(b.id)+'</span><span><b>'+esc(b.label)+'</b><small>'+esc(b.description)+'</small></span>'+(b.id===S.draft.block?check:arrow())+'</button>').join('')+'</section>').join('')+'</div><p class="q-search-empty" hidden>Nicio întrebare găsită. Încearcă „risc”, „total” sau „parteneri”.</p><div class="c-catalog-footer">'+icon('shield')+' Fiecare răspuns are calculul și înregistrările la îndemână.</div>';
    showPicker('Ce vrei să afli?','Alege o întrebare. O poți face cât de precisă ai nevoie.',body,el,true);
  }
  function catalogGlyph(id){const paths={table:'M3 5h21M3 12h16M3 19h10',stat:'M6 7h16M14 3v18M6 17h16',timeseries:'m3 19 6-8 5 3 10-10',map:'m3 5 7-3 7 3 7-3v18l-7 3-7-3-7 3ZM10 2v18M17 5v18',breakdown:'M3 4h21v17H3ZM3 11h21M12 4v17',compare:'M3 5h8v16H3ZM17 5h8v16h-8',trend:'M3 20h7V9H3ZM17 20h7V3h-7',network:'M14 12 4 4M14 12 24 4M14 12 4 21M14 12l10 9',sankey:'M3 5h6c6 0 6 15 12 15h4M3 20h6c6 0 6-15 12-15h4',fact_check:'m4 12 6 6L23 4',distribution:'M3 21v-5h5V7h5V3h5v8h5v10',scatter:'M3 2v20h22M7 17h.1M10 13h.1M16 7h.1M21 15h.1M23 4h.1',entity_card:'M3 4h22v18H3ZM8 15l3-3 3 2 5-7'};return '<svg viewBox="0 0 28 26" aria-hidden="true"><path d="'+paths[id]+'"/></svg>';}
  function openField(key,el){
    field=key;choice=S.draft[key];const q=S.draft;
    if(key==='add'){
      const items=[['dataset','Tipul achiziției','Contracte, achiziții directe sau împreună','database'],['category','Ce s-a cumpărat','Domenii pe baza codurilor CPV','list'],['authorityKind','Tipul instituției','Spitale, primării, consilii…','building'],['authorityId','O anumită instituție','Identitate exactă a cumpărătorului','building'],['supplierId','O anumită firmă','Identitate exactă a furnizorului','people'],['county','Județul instituției','Unde este sediul cumpărătorului','pin'],['period','Perioada','Anul sau intervalul atribuirii','clock']].filter(([k])=>!(q.block==='map'&&k==='county')&&!(q.block==='trend'&&k==='period')&&!(q.block==='table'&&q.dim==='authority'&&k==='authorityId')&&!(q.block==='table'&&q.dim==='supplier'&&k==='supplierId'));
      showPicker('Ce vrei să afli mai precis?','Condițiile se aplică împreună. Răspunsul se schimbă când le aplici.','<label class="q-picker-search">'+icon('search')+'<input id="c-choice-search" type="search" placeholder="Caută o condiție…" aria-label="Caută o condiție" autofocus></label><div class="q-picker-scroll">'+items.map(([k,label,sub,ic])=>'<button class="q-menu-item" data-action="q-sub-pick" data-field="'+k+'" data-search-text="'+esc(fold(label+' '+sub))+'">'+icon(ic)+'<span><b>'+label+'</b><small>'+sub+'</small></span>'+icon('plus')+'</button>').join('')+'<p class="q-search-empty" hidden>Nicio condiție găsită.</p></div><p class="c-picker-data-note">Condițiile folosesc datele reale incluse în acest prototip. Bilanțurile firmelor și administratorii nu sunt incluși în extras.</p>',el);return;
    }
    if(key==='period'){
      showPicker('În ce perioadă?','Anul atribuirii, cu ambele capete ale intervalului incluse.','<form id="c-period-form"><div class="q-period-presets">'+[[2026,2026,'2026'],[2025,2025,'2025'],[2024,2026,'2024–2026']].map(([a,b,t])=>'<button type="button" data-action="q-period-preset" data-from="'+a+'" data-to="'+b+'">'+t+'</button>').join('')+'</div><div class="q-period-fields"><label class="field">Din anul<input name="yearFrom" id="c-year-from" type="number" min="2018" max="2026" value="'+q.yearFrom+'" required></label><span>→</span><label class="field">Până în anul<input name="yearTo" id="c-year-to" type="number" min="2018" max="2026" value="'+q.yearTo+'" required></label></div><p class="q-picker-note">Selecția interactivă conține înregistrări din 2024–2026. Anul 2026 este parțial.</p><p id="c-form-error" role="alert"></p>'+footer('Păstrează perioada',true)+'</form>',el);return;
    }
    const auth=window.MOCK_DATA.authorities.map(a=>[a.id,authorityName(a.id),a.name]);
    const sup=[...new Map(window.MOCK_DATA.records.map(r=>[r.supplierId,r])).values()].sort((a,b)=>a.supplierName.localeCompare(b.supplierName)).map(r=>[r.supplierId,r.supplierName,'Furnizor ID '+r.supplierId]);
    const config={
      authorityKind:['Ce fel de instituții?','Instituțiile care cumpără.',Object.entries({all:'Toate instituțiile',spital:'Spitale',oras_municipiu:'Orașe și municipii',consiliu_judetean:'Consilii județene',comuna:'Comune',scoala:'Școli'}).map(([a,b])=>[a,b,['comuna','scoala'].includes(a)?'Fără înregistrări în eșantion':''])],
      county:['Unde sunt instituțiile?','Sediul cumpărătorului, nu adresa firmei sau locul lucrării.',[['all','Toată România','Toate instituțiile din extras'],['Cluj','Cluj','3 instituții în selecție'],['București','București','CNAIR în selecție']]],
      dataset:['Ce achiziții urmărești?','Sursa fiecărei înregistrări rămâne disponibilă.',[['contracts','Contracte','Contracte, acorduri-cadru și acte adiționale'],['da','Achiziții directe','Achiziții directe din selecție'],['all','Toate achizițiile','Cele două canale împreună']]],
      category:['Ce s-a cumpărat?','Domeniu stabilit din codul CPV.',[['all','Toate domeniile','Fără restricție de domeniu'],...[...new Set(window.MOCK_DATA.records.map(r=>r.category))].sort().map(v=>[v,v,''])]],
      authorityId:['Ce instituție?','Alegi exact cumpărătorul.',...[]],compareId:['Cu ce instituție compari?','Comparația folosește profilurile istorice ale celor două instituții.'],supplierId:['Ce firmă?','Alegi exact furnizorul din date.'],
      dim:['Ce vrei să ordonezi?','Fiecare rând reprezintă un element din această categorie.',[['supplier','Firme','Cine furnizează'],['authority','Instituții','Cine cumpără'],['county','Județe','Unde cumpără instituțiile']]],
      topN:['Câte rezultate să arătăm?','Sursele și totalurile includ toată selecția, indiferent de limita clasamentului.',[5,10,25,50].map(v=>[v,String(v)+' rezultate',''])],
      measure:['Cum măsurăm?','Aceleași înregistrări, două măsuri.',[['value','Valoarea înregistrată','Suma valorilor sursă, în lei'],['count','Numărul de achiziții','Câte înregistrări corespund întrebării']]],
      rankBy:['După ce criteriu?','Entitatea cu cea mai mare valoare a criteriului, din cele 4 profiluri reale.',[['value','Cea mai mare valoare în profil','Baza istorică a profilului, inclusiv oferte neacceptate'],['risk','Cel mai ridicat indice de risc','Semnal calculat, cu formula și dovezile disponibile']]],
      yearFrom:['Anul de început','Primul termen al comparației.',[2024,2025,2026].map(v=>[v,String(v),''])],yearTo:['Anul de sfârșit','Al doilea termen al comparației.',[2024,2025,2026].map(v=>[v,String(v),''])],
      focal:['Despre cine este întrebarea?','Rețeaua arată relații de achiziție, nu de proprietate.',[...auth.map(([id,n,s])=>['authority:'+id,n,s]),...sup.map(([id,n,s])=>['supplier:'+id,n,s])]],
    }[key];
    if(!config)return;
    if(key==='authorityId')config[2]=(!profile(q)&&!['fact_check'].includes(q.block)?[[null,'Orice instituție','Elimină instituția exactă']]:[]).concat(auth);
    if(key==='compareId')config[2]=auth.filter(a=>a[0]!==q.authorityId);
    if(key==='supplierId')config[2]=(q.block==='fact_check'?[]:[[null,'Orice firmă','Elimină firma exactă']]).concat(sup);
    if(key==='focal')choice=q.focusRole+':'+(q.focusRole==='supplier'?q.supplierId:q.authorityId);
    const [title,intro,choices]=config;
    const body=(choices.length>4?'<label class="q-picker-search">'+icon('search')+'<input id="c-choice-search" type="search" placeholder="Caută…" aria-label="Caută în opțiuni" autofocus></label>':'')+'<div class="q-picker-scroll" role="radiogroup" aria-label="'+esc(title)+'">'+choices.map(([v,n,s])=>'<button class="q-choice" role="radio" aria-checked="'+(fold(v)===fold(choice))+'" data-action="q-choice" data-value="'+esc(JSON.stringify(v))+'" data-search-text="'+esc(fold(n+' '+s))+'"><span><b>'+esc(n)+'</b>'+(s?'<small>'+esc(s)+'</small>':'')+'</span><span class="q-choice-circle">'+check+'</span></button>').join('')+'<p class="q-search-empty" hidden>Niciun rezultat în extras.</p></div>'+footer();
    showPicker(title,intro,body,el);
  }
  function commit(values){const key=anchor?.dataset.field;Object.assign(S.draft,values);picker.close();S.collapsed=false;rerender(key?'[data-action="q-pick"][data-field="'+key+'"]':'.q-apply');}
  function selectBlock(id){
    if(picker?.open)picker.close();
    const next=window.CQ.transition(S.draft,id);S.draft=next.query;S.changes=next.changes||[];S.collapsed=false;
    rerender('.q-apply');$('.q-editor').scrollIntoView({behavior:smooth(),block:'center'});
  }
  function apply(){
    const errors=window.CQ.validate(S.draft);if(errors?.length){window.UI.toast(errors.join(' '));return;}
    S.applied=window.CQ.sanitize(S.draft);S.draft=clone(S.applied);S.result=window.CQ.run(S.applied);S.loaded=JSON.stringify(S.applied);S.collapsed=true;S.changes=[];
    history.pushState(null,'',queryUrl(S.applied));rerender();$('#q-answer').focus({preventScroll:true});$('#q-answer').scrollIntoView({behavior:smooth(),block:'start'});window.UI.toast('Răspuns actualizat. Înregistrările și calculele sunt la îndemână.');
  }
  function indexRecords(){if(recordIndex)return recordIndex;recordIndex=new Map(window.MOCK_DATA.records.map(r=>[r.id,r]));(window.COMPLETE_PROFILES?.entities||[]).forEach(p=>p.records.forEach(r=>{if(!recordIndex.has(r.id))recordIndex.set(r.id,r);}));return recordIndex;}
  function snapshot(r=S.result){
    const q=r.query;
    return {id:'complete:'+JSON.stringify(q),type:'query',title:window.CQ.describe(q),subtitle:r.scopeLabel,amount:r.total,scope:r.scopeNote,sourceHash:window.COMPLETE_SOURCE_HASH,querySpec:clone(q),queryUrl:queryUrl(q),recordIds:r.rows.map(row=>row.id),recordCount:r.rows.length,records:r.rows.length<=100?clone(r.rows):[],resultSnapshot:{block:r.block,total:r.total,count:r.count,groups:r.groups.map(g=>({key:g.key,label:g.label,amount:g.amount,count:g.count,recordIds:g.rows.map(row=>row.id)}))},profileMetrics:profile(q)?(window.COMPLETE_PROFILES?.entities||[]).filter(p=>r.rows.some(row=>row.authorityId===p.id)).map(p=>({id:p.id,cri:p.cri,nDas:p.nDas,totalRon:p.totalRon,flags:p.flags,calculation:p.calculation,splitExample:p.splitExample,stateCounts:p.stateCounts})):null};
  }
  function save(result=S.result){window.Evidence.close();window.Investigations.openSave(snapshot(result));}
  function savedRows(item){const s=item.snapshot;if(s.sourceHash!==window.COMPLETE_SOURCE_HASH)return s.records||[];if(s.records?.length===s.recordCount)return s.records;const map=profile(s.querySpec)?new Map((window.COMPLETE_PROFILES?.entities||[]).flatMap(p=>p.records.map(r=>[r.id,r]))):indexRecords();return(s.recordIds||[]).map(id=>map.get(id)).filter(Boolean);}
  function renderSaved(item){
    const s=item.snapshot,rows=savedRows(item),key=esc(JSON.stringify(s.querySpec));
    return '<article class="inv-evidence"><div class="inv-evidence-icon">'+icon('folder')+'</div><div class="inv-evidence-content"><div class="inv-evidence-top"><span class="inv-type">Întrebare · '+esc(def(s.querySpec?.block)?.label||'Rezultat')+'</span><button class="text-button inv-remove" data-action="inv-remove-evidence" data-id="'+esc(item.id)+'" aria-label="Elimină întrebarea">'+icon('x')+'</button></div><h3>'+esc(item.title)+'</h3><p>'+esc(s.subtitle)+'</p><div class="inv-evidence-meta"><strong>'+formatMoney(s.amount)+'</strong><span>'+Number(s.recordCount).toLocaleString('ro-RO')+' înregistrări păstrate</span></div><p class="inv-evidence-scope">'+esc(s.scope)+'</p><div class="c-saved-actions"><button class="button secondary" data-action="q-saved-evidence" data-query="'+key+'" data-ids="'+esc(JSON.stringify(s.recordIds))+'" data-source-hash="'+esc(s.sourceHash)+'">'+icon('list')+' Vezi toate sursele</button><a class="text-button" href="'+esc(s.queryUrl)+'">Redeschide întrebarea '+arrow()+'</a></div><details class="inv-record-sources"><summary>Primele '+Math.min(3,rows.length)+' referințe SEAP</summary><ol class="inv-captured-records">'+rows.slice(0,3).map(r=>'<li><div><a href="'+esc(r.sourceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(r.code||r.id)+' · '+esc(r.title||r.cpvName)+' '+icon('arrow-up-right')+'</a><small>'+esc(r.supplierName)+' · '+esc(r.date)+'</small></div><strong>'+formatMoney(r.amount)+'</strong></li>').join('')+'</ol></details><p class="c-saved-reference-note">Sursele sunt legate de extrasul fix inclus în acest fișier. Exportul dosarului include toate înregistrările și linkurile lor.</p></div></article>';
  }
  function expandDossier(d){const copy=clone(d);copy.evidence.forEach(item=>{if(item.type==='query'&&item.snapshot?.sourceHash){item.snapshot.records=savedRows(item);item.snapshot.exportedSourceCount=item.snapshot.records.length;}});return copy;}
  async function share(){const link=location.href.split('#')[0]+queryUrl(S.applied);try{await navigator.clipboard.writeText(link);window.UI.toast('Întrebarea aplicată a fost copiată. Pe alt dispozitiv este necesar și fișierul HTML.');}catch(_){window.UI.modal('Aceeași întrebare, aceleași condiții.','<p class="modal-copy">Linkul păstrează întrebarea aplicată. Pentru alt dispozitiv, trimite și acest fișier HTML.</p><label class="field">Link<input id="c-share" readonly value="'+esc(link)+'"></label>',()=>$('#c-share').select());}}
  function handleAction(action,el){
    if(action.startsWith('q-ev-')){window.Evidence.handleAction(action,el);return;}
    switch(action){
      case 'q-catalog':catalogue(el);break;
      case 'q-catalog-select':case 'q-kind':selectBlock(el.dataset.kind);break;
      case 'q-pick':openField(el.dataset.field,el);break;
      case 'q-sub-pick':openField(el.dataset.field,anchor);break;
      case 'q-picker-close':picker.close();break;
      case 'q-choice':choice=JSON.parse(el.dataset.value);picker.querySelectorAll('.q-choice').forEach(b=>{b.setAttribute('aria-checked',b===el?'true':'false');b.tabIndex=b===el?0:-1;});break;
      case 'q-picker-commit':if(field==='focal'){const[role,id]=String(choice).split(':');commit({focusRole:role,authorityId:role==='authority'?id:null,supplierId:role==='supplier'?id:null});}else commit({[field]:choice});break;
      case 'q-period-preset':$('#c-year-from').value=el.dataset.from;$('#c-year-to').value=el.dataset.to;break;
      case 'q-remove':S.draft[el.dataset.field]=['category','county','authorityKind'].includes(el.dataset.field)?'all':null;rerender('.q-add');break;
      case 'q-discard':S.draft=clone(S.applied);S.changes=[];rerender('.q-apply');break;
      case 'q-apply':apply();break;
      case 'q-expand':S.collapsed=false;rerender('.q-apply');$('.q-editor').scrollIntoView({behavior:smooth(),block:'center'});break;
      case 'q-layout':S.layout=el.dataset.layout;rerender('[data-action="q-layout"][data-layout="'+S.layout+'"]');break;
      case 'q-evidence':window.Evidence.open(S.result,el.dataset.key||undefined);break;
      case 'q-save':save();break;
      case 'q-share':share();break;
      case 'q-saved-evidence':{const q=JSON.parse(el.dataset.query),r=window.CQ.run(q);if(el.dataset.sourceHash!==window.COMPLETE_SOURCE_HASH){window.UI.toast('Extrasul original nu este disponibil în acest fișier. Verifică exportul dosarului.');return;}const ids=JSON.parse(el.dataset.ids),map=profile(q)?new Map((window.COMPLETE_PROFILES?.entities||[]).flatMap(p=>p.records.map(row=>[row.id,row]))):indexRecords();r.rows=ids.map(id=>map.get(id)).filter(Boolean);r.count=r.rows.length;r.total=r.rows.reduce((n,row)=>n+Math.round(row.amount*100),0)/100;window.Evidence.open(r);break;}
      case 'q-guide':S.guide=1;S.collapsed=false;rerender('[data-action="q-guide-next"]');break;
      case 'q-guide-next':S.guide=S.guide===3?0:S.guide+1;rerender(S.guide?'[data-action="q-guide-next"]':'[data-action="q-guide"]');break;
      case 'q-guide-close':S.guide=0;rerender('[data-action="q-guide"]');break;
    }
  }
  document.addEventListener('input',e=>{
    if(!['c-catalog-search','c-choice-search'].includes(e.target.id))return;const term=fold(e.target.value);let n=0;
    picker.querySelectorAll('[data-search-text]').forEach(b=>{b.hidden=!b.dataset.searchText.includes(term);if(!b.hidden)n++;});
    picker.querySelectorAll('.c-catalog-group').forEach(g=>g.hidden=![...g.querySelectorAll('[data-search-text]')].some(b=>!b.hidden));
    $('.q-search-empty',picker).hidden=!!n;const choices=[...picker.querySelectorAll('.q-choice:not([hidden])')],selected=choices.find(b=>b.getAttribute('aria-checked')==='true')||choices[0];picker.querySelectorAll('.q-choice').forEach(b=>b.tabIndex=b===selected?0:-1);
  });
  document.addEventListener('submit',e=>{if(e.target.id!=='c-period-form')return;e.preventDefault();const f=new FormData(e.target),a=Number(f.get('yearFrom')),b=Number(f.get('yearTo'));if(a>b){$('#c-form-error').textContent='Anul de început trebuie să fie înaintea anului de sfârșit.';$('#c-year-from').focus();return;}commit({yearFrom:a,yearTo:b});});
  document.addEventListener('keydown',e=>{
    if(!picker?.open){if(e.target instanceof SVGElement&&e.target.closest('[data-action="q-evidence"]')&&['Enter',' '].includes(e.key)){e.preventDefault();handleAction('q-evidence',e.target.closest('[data-action="q-evidence"]'));}return;}
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();picker.close();return;}
    if(e.key==='/'&&!e.target.matches('input,textarea')){e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.target.matches('.q-choice')&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const opts=[...picker.querySelectorAll('.q-choice:not([hidden])')],idx=opts.indexOf(e.target),next=e.key==='Home'?0:e.key==='End'?opts.length-1:(idx+(e.key==='ArrowDown'?1:-1)+opts.length)%opts.length;opts[next].focus();handleAction('q-choice',opts[next]);}
  });
  window.Complete={renderSaved,expandDossier,save,sourceHash:window.COMPLETE_SOURCE_HASH,getResult:()=>S.result};
  window.Question={render,handleAction,leave:()=>{S.loaded=null;}};
})();
