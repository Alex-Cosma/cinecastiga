(function () {
  'use strict';
  const D = window.MOCK_DATA;
  const $ = (s, root = document) => root.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nf = new Intl.NumberFormat('ro-RO', {maximumFractionDigits:2});
  const money = n => nf.format(n) + ' lei';
  const compact = n => n >= 1e9 ? nf.format(Math.round(n / 1e7) / 100) + ' mld.' : n >= 1e6 ? nf.format(Math.round(n / 1e4) / 100) + ' mil.' : nf.format(n);
  const sum = rows => rows.reduce((n, r) => n + r.amount, 0);
  const clone = x => JSON.parse(JSON.stringify(x));
  const i = name => window.UI.icon(name);
  const chevron = '<svg class="q-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
  const check = '<svg class="q-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>';
  const kindNames = {suppliers:'Cine câștigă?',years:'Cum se schimbă în timp?',categories:'Pe ce se duc banii?',total:'Cât se cumpără?'};
  const authorityNames = {spital:'spitalelor',oras_municipiu:'primăriilor de oraș',consiliu_judetean:'consiliilor județene',comuna:'primăriilor de comună',scoala:'școlilor',all:'instituțiilor publice'};
  const sourceNames = {contracts:'Contracte',da:'Achiziții directe',all:'Toate achizițiile'};
  const defaults = {kind:'suppliers',authorityKind:'spital',county:'Cluj',yearFrom:2024,yearTo:2026,dataset:'contracts',category:'all',supplierId:null,maxEmployees:null,measure:'value',topN:5};
  const qstate = {applied:clone(defaults),draft:clone(defaults),loadedKey:null,layout:'bars',guide:0,collapsed:false};
  let picker = null, pickerField = null, pickerAnchor = null, pickerChoice = null;

  function sanitize(input) {
    const q = clone(defaults), o = input && typeof input === 'object' ? input : {};
    for (const [key, choices] of Object.entries({kind:Object.keys(kindNames),authorityKind:Object.keys(authorityNames),dataset:Object.keys(sourceNames),measure:['value','count'],topN:[5,10,25]})) if (choices.includes(o[key])) q[key]=o[key];
    const counties = [...new Set(D.records.map(r=>r.county))];
    if (o.county==='all' || counties.some(c=>fold(c)===fold(o.county))) q.county=o.county;
    if ([...new Set(D.records.map(r=>r.category)),'all'].includes(o.category)) q.category=o.category;
    if (o.supplierId===null || D.records.some(r=>r.supplierId===o.supplierId)) q.supplierId=o.supplierId;
    if (o.maxEmployees===null || (Number.isInteger(o.maxEmployees) && o.maxEmployees>=0 && o.maxEmployees<=1000000)) q.maxEmployees=o.maxEmployees;
    if (Number.isInteger(o.yearFrom) && o.yearFrom>=2018 && o.yearFrom<=2026) q.yearFrom=o.yearFrom;
    if (Number.isInteger(o.yearTo) && o.yearTo>=q.yearFrom && o.yearTo<=2026) q.yearTo=o.yearTo;
    return q;
  }
  function sync(params) {
    const key=params.qspec||'';
    if (key===qstate.loadedKey) return;
    let q=defaults;
    try { if(key) q=sanitize(JSON.parse(key)); } catch (_) { q=defaults; }
    qstate.applied=clone(q);qstate.draft=clone(q);qstate.loadedKey=key;qstate.collapsed=false;
  }
  function differences() {
    const changed=Object.keys(defaults).filter(k=>qstate.applied[k]!==qstate.draft[k]);
    return changed.filter(k=>k!=='yearTo' && k!=='yearFrom').length + (changed.some(k=>k==='yearFrom'||k==='yearTo')?1:0);
  }
  function period(q) { return q.yearFrom===q.yearTo?String(q.yearFrom):q.yearFrom+'–'+q.yearTo; }
  function countyLabel(s) { return fold(s)==='bucuresti'?'București':s==='all'?'toată România':s; }
  function supplierName(id) {return D.records.find(r=>r.supplierId===id)?.supplierName || 'Firma aleasă';}
  function institutionKind(r) {return ({'2084803':'spital','2146445':'oras_municipiu','2143172':'consiliu_judetean'})[r.authorityId]||'other';}
  function company(id) {return (window.QUESTION_COMPANIES||{})[id]||{};}
  function rowsFor(q, ignoreEmployees=false) {
    return D.records.filter(r=>(q.authorityKind==='all'||institutionKind(r)===q.authorityKind)
      &&(q.county==='all'||fold(r.county)===fold(q.county))
      &&Number(r.date.slice(0,4))>=q.yearFrom&&Number(r.date.slice(0,4))<=q.yearTo
      &&(q.dataset==='all'||r.source===(q.dataset==='contracts'?'contract':'da'))
      &&(q.category==='all'||r.category===q.category)
      &&(!q.supplierId||r.supplierId===q.supplierId)
      &&(ignoreEmployees||q.maxEmployees===null||(Number.isFinite(company(r.supplierId).employees)&&company(r.supplierId).employees<=q.maxEmployees)));
  }
  function groupsFor(q, rows=rowsFor(q)) {
    const grouped=new Map();
    rows.forEach(r=>{
      const key=q.kind==='categories'?r.category:q.kind==='years'?r.date.slice(0,4):q.kind==='total'?'total':r.supplierId;
      if(!grouped.has(key)) grouped.set(key,{key,name:q.kind==='categories'?r.category:q.kind==='years'?key:q.kind==='total'?'Întreaga selecție':r.supplierName,rows:[],amount:0,count:0});
      const g=grouped.get(key);g.rows.push(r);g.amount+=r.amount;g.count++;
    });
    const groups=[...grouped.values()];
    return q.kind==='years'?groups.sort((a,b)=>a.key.localeCompare(b.key)):groups.sort((a,b)=>q.measure==='count'?b.count-a.count||b.amount-a.amount:b.amount-a.amount);
  }
  function questionText(q) {
    const intro=q.kind==='suppliers'?'Cine furnizează ':q.kind==='categories'?'Ce cumpără ':q.kind==='years'?'Cum evoluează achizițiile ':'Cât valorează achizițiile ';
    const a=q.kind==='categories'?({spital:'spitalele',oras_municipiu:'primăriile de oraș',consiliu_judetean:'consiliile județene',comuna:'primăriile de comună',scoala:'școlile',all:'instituțiile publice'})[q.authorityKind]:authorityNames[q.authorityKind];
    return intro+a+' din '+countyLabel(q.county)+', în '+period(q)+'?';
  }
  function scope(q) {
    return [sourceNames[q.dataset],authorityNames[q.authorityKind],countyLabel(q.county),period(q),q.category!=='all'?q.category:null,q.supplierId?supplierName(q.supplierId):null,q.maxEmployees!==null?'Firme cu cel mult '+q.maxEmployees+' angajați · ultimul bilanț disponibil':null].filter(Boolean).join(' · ');
  }
  function url(q) {return '#question?'+new URLSearchParams({qspec:JSON.stringify(q)}).toString();}
  function rerender(focusSelector) {
    window.UI.rerender();
    if(focusSelector) $(focusSelector)?.focus({preventScroll:true});
  }
  function phrase(field,text) {
    const changed=field==='period'?(qstate.draft.yearFrom!==qstate.applied.yearFrom||qstate.draft.yearTo!==qstate.applied.yearTo):qstate.draft[field]!==qstate.applied[field];
    return '<button class="q-phrase'+(changed?' q-changed':'')+'" data-action="q-pick" data-field="'+field+'" aria-haspopup="dialog" aria-controls="q-picker"><span>'+esc(text)+'</span>'+chevron+'</button>';
  }
  function chip(field,text,removable=false) {
    return '<span class="q-chip"><button data-action="q-pick" data-field="'+field+'" aria-haspopup="dialog">'+(field==='dataset'?i('database'):field==='maxEmployees'?i('people'):field==='category'?i('list'):i('building'))+'<span>'+esc(text)+'</span>'+chevron+'</button>'+(removable?'<button class="q-chip-remove" data-action="q-remove" data-field="'+field+'" aria-label="Elimină această condiție">'+i('x')+'</button>':'')+'</span>';
  }
  function guide() {
    if(!qstate.guide)return '';
    const steps=[['O întrebare, în cuvintele tale.','Apasă pe „spitalelor”, „Cluj” sau pe perioadă. Fiecare expresie deschide o alegere simplă.'],['Fă-o atât de precisă cât ai nevoie.','Adaugă un domeniu, o firmă sau tipul achiziției. Condițiile rămân la vedere.'],['Tu alegi când actualizezi răspunsul.','Apasă „Actualizează răspunsul”. Sursele și salvarea în anchetă vor păstra exact această întrebare.']];
    const s=steps[qstate.guide-1];
    return '<aside class="q-guide" aria-label="Ghid de utilizare"><span class="q-guide-number">0'+qstate.guide+'</span><div><b>'+s[0]+'</b><p>'+s[1]+'</p></div><div class="q-guide-actions"><span>'+qstate.guide+' / 3</span><button class="text-button" data-action="q-guide-next">'+(qstate.guide===3?'Am înțeles':'Mai departe')+' '+i('arrow')+'</button><button class="icon-button" data-action="q-guide-close" aria-label="Închide ghidul">'+i('x')+'</button></div></aside>';
  }
  function editor() {
    const q=qstate.draft,n=differences();
    const intro=q.kind==='suppliers'?'Cine furnizează':q.kind==='categories'?'Ce cumpără':q.kind==='years'?'Cum evoluează achizițiile':'Cât valorează achizițiile';
    const a=q.kind==='categories'?({spital:'spitalele',oras_municipiu:'primăriile de oraș',consiliu_judetean:'consiliile județene',comuna:'primăriile de comună',scoala:'școlile',all:'instituțiile publice'})[q.authorityKind]:authorityNames[q.authorityKind];
    if(qstate.collapsed&&!n)return '<section class="q-editor q-compact" aria-label="Întrebarea aplicată"><div><p class="eyebrow">ÎNTREBAREA TA <span class="q-applied-dot"></span></p><h1>'+esc(questionText(q))+'</h1><p>'+esc(scope(q))+'</p></div><button class="button secondary" data-action="q-expand">Modifică întrebarea '+i('plus')+'</button></section>';
    const dates=[...new Set(rowsFor(q,true).map(r=>company(r.supplierId).filingYear||company(r.supplierId).employees_year).filter(Boolean))].sort();
    return '<section class="q-editor'+(n?' q-editor-pending':'')+'" aria-label="Construiește o întrebare"><div class="q-editor-top"><p class="eyebrow"><span class="q-accent-line"></span>ÎNTREBAREA TA</p><span class="q-editor-tip">Cuvintele evidențiate se pot schimba '+chevron+'</span></div><h1 class="q-sentence">'+intro+' '+phrase('authorityKind',a)+'<br class="q-desktop-break"> din <span class="q-phrase-unit">'+phrase('county',countyLabel(q.county))+',</span> în <span class="q-phrase-unit">'+phrase('period',period(q))+'<span class="q-question-mark">?</span></span></h1><div class="q-conditions">'+chip('dataset',sourceNames[q.dataset])+(q.category!=='all'?chip('category',q.category,true):'')+(q.supplierId?chip('supplierId',supplierName(q.supplierId),true):'')+(q.maxEmployees!==null?chip('maxEmployees','Cel mult '+q.maxEmployees+' angajați',true):'')+'<button class="q-add" data-action="q-pick" data-field="add" aria-haspopup="dialog">'+i('plus')+' Adaugă o condiție</button></div>'+(q.maxEmployees!==null?'<p class="q-condition-note">'+i('info')+' Ultimul bilanț disponibil'+(dates.length?' ('+dates.join(', ')+')':'')+'. Firmele fără date despre angajați sunt excluse.</p>':'')+'<div class="q-editor-bottom"><div class="q-output-controls">'+(q.kind==='suppliers'?'Arată '+phrase('topN','primele '+q.topN+' firme')+', după ':q.kind==='total'?'Calculează ':'Grupează după '+(q.kind==='years'?'an':'domeniu')+'. Măsoară ')+phrase('measure',q.measure==='value'?'valoarea înregistrată':'numărul de achiziții')+'.</div><div class="q-apply-area">'+(n?'<button class="q-discard" data-action="q-discard">Renunță la modificări</button>':'<span class="q-ready">'+check+' Întrebare aplicată</span>')+'<button class="button primary q-apply" data-action="q-apply">'+(n?'Actualizează răspunsul':'Vezi răspunsul')+' '+i('arrow')+'</button></div></div>'+(n?'<div class="q-pending-line" role="status"><span class="q-pending-dot"></span>'+n+' '+(n===1?'modificare neaplicată':'modificări neaplicate')+'<span>Răspunsul de mai jos folosește întrebarea anterioară.</span></div>':'')+'</section>';
  }
  function amountLabel(g,q) {return q.measure==='count'?g.count+' '+(g.count===1?'achiziție':'achiziții'):money(g.amount);}
  function groupButton(g,q,body,cls='') {return '<button class="'+cls+'" data-action="q-group" data-key="'+esc(g.key)+'" aria-label="Vezi cele '+g.rows.length+' surse: '+esc(g.name)+'">'+body+'</button>';}
  function visualization(q,rows) {
    const groups=groupsFor(q,rows),shown=q.kind==='suppliers'?groups.slice(0,q.topN):groups;
    const max=Math.max(1,...groups.map(g=>q.measure==='count'?g.count:g.amount));
    if(!rows.length)return '<div class="q-empty">'+i('search')+'<h3>Nicio înregistrare în această selecție.</h3><p>Încearcă o perioadă mai largă sau elimină o condiție. Prototipul conține 48 de înregistrări, din 4 instituții.</p><button class="button secondary" data-action="q-expand">Modifică întrebarea '+i('arrow')+'</button></div>';
    if(qstate.layout==='table')return '<table class="q-table"><caption class="sr-only">'+esc(kindNames[q.kind])+', '+esc(scope(q))+'</caption><thead><tr><th>'+(q.kind==='suppliers'?'Furnizor':q.kind==='years'?'An':q.kind==='categories'?'Domeniu':'Selecție')+'</th><th>Achiziții</th><th>Valoare înregistrată</th></tr></thead><tbody>'+shown.map((g,index)=>'<tr><td>'+groupButton(g,q,'<span class="q-rank">'+String(index+1).padStart(2,'0')+'</span><span>'+esc(g.name)+'</span>')+'</td><td>'+g.count+'</td><td>'+money(g.amount)+'</td></tr>').join('')+'</tbody></table>';
    return '<div class="q-bars" aria-label="'+esc(kindNames[q.kind])+'">'+shown.map((g,index)=>{
      const c=company(g.key),staff=q.kind==='suppliers'&&q.maxEmployees!==null?' · '+c.employees+' angajați ('+(c.filingYear||c.employees_year)+')':'';
      return groupButton(g,q,'<span class="q-bar-head"><span class="q-bar-name"><span class="q-rank">'+String(index+1).padStart(2,'0')+'</span><b>'+esc(g.name)+'</b></span><strong>'+amountLabel(g,q)+'</strong></span><span class="q-bar-track"><span style="width:'+Math.max(.4,(q.measure==='count'?g.count:g.amount)/max*100)+'%"></span></span><span class="q-bar-meta">'+g.count+' '+(g.count===1?'înregistrare':'înregistrări')+esc(staff)+' <span>Vezi sursele '+i('arrow-up-right')+'</span></span>','q-bar-row');
    }).join('')+'</div>';
  }
  function insight(q,rows) {
    const groups=groupsFor({...q,kind:'suppliers',measure:'value'},rows),top=groups[0],amount=sum(rows),share=amount?Math.round(top.amount/amount*100):0;
    if(!top)return '';
    return '<aside class="q-insight"><p class="eyebrow">UN PUNCT DE PORNIRE</p><div class="q-insight-glyph" aria-hidden="true"><svg viewBox="0 0 140 88"><path d="M8 68h28c22 0 14-47 38-47h53M36 68h91" fill="none" stroke="#b6c8a5" stroke-width="1.4"/><circle cx="10" cy="68" r="5" fill="#204c3c"/><circle cx="128" cy="21" r="8" fill="#c7522d"/><circle cx="128" cy="68" r="5" fill="#89a074"/><path d="m76 13 5 8-5 8" fill="none" stroke="#b6c8a5" stroke-width="1.4"/></svg></div><strong class="q-insight-stat">'+share+'<span>%</span></strong><h3>din valoarea selecției este asociată unei singure firme.</h3><p><b>'+esc(top.name)+'</b> apare în '+top.rows.length+' '+(top.rows.length===1?'înregistrare':'înregistrări')+'. Un punct de pornire pentru a înțelege ce s-a cumpărat.</p><button class="text-button" data-action="q-supplier-sources" data-id="'+esc(top.key)+'">Uită-te la surse '+i('arrow')+'</button><p class="q-insight-footnote">Procent din acest eșantion. Nu este cota de piață și nu indică, singur, o neregulă.</p></aside>';
  }
  function result() {
    const q=qstate.applied,rows=rowsFor(q),groups=groupsFor(q,rows),n=differences();
    const heading=q.kind==='suppliers'?'Firmele din spatele achizițiilor.':q.kind==='years'?'Aceeași întrebare, de la un an la altul.':q.kind==='categories'?'Ce s-a cumpărat, pe domenii.':'Cât valorează această selecție.';
    const suppliers=new Set(rows.map(r=>r.supplierId)).size;
    const label=q.kind==='suppliers'?'Primii '+Math.min(q.topN,groups.length)+' din '+groups.length+' furnizori':q.kind==='years'?groups.length+' ani în selecție':q.kind==='categories'?groups.length+' domenii':'Totalul selecției';
    return '<section class="q-answer" id="q-answer" aria-labelledby="q-answer-title" tabindex="-1"><div class="q-answer-heading"><div><p class="eyebrow">'+(n?'RĂSPUNSUL ANTERIOR':'RĂSPUNSUL TĂU')+' <span class="q-live-label">'+check+' Din date reale</span></p><h2 id="q-answer-title">'+heading+'</h2><p class="q-applied-scope">'+esc(scope(q))+'</p></div><button class="button secondary q-save" data-action="q-save">'+i('folder')+' '+(n?'Salvează răspunsul afișat':'Salvează în anchetă')+'</button></div><div class="q-answer-grid"><div class="q-answer-main"><div class="q-metrics"><div><span>Valoare înregistrată</span><strong title="'+money(sum(rows))+'">'+compact(sum(rows))+' <small>lei</small></strong></div><div><span>Achiziții în selecție</span><strong>'+rows.length+'</strong></div><div><span>Firme în selecție</span><strong>'+suppliers+'</strong></div></div><div class="q-chart-toolbar"><div class="segmented q-segmented" aria-label="Afișarea aceluiași rezultat"><button data-action="q-layout" data-layout="bars" class="'+(qstate.layout==='bars'?'active':'')+'" aria-pressed="'+(qstate.layout==='bars')+'"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h11M4 19h6"/></svg>Bare</button><button data-action="q-layout" data-layout="table" class="'+(qstate.layout==='table'?'active':'')+'" aria-pressed="'+(qstate.layout==='table')+'">'+i('list')+' Tabel</button></div><span>'+label+'</span><button class="text-button" data-action="q-sources">'+i('database')+' Sursele <b>'+rows.length+'</b></button></div>'+visualization(q,rows)+'<div class="q-chart-footer"><span>'+(q.kind==='years'?'Ordine cronologică':q.measure==='value'?'După valoarea înregistrată':'După numărul de achiziții')+' · Toate valorile în lei</span><div><button class="text-button" data-action="q-export">'+i('download')+' CSV</button><button class="text-button" data-action="q-share">'+i('link')+' Copiază întrebarea</button></div></div></div>'+insight(q,rows)+'</div><div class="q-sample-note">'+i('info')+'<p>Rezultat din selecția de înregistrări reale inclusă în prototip. <b>Nu reprezintă toate achizițiile '+esc(authorityNames[q.authorityKind])+' din '+esc(countyLabel(q.county))+'.</b> Date selectate din 2024–2026; anul 2026 este parțial. Sumele pot include acorduri-cadru și acte adiționale, nu plăți efectuate. <button data-action="coverage">Despre date</button></p></div><div class="q-continue"><div><p class="eyebrow">CONTINUĂ DE AICI</p><h3>Un răspuns bun deschide alte întrebări.</h3><p>Păstrezi aceeași selecție. O privești dintr-un alt unghi.</p></div><div>'+Object.entries(kindNames).filter(([key])=>key!==q.kind&&key!=='total').map(([key,name])=>'<button data-action="q-next" data-kind="'+key+'">'+i(key==='years'?'clock':key==='categories'?'list':'people')+'<span>'+name+'</span>'+i('arrow')+'</button>').join('')+'</div></div></section>';
  }
  function render(params={}) {
    sync(params);
    return '<div class="q-page"><div class="q-breadcrumb"><div><a href="#home">Descoperă</a><span>/</span><a href="#explore">Explorează</a><span>/</span><b>Construiește o întrebare</b></div><button class="text-button" data-action="q-guide">'+i('eye')+' Arată-mi cum</button></div><div class="q-page-intro"><div><h2>Curiozitatea ta. Întrebarea ta.</h2><p>Pornește simplu. Mergi cât de departe vrei.</p></div><span class="q-version">SCHIȚĂ INTERACTIVĂ · A</span></div>'+guide()+'<div class="q-kind-tabs" aria-label="Ce vrei să afli?">'+Object.entries(kindNames).filter(([k])=>k!=='total').map(([k,name])=>'<button data-action="q-kind" data-kind="'+k+'" class="'+(qstate.draft.kind===k?'active':'')+'" aria-pressed="'+(qstate.draft.kind===k)+'">'+i(k==='suppliers'?'people':k==='years'?'clock':'list')+name+'</button>').join('')+'</div>'+editor()+result()+'</div>';
  }

  const menus = {
    authorityKind:{title:'Ce fel de instituții?',hint:'Alegi cine cumpără. Poți apoi restrânge locul și perioada.',choices:[['spital','Spitale','Sănătate, de la medicamente la echipamente'],['oras_municipiu','Orașe și municipii','Primării și administrații locale'],['consiliu_judetean','Consilii județene','Achiziții la nivelul județului'],['comuna','Comune','Fără înregistrări în acest eșantion'],['scoala','Școli','Fără înregistrări în acest eșantion'],['all','Toate instituțiile','Orice tip de autoritate publică']]},
    county:{title:'Unde sunt instituțiile?',hint:'Județul sediului instituției, nu adresa firmei sau locul lucrării.',choices:[['Cluj','Cluj','3 instituții în eșantion'],['București','București','CNAIR în acest eșantion'],['all','Toată România','Toate cele 4 instituții incluse']]},
    dataset:{title:'Ce achiziții urmărești?',hint:'Fiecare înregistrare păstrează legătura către sursa SICAP.',choices:[['contracts','Contracte','Contracte din proceduri, inclusiv acorduri-cadru'],['da','Achiziții directe','Înregistrările achizițiilor directe'],['all','Toate achizițiile','Contracte și achiziții directe, împreună']]},
    topN:{title:'Câte firme să arătăm?',hint:'Limita schimbă clasamentul afișat. Totalurile și sursele includ întreaga selecție.',choices:[[5,'Primele 5 firme','O primă privire'],[10,'Primele 10 firme','Mai mult context'],[25,'Primele 25 de firme','Un clasament mai larg']]},
    measure:{title:'După ce privim răspunsul?',hint:'Aceleași achiziții, măsurate în două feluri.',choices:[['value','Valoarea înregistrată','Suma valorilor din înregistrări, în lei'],['count','Numărul de achiziții','Câte înregistrări apar în selecție']]},
  };
  function ensurePicker() {
    if(picker)return;
    picker=document.createElement('dialog');picker.id='q-picker';picker.setAttribute('aria-labelledby','q-picker-title');document.body.appendChild(picker);
    picker.addEventListener('close',()=>{document.body.style.overflow='';pickerAnchor?.classList.remove('q-picker-active');pickerAnchor?.setAttribute('aria-expanded','false');if(pickerAnchor?.isConnected)pickerAnchor.focus({preventScroll:true});});
    picker.addEventListener('click',e=>{if(e.target===picker){const r=picker.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)picker.close();}});
    window.addEventListener('resize',()=>{if(picker.open)positionPicker();});
    window.addEventListener('hashchange',()=>{if(picker.open)picker.close();});
  }
  function positionPicker() {
    if(matchMedia('(max-width:600px)').matches){picker.style.left='';picker.style.top='';return;}
    const r=pickerAnchor?.getBoundingClientRect()||{left:innerWidth/2-200,bottom:150,top:150};
    const width=picker.getBoundingClientRect().width,height=picker.getBoundingClientRect().height;
    picker.style.left=Math.max(20,Math.min(innerWidth-width-20,r.left))+'px';
    picker.style.top=Math.max(20,Math.min(innerHeight-height-20,r.bottom+12))+'px';
  }
  function openPicker(field,anchor) {
    ensurePicker();
    if(!picker.open)pickerAnchor=anchor;
    pickerField=field;pickerChoice=qstate.draft[field];
    let config=menus[field];
    if(field==='category')config={title:'Ce s-a cumpărat?',hint:'Un domeniu de achiziții, pe baza codului CPV.',choices:[['all','Toate domeniile','Elimină restricția de domeniu'],...[...new Set(D.records.map(r=>r.category))].sort((a,b)=>a.localeCompare(b,'ro')).map(c=>[c,c,''])]};
    if(field==='supplierId')config={title:'Ce firmă te interesează?',hint:'O firmă identificată exact în înregistrări.',choices:[[null,'Orice firmă','Elimină restricția de furnizor'],...[...new Map(D.records.map(r=>[r.supplierId,r])).values()].sort((a,b)=>a.supplierName.localeCompare(b.supplierName)).map(r=>[r.supplierId,r.supplierName,company(r.supplierId).cui?'CUI '+company(r.supplierId).cui:'ID furnizor '+r.supplierId])]};
    const title=field==='add'?'Ce vrei să afli mai precis?':field==='period'?'În ce perioadă?':field==='maxEmployees'?'Cât de mari sunt firmele?':config.title;
    const hint=field==='add'?'Adaugă o condiție. Restul întrebării rămâne la fel.':field==='period'?'Anii atribuirii achizițiilor, inclusiv capetele intervalului.':field==='maxEmployees'?'Numărul mediu de angajați din ultimul bilanț disponibil.':config.hint;
    let body='';
    if(field==='add') {
      const sections=[['Achiziții',[['dataset','Tipul achiziției','Contracte sau achiziții directe','database'],['category','Ce s-a cumpărat','Medicamente, drumuri, servicii…','list']]],['Firme',[['supplierId','O anumită firmă','Alege exact furnizorul','building'],...(Object.keys(window.QUESTION_COMPANIES||{}).length?[['maxEmployees','Numărul de angajați','Urmărește firmele mici','people']]:[])]],['Unde și când',[['county','Județul instituției','Locul din care se cumpără','pin'],['period','Perioada','Un an sau un interval','clock']]]];
      body='<label class="q-picker-search">'+i('search')+'<input type="search" id="q-choice-search" placeholder="Caută o condiție…" aria-label="Caută o condiție" autofocus></label><div class="q-picker-scroll">'+sections.map(([name,items])=>'<section class="q-menu-group"><h3>'+name+'</h3>'+items.map(([key,label,sub,icon])=>'<button class="q-menu-item" data-action="q-sub-pick" data-field="'+key+'" data-search-text="'+esc(fold(label+' '+sub))+'">'+i(icon)+'<span><b>'+label+'</b><small>'+sub+'</small></span>'+i('plus')+'</button>').join('')+'</section>').join('')+'<p class="q-search-empty" hidden>Nicio condiție găsită. Încearcă „firmă” sau „perioadă”.</p></div>';
    } else if(field==='period') {
      body='<form id="q-period-form"><div class="q-period-presets">'+[[2026,2026,'2026'],[2025,2025,'2025'],[2024,2026,'2024–2026']].map(([a,b,label])=>'<button type="button" data-action="q-period-preset" data-from="'+a+'" data-to="'+b+'">'+label+'</button>').join('')+'</div><div class="q-period-fields"><label class="field" for="q-year-from">Din anul<input id="q-year-from" name="yearFrom" type="number" min="2018" max="2026" step="1" value="'+qstate.draft.yearFrom+'" required></label><span>→</span><label class="field" for="q-year-to">Până în anul<input id="q-year-to" name="yearTo" type="number" min="2018" max="2026" step="1" value="'+qstate.draft.yearTo+'" required></label></div><p class="q-picker-note">Eșantionul include 2024–2026. Anul 2026 este parțial; ultima înregistrare selectată este din iulie.</p><p id="q-form-error" role="alert"></p>'+pickerFooter('Păstrează perioada',true)+'</form>';
    } else if(field==='maxEmployees') {
      body='<form id="q-employees-form"><div class="q-employee-example">Firme cu cel mult <label for="q-employee-max" class="sr-only">Numărul maxim de angajați</label><input id="q-employee-max" name="max" type="number" min="0" max="1000000" step="1" value="'+(qstate.draft.maxEmployees??10)+'" required autofocus> angajați</div><div class="q-period-presets">'+[0,5,10,50].map(n=>'<button type="button" data-action="q-employee-preset" data-value="'+n+'">'+(n===0?'0 angajați':'≤ '+n)+'</button>').join('')+'</div><p class="q-picker-note">Date reale din bilanțurile Ministerului Finanțelor, importate în proiect. Se folosește ultimul an disponibil pentru fiecare firmă, nu neapărat anul contractului. Firmele fără date sunt excluse.</p>'+pickerFooter('Adaugă la întrebare',true)+'</form>';
    } else {
      body=(config.choices.length>4?'<label class="q-picker-search">'+i('search')+'<input type="search" id="q-choice-search" placeholder="Caută…" aria-label="Caută în opțiuni" autofocus></label>':'')+'<div class="q-picker-scroll q-choices" role="radiogroup" aria-label="'+title+'">'+config.choices.map(([value,name,sub])=>'<button class="q-choice" role="radio" aria-checked="'+(fold(value)===fold(pickerChoice))+'" data-action="q-choice" data-value="'+esc(JSON.stringify(value))+'" data-search-text="'+esc(fold(name+' '+sub))+'"><span><b>'+esc(name)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</span><span class="q-choice-circle">'+check+'</span></button>').join('')+'<p class="q-search-empty" hidden>Niciun rezultat în eșantion.</p></div>'+pickerFooter('Păstrează alegerea');
    }
    picker.innerHTML='<div class="q-picker-head"><div>'+(field!=='add'&&picker.open?'<button class="q-picker-back text-button" data-action="q-sub-pick" data-field="add">← Condiții</button>':'')+'<h2 id="q-picker-title">'+title+'</h2></div><button class="icon-button" data-action="q-picker-close" aria-label="Închide fără a schimba condiția">'+i('x')+'</button></div><p class="q-picker-intro">'+hint+'</p>'+body;
    picker.querySelectorAll('.q-choice').forEach(b=>b.tabIndex=b.getAttribute('aria-checked')==='true'?0:-1);
    if(!picker.open){picker.showModal();document.body.style.overflow='hidden';}
    pickerAnchor?.classList.add('q-picker-active');pickerAnchor?.setAttribute('aria-expanded','true');
    positionPicker();
    requestAnimationFrame(()=> (picker.querySelector('[autofocus]')||picker.querySelector('[aria-checked="true"]')||picker.querySelector('input')||picker.querySelector('button')).focus());
  }
  function pickerFooter(text,submit=false) {return '<div class="q-picker-footer"><button type="button" class="text-button" data-action="q-picker-close">Renunță</button><button '+(submit?'type="submit"':'data-action="q-picker-commit"')+' class="button primary">'+text+' '+check+'</button></div>';}
  function commit(values) {
    const focus=pickerAnchor?.dataset.field;
    Object.assign(qstate.draft,values);picker.close();rerender(focus?'[data-action="q-pick"][data-field="'+focus+'"]':'.q-apply');
  }
  function apply() {
    qstate.applied=clone(qstate.draft);qstate.collapsed=true;
    const next=JSON.stringify(qstate.applied);qstate.loadedKey=next;
    history.pushState(null,'',url(qstate.applied));rerender();
    $('#q-answer').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
    $('#q-answer').focus({preventScroll:true});window.UI.toast('Răspuns actualizat. Întrebarea și sursele sunt aliniate.');
  }
  function sourceModal(rows,title='Toate sursele selecției') {
    window.UI.modal(title,'<p class="q-source-intro">'+rows.length+' '+(rows.length===1?'înregistrare':'înregistrări')+' · <b>'+money(sum(rows))+'</b><br>'+esc(scope(qstate.applied))+'</p><p class="q-source-hint">Înregistrările care au produs răspunsul afișat. Apasă pe una pentru detalii și referința SICAP.</p><div class="q-source-list">'+rows.sort((a,b)=>b.amount-a.amount).map(r=>'<button data-action="q-record" data-id="'+esc(r.id)+'"><span class="q-source-code">'+esc(r.code)+' · '+esc(r.date)+'</span><span class="q-source-title">'+esc(r.titleKind==='cpv'?r.cpvName:r.title+' · '+r.cpvName)+'</span><span class="q-source-supplier">'+esc(r.supplierName)+'</span><strong>'+money(r.amount)+' '+i('arrow-up-right')+'</strong></button>').join('')+'</div>'+(rows.length?'':'<p class="modal-copy">Nicio sursă în această selecție.</p>'));
  }
  function snapshot() {
    const q=clone(qstate.applied),rows=rowsFor(q);
    return {id:'question:'+JSON.stringify(q),type:'query',title:questionText(q),subtitle:scope(q),amount:sum(rows),scope:'Eșantion de '+rows.length+' înregistrări reale, extras la 12 septembrie 2026. Valori înregistrate, nu plăți. '+(q.maxEmployees!==null?'Angajați: ultimul bilanț disponibil; firmele fără date sunt excluse.':''),querySpec:q,queryUrl:url(q),resultSnapshot:{measure:q.measure,groups:groupsFor(q,rows).map(g=>({key:g.key,name:g.name,amount:g.amount,count:g.count})),displayLimit:q.kind==='suppliers'?q.topN:null},companySnapshot:Object.fromEntries([...new Set(rows.map(r=>r.supplierId))].map(id=>[id,company(id)])),records:clone(rows)};
  }
  function exportCSV() {
    const q=qstate.applied,rows=rowsFor(q),cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const lines=[['id','data','institutie','furnizor','obiect','tip','valoare_lei','sursa','intrebare','conditii','angajati_ultimul_bilant','an_bilant','acoperire'],...rows.map(r=>[r.id,r.date,r.authorityName,r.supplierName,r.title,r.source,r.amount,r.sourceUrl,questionText(q),scope(q),company(r.supplierId).employees,company(r.supplierId).filingYear,'Eșantion prototip; valori înregistrate, nu plăți; extras 2026-09-12'])];
    const blob=new Blob(['\ufeff'+lines.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='cinecastiga-intrebare-surse.csv';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);window.UI.toast(rows.length+' surse exportate pentru întrebarea aplicată.');
  }
  async function share() {
    const link=location.href.split('#')[0]+url(qstate.applied);
    try{await navigator.clipboard.writeText(link);window.UI.toast('Întrebarea aplicată a fost copiată. Pentru alt dispozitiv, trimite și fișierul HTML.');}
    catch(_){window.UI.modal('Aceeași întrebare, la un click distanță.','<p class="modal-copy">Copiază linkul. Pe alt dispozitiv ai nevoie și de acest fișier HTML. Linkul păstrează întrebarea aplicată, fără modificările încă neaplicate.</p><label class="field">Link<input id="q-share-link" readonly value="'+esc(link)+'"></label>',()=>$('#q-share-link').select());}
  }
  function handleAction(action,el) {
    switch(action){
      case 'q-pick':openPicker(el.dataset.field,el);break;
      case 'q-sub-pick':openPicker(el.dataset.field,pickerAnchor);break;
      case 'q-picker-close':picker.close();break;
      case 'q-choice':pickerChoice=JSON.parse(el.dataset.value);picker.querySelectorAll('.q-choice').forEach(b=>{b.setAttribute('aria-checked',b===el?'true':'false');b.tabIndex=b===el?0:-1;});break;
      case 'q-picker-commit':commit({[pickerField]:pickerChoice});break;
      case 'q-period-preset':$('#q-year-from').value=el.dataset.from;$('#q-year-to').value=el.dataset.to;break;
      case 'q-employee-preset':$('#q-employee-max').value=el.dataset.value;break;
      case 'q-remove':{const key=el.dataset.field;qstate.draft[key]=key==='category'?'all':null;rerender('[data-field="add"]');break;}
      case 'q-discard':qstate.draft=clone(qstate.applied);rerender('.q-apply');break;
      case 'q-apply':apply();break;
      case 'q-expand':qstate.collapsed=false;rerender('[data-field="authorityKind"]');$('.q-editor').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center'});break;
      case 'q-layout':qstate.layout=el.dataset.layout;rerender('[data-action="q-layout"][data-layout="'+qstate.layout+'"]');break;
      case 'q-sources':sourceModal(rowsFor(qstate.applied));break;
      case 'q-group':{const g=groupsFor(qstate.applied).find(g=>g.key===el.dataset.key);if(g)sourceModal(g.rows,'Sursele: '+g.name);break;}
      case 'q-supplier-sources':sourceModal(rowsFor(qstate.applied).filter(r=>r.supplierId===el.dataset.id),'Sursele: '+supplierName(el.dataset.id));break;
      case 'q-record':window.UI.openRecord(el.dataset.id);break;
      case 'q-kind':qstate.draft.kind=el.dataset.kind;qstate.collapsed=false;rerender('[data-action="q-kind"][data-kind="'+el.dataset.kind+'"]');break;
      case 'q-next':qstate.draft={...qstate.draft,kind:el.dataset.kind};qstate.collapsed=false;rerender('.q-apply');$('.q-editor').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center'});break;
      case 'q-save':window.Investigations.openSave(snapshot());break;
      case 'q-export':exportCSV();break;
      case 'q-share':share();break;
      case 'q-guide':qstate.guide=1;qstate.collapsed=false;rerender('[data-action="q-guide-next"]');break;
      case 'q-guide-next':qstate.guide=qstate.guide===3?0:qstate.guide+1;rerender(qstate.guide?'[data-action="q-guide-next"]':'[data-action="q-guide"]');break;
      case 'q-guide-close':qstate.guide=0;rerender('[data-action="q-guide"]');break;
    }
  }
  document.addEventListener('input',e=>{
    if(e.target.id!=='q-choice-search')return;
    const term=fold(e.target.value);let matches=0;
    picker.querySelectorAll('[data-search-text]').forEach(el=>{el.hidden=!el.dataset.searchText.includes(term);if(!el.hidden)matches++;});
    picker.querySelectorAll('.q-menu-group').forEach(group=>group.hidden=![...group.querySelectorAll('[data-search-text]')].some(e=>!e.hidden));
    $('.q-search-empty',picker).hidden=matches>0;
    const visible=[...picker.querySelectorAll('.q-choice:not([hidden])')],tabStop=visible.find(b=>b.getAttribute('aria-checked')==='true')||visible[0];
    picker.querySelectorAll('.q-choice').forEach(b=>b.tabIndex=b===tabStop?0:-1);
  });
  document.addEventListener('submit',e=>{
    if(e.target.id==='q-period-form'){
      e.preventDefault();const data=new FormData(e.target),a=Number(data.get('yearFrom')),b=Number(data.get('yearTo'));
      if(a>b){$('#q-form-error').textContent='Anul de început trebuie să fie înaintea anului de sfârșit.';$('#q-year-from').focus();return;}
      commit({yearFrom:a,yearTo:b});
    }
    if(e.target.id==='q-employees-form'){e.preventDefault();commit({maxEmployees:Number(new FormData(e.target).get('max'))});}
  });
  document.addEventListener('keydown',e=>{
    if(!picker?.open)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();picker.close();return;}
    if(e.key==='/'&&!e.target.matches('input,textarea,select')){e.preventDefault();e.stopImmediatePropagation();return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)&&e.target.matches('.q-choice')){
      e.preventDefault();const choices=[...picker.querySelectorAll('.q-choice:not([hidden])')],idx=choices.indexOf(e.target);
      const next=e.key==='Home'?0:e.key==='End'?choices.length-1:(idx+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;
      choices[next].focus();handleAction('q-choice',choices[next]);
    }
  });
  window.Question={render,handleAction,leave:()=>{qstate.loadedKey=null;}};
})();
