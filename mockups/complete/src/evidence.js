/* Complete question prototype: every answer retains its exact source population. */
(() => {
  'use strict';
  const PAGE_SIZE=25;
  const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('ro');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>new Intl.NumberFormat('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0)+' lei';
  const number=value=>new Intl.NumberFormat('ro-RO').format(Number(value)||0);
  const cents=rows=>rows.reduce((total,row)=>total+Math.round((Number(row.amount)||0)*100),0);
  const date=value=>{const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return match?match[3]+'.'+match[2]+'.'+match[1]:'Dată indisponibilă';};
  const svg=path=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+path+'</svg>';
  const icons={close:svg('<path d="m6 6 12 12M18 6 6 18"/>'),search:svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>'),source:svg('<path d="M14 4h6v6M20 4 10 14M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>'),download:svg('<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>'),check:svg('<path d="m5 12 4 4L19 6"/>'),arrow:svg('<path d="M4 12h16m-6-6 6 6-6 6"/>'),back:svg('<path d="M20 12H4m6-6-6 6 6 6"/>'),chevron:svg('<path d="m8 4 8 8-8 8"/>'),database:svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>')};
  const flagNames={da_split:'Grup de achiziții peste prag',da_concentration:'Concentrare pe un furnizor',da_year_end:'Pondere ridicată în decembrie',da_rapid:'Finalizări rapide',da_round:'Valori apropiate de prag'};
  let dialog,opener,savedOverflow='',state=null;
  function profilesFor(result,group) {
    const candidates=group?.extra?.profile?[group.extra.profile]:group?.profile?[group.profile]:result.extra?.profiles||[];
    if(candidates.length)return candidates;
    if(!['compare','distribution','scatter','entity_card'].includes(result.block))return [];
    const ids=new Set((group?.rows||result.rows||[]).map(row=>String(row.authorityId)));
    return (window.COMPLETE_PROFILES?.entities||[]).filter(profile=>ids.has(String(profile.id)));
  }
  function ensure() {
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='q-evidence-drawer';dialog.setAttribute('aria-labelledby','q-ev-title');document.body.appendChild(dialog);
    dialog.addEventListener('close',restoreFocus);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
    dialog.addEventListener('input',event=>{if(event.target.id==='q-ev-search'){state.search=event.target.value;state.page=1;refreshRows();}});
    dialog.addEventListener('change',event=>{if(event.target.id==='q-ev-sort'){state.sort=event.target.value;state.page=1;refreshRows();}if(event.target.id==='q-ev-status'){state.status=event.target.value;state.page=1;refreshRows();}});
    window.addEventListener('hashchange',close);
  }
  function restoreFocus(){if(dialog?.open||document.querySelector('dialog[open]'))return;document.body.style.overflow=savedOverflow;if(opener?.isConnected)opener.focus({preventScroll:true});}
  function close(){if(dialog?.open){dialog.close();restoreFocus();}}
  function open(result,groupKey) {
    ensure();
    const group=groupKey!=null&&groupKey!==''?(result.groups||[]).find(item=>String(item.key)===String(groupKey)):null;
    if(groupKey!=null&&groupKey!==''&&!group){window.UI?.toast('Această selecție nu mai aparține răspunsului afișat.');return;}
    if(!dialog.open){
      opener=document.activeElement;
      const otherDialogs=[...document.querySelectorAll('dialog[open]')];
      if(otherDialogs.length)window.UI?.closeModal?.();
      otherDialogs.forEach(item=>{if(item!==dialog&&item.open)item.close();});
      savedOverflow=otherDialogs.length?'':document.body.style.overflow;
    }
    const rows=group?group.rows:result.rows;
    state={result,group,rows:rows||[],profiles:profilesFor(result,group),search:'',sort:'date-desc',status:'all',page:1,detail:null,example:null};
    if(group?.extra?.splitExample){const profile=group.extra.profile;state.example=group.extra.splitExample;state.previous={rows:profile.records,profiles:[profile],group:(result.groups||[]).find(item=>item.key==='profile:'+profile.id)||null};}
    prepare();render();
    if(!dialog.open)dialog.showModal();
    document.body.style.overflow='hidden';
    dialog.querySelector('[data-action="q-ev-close"]').focus({preventScroll:true});
  }
  function prepare() {
    state.index=state.rows.map(row=>({row,search:fold([row.id,row.code,row.title,row.authorityName,row.supplierName,row.authorityId,row.supplierId,row.cpvCode,row.cpvName,row.state,row.date].join(' '))}));
    state.sumCents=cents(state.rows);
    state.dateCoverage=state.rows.reduce((range,row)=>{if(row.date){const d=row.date.slice(0,10);if(!range[0]||d<range[0])range[0]=d;if(!range[1]||d>range[1])range[1]=d;}return range;},['','']);
    state.statuses=[...new Set(state.rows.map(row=>row.state||''))].sort((a,b)=>a.localeCompare(b,'ro'));
  }
  function selectedLabel() {return state.example?'Grupul care declanșează semnalul':state.group?.label||'Toate înregistrările răspunsului';}
  function profileFormula(profile) {
    const example=profile.splitExample,active=new Set(profile.flags||[]);
    return '<article class="q-ev-profile-formula"><div class="q-ev-profile-name"><h4>'+esc(profile.name)+'</h4><span>Indice '+new Intl.NumberFormat('ro-RO',{minimumFractionDigits:2}).format(profile.cri)+'</span></div><p>'+esc(profile.calculation)+'</p><div class="q-ev-flags">'+(profile.applicableFlags||[]).map(flag=>'<span class="'+(active.has(flag)?'is-active':'')+'">'+(active.has(flag)?icons.check:'<span aria-hidden="true">−</span>')+' '+esc(flagNames[flag]||flag)+' <b>'+(active.has(flag)?'activ':'inactiv')+'</b></span>').join('')+'</div>'+(example?'<div class="q-ev-example"><div><b>De unde vine semnalul activ?</b><p>'+number(example.count)+' înregistrări · '+esc(example.supplierName)+' · '+example.year+'</p><span>'+money(example.total)+' &gt; '+money(example.ceiling)+' — pragul grupului</span></div><button class="text-button" data-action="q-ev-example" data-profile="'+esc(profile.id)+'">Verifică cele '+number(example.count)+' înregistrări '+icons.arrow+'</button></div>':'')+'<p class="q-ev-methodology">Metodologie '+esc(profile.methodologyVersion||'rf-2026.4')+'. Acest indice descrie semnale statistice; nu dovedește o neregulă.</p></article>';
  }
  function calculation() {
    const {result,group,rows,profiles,example}=state,parts=[];
    if(example){parts.push('<p><b>'+esc(example.supplierName)+' · '+example.year+'</b></p><p>'+esc(example.calculation)+'</p><div class="q-ev-equation">'+rows.map(row=>money(row.amount)).join(' + ')+' = <strong>'+money(state.sumCents/100)+'</strong></div><p>Pragul aplicabil grupului: <b>'+money(example.ceiling)+'</b>.</p><p>'+esc(example.caveat)+'</p>');}
    else if(profiles.length){parts.push('<p>Valoarea profilului însumează toate înregistrările de achiziții directe eligibile din istoricul importat. Regula existentă include valori ≤ 2.000.000 lei, indiferent de starea ofertei. Nu aplică perioada întrebărilor din eșantion.</p>');parts.push(profiles.map(profileFormula).join(''));}
    else if(result.block==='trend'){
      const from=String(result.query.yearFrom),to=String(result.query.yearTo),start=cents(rows.filter(row=>String(row.date).startsWith(from)))/100,end=cents(rows.filter(row=>String(row.date).startsWith(to)))/100;
      parts.push('<p>Lista cuprinde numai înregistrările din cei doi ani comparați. Suma listei este suma celor două capete; schimbarea se calculează prin scădere.</p><div class="q-ev-equation"><span>'+to+': '+money(end)+'</span><span>− '+from+': '+money(start)+'</span><strong>= '+money(end-start)+'</strong></div>'+(start?'<p>Schimbare procentuală: ('+money(end)+' − '+money(start)+') / '+money(start)+' × 100 = '+new Intl.NumberFormat('ro-RO',{maximumFractionDigits:2}).format((end-start)/start*100)+'%.</p>':'<p>Anul de început are valoarea zero în selecție; schimbarea procentuală nu se calculează.</p>'));
    }else{
      parts.push('<p>Adunăm valoarea înregistrată pentru fiecare rând de mai jos. Fiecare rând contribuie o singură dată la această selecție.</p>');
      const direct=rows.filter(row=>row.source==='da'),contracts=rows.filter(row=>row.source!=='da');
      parts.push('<div class="q-ev-equation">'+(contracts.length?'<span>'+number(contracts.length)+' '+(contracts.length===1?'contract':'contracte')+': '+money(cents(contracts)/100)+'</span>':'')+(direct.length?'<span>'+(contracts.length?'+ ':'')+number(direct.length)+' '+(direct.length===1?'achiziție directă':'achiziții directe')+': '+money(cents(direct)/100)+'</span>':'')+'<strong>= '+money(state.sumCents/100)+'</strong></div>');
      if(group&&Number(result.total)>0){const denominator=Number(result.total),share=(state.sumCents/100)/denominator*100;parts.push('<p>Ponderea valorii acestei selecții: '+money(state.sumCents/100)+' / '+money(denominator)+' × 100 = <b>'+new Intl.NumberFormat('ro-RO',{maximumFractionDigits:2}).format(share)+'%</b> din valoarea întregului răspuns.</p>');}
      if(group&&result.query.measure==='count'&&result.rows.length){parts.push('<p>Pondere după număr: '+number(rows.length)+' / '+number(result.rows.length)+' × 100 = <b>'+new Intl.NumberFormat('ro-RO',{maximumFractionDigits:2}).format(rows.length/result.rows.length*100)+'%</b> din înregistrările răspunsului.</p>');}
      parts.push('<p>Sumele sunt valori declarate în înregistrări, nu plăți efectuate. Contractele pot include acorduri-cadru și acte adiționale.</p>');
    }
    return '<details class="q-ev-calculation"'+(example?' open':'')+'><summary><span>'+icons.database+' Cum ajungem de la date la rezultat</span>'+icons.chevron+'</summary><div>'+parts.join('')+'</div></details>';
  }
  function summary() {
    const {result,profiles,rows,group,example}=state,dates=state.dateCoverage,accepted=rows.filter(row=>fold(row.state)==='oferta acceptata');
    const context=example?example.supplierName+' · '+example.year:group?.label;
    return '<div class="q-ev-intro">'+(context?'<p class="q-ev-selection"><span>SELECȚIA TA</span><b>'+esc(context)+'</b></p>':'')+'<p class="q-ev-question">'+esc(result.title)+'</p><p class="q-ev-scope">'+esc(result.scopeLabel)+(dates[0]?' · '+date(dates[0])+'–'+date(dates[1]):'')+'</p><div class="q-ev-totals"><div><small>Înregistrări în această selecție</small><strong>'+number(rows.length)+'</strong></div><span class="q-ev-totals-arrow" aria-hidden="true">→</span><div><small>'+(profiles.length?'Valoare înregistrată în profil':'Suma exactă a înregistrărilor')+'</small><strong>'+money(state.sumCents/100)+'</strong></div><span class="q-ev-exact">'+icons.check+' Total verificabil</span></div>'+(profiles.length&&!example?'<div class="q-ev-profile-note"><b>Starea ofertei contează.</b> Totalul include oferte refuzate sau expirate. Din această selecție, <b>'+number(accepted.length)+' oferte acceptate</b> însumează <b>'+money(cents(accepted)/100)+'</b>. Poți izola fiecare stare în listă.</div>':'')+(result.scopeNote?'<p class="q-ev-scope-note">'+esc(result.scopeNote)+'</p>':'')+calculation()+'</div>';
  }
  function render() {
    const back=state.example?'<button class="text-button q-ev-back" data-action="q-ev-example-back">'+icons.back+' Înapoi la profil</button>':state.group?'<button class="text-button q-ev-back" data-action="q-ev-all">'+icons.back+' Toate înregistrările răspunsului</button>':'';
    dialog.innerHTML='<div class="q-ev-shell"><header class="q-ev-header"><div><p class="eyebrow">FIECARE CIFRĂ ARE O SURSĂ</p><h2 id="q-ev-title">Înregistrările din spatele răspunsului.</h2></div><button class="icon-button" data-action="q-ev-close" aria-label="Închide lista de înregistrări">'+icons.close+'</button></header><div class="q-ev-scroll">'+back+summary()+'<section class="q-ev-ledger" aria-label="Lista surselor"><div class="q-ev-ledger-heading"><h3>Datele. Rând cu rând.</h3><button class="text-button" data-action="q-ev-export" data-scope="all">'+icons.download+' Descarcă toate · '+number(state.rows.length)+'</button></div><div class="q-ev-controls"><label class="q-ev-search">'+icons.search+'<input id="q-ev-search" type="search" placeholder="Caută firmă, contract, cod CPV…" aria-label="Caută în înregistrările acestei selecții" value="'+esc(state.search)+'"></label>'+(state.statuses.some(Boolean)?'<label class="q-ev-select"><span>Stare</span><select id="q-ev-status" aria-label="Filtrează după starea ofertei"><option value="all">Toate stările</option>'+state.statuses.map(status=>'<option value="'+esc(status)+'"'+(state.status===status?' selected':'')+'>'+esc(status||'Stare indisponibilă')+'</option>').join('')+'</select></label>':'')+'<label class="q-ev-select"><span>Ordine</span><select id="q-ev-sort" aria-label="Ordonează înregistrările"><option value="date-desc">Cele mai recente</option><option value="date-asc">Cele mai vechi</option><option value="amount-desc">Valoare: mare → mică</option><option value="amount-asc">Valoare: mică → mare</option></select></label></div><div id="q-ev-records"></div></section><p class="q-ev-source-footnote">Legăturile SEAP duc direct la înregistrarea originală. Denumirile marcate „CPV” descriu obiectul achiziției și pot diferi de titlul anunțului. Date incluse în prototip la '+esc(window.COMPLETE_PROFILES?.meta?.snapshotDate||window.MOCK_DATA?.meta?.snapshotDate||'2026-09-13')+'.</p></div><footer class="q-ev-footer"><span>'+icons.database+' Surse deschise. Calcule verificabile.</span><button class="button secondary" data-action="q-ev-save">Salvează întrebarea în anchetă '+icons.arrow+'</button></footer></div>';
    dialog.querySelector('#q-ev-sort').value=state.sort;
    refreshRows();
  }
  function filteredRows() {
    const words=fold(state.search).trim().split(/\s+/).filter(Boolean);
    return state.index.filter(item=>words.every(word=>item.search.includes(word))&&(state.status==='all'||(item.row.state||'')===state.status)).map(item=>item.row).sort((a,b)=>state.sort.startsWith('amount')?(state.sort.endsWith('desc')?b.amount-a.amount:a.amount-b.amount):state.sort==='date-asc'?String(a.date||'').localeCompare(String(b.date||'')):String(b.date||'').localeCompare(String(a.date||'')));
  }
  function sourceLink(row) {const url=String(row.sourceUrl||'');return /^https?:\/\//.test(url)?'<a class="q-ev-source" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" aria-label="Deschide '+esc(row.code||row.id)+' în SEAP">SEAP '+icons.source+'</a>':'<span class="q-ev-no-source">Legătură indisponibilă</span>';}
  function detail(row) {
    const entries=[['Identificator',row.id],['Referință SEAP',row.code],['Tip',row.source==='da'?'Achiziție directă':'Contract din procedură'],['Cod CPV',row.cpvCode],['Denumire CPV',row.cpvName],['Instituție',row.authorityName],['ID instituție',row.authorityId],['Furnizor',row.supplierName],['ID furnizor',row.supplierId],['Stare',row.state||'Nespecificată în acest eșantion'],['Valoare înregistrată',money(row.amount)],['Publicare',row.publicationDate],['Finalizare',row.finalizationDate],['Procedură',row.procedure]];
    return '<div class="q-ev-record-detail"><p class="eyebrow">DATELE ÎNREGISTRĂRII</p><dl>'+entries.filter(([,value])=>value!==null&&value!==undefined&&value!=='').map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>'+sourceLink(row)+'</div>';
  }
  function rowMarkup(row,index) {
    const expanded=state.detail===row.id,accepted=fold(row.state)==='oferta acceptata';
    return '<tr class="q-ev-row"><td class="q-ev-date" data-label="Data">'+date(row.date)+'<small>'+esc(row.code||row.id)+'</small></td><td class="q-ev-description" data-label="Achiziție"><button data-action="q-ev-detail" data-index="'+index+'" aria-expanded="'+expanded+'" aria-controls="q-ev-detail-'+index+'">'+esc(row.title||row.cpvName||'Înregistrare SEAP')+'</button><small>'+(row.titleKind==='cpv'?'CPV · ':'')+esc(row.cpvCode||row.procedure||'')+'</small></td><td class="q-ev-parties" data-label="Cumpărător → furnizor"><span>'+esc(row.authorityName)+'</span><span><i aria-hidden="true">↳</i> '+esc(row.supplierName)+'</span></td><td class="q-ev-state" data-label="Stare">'+(row.state?'<span class="q-ev-status-badge '+(accepted?'accepted':'other')+'">'+esc(row.state)+'</span>':'<span class="q-ev-unknown">Nespecificată</span>')+'</td><td class="q-ev-amount" data-label="Valoare">'+money(row.amount)+'</td><td class="q-ev-source-cell">'+sourceLink(row)+'</td></tr>'+(expanded?'<tr class="q-ev-detail-row" id="q-ev-detail-'+index+'"><td colspan="6">'+detail(row)+'</td></tr>':'');
  }
  function refreshRows() {
    if(!state)return;
    const rows=filteredRows(),totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));state.page=Math.min(state.page,totalPages);state.filtered=rows;
    const start=(state.page-1)*PAGE_SIZE,visible=rows.slice(start,start+PAGE_SIZE),isFiltered=!!state.search.trim()||state.status!=='all',filteredSum=cents(rows)/100;
    dialog.querySelector('#q-ev-records').innerHTML='<div class="q-ev-filter-summary" role="status"><span><b>'+number(rows.length)+'</b> din '+number(state.rows.length)+' înregistrări'+(isFiltered?' · după filtrare':'')+' <span>·</span> Suma '+(isFiltered?'celor filtrate':'selecției')+': <b>'+money(filteredSum)+'</b></span>'+(isFiltered?'<button class="text-button" data-action="q-ev-reset">Resetează filtrul</button>':'')+'</div>'+(isFiltered?'<div class="q-ev-filter-explain"><span>Totalul întregii selecții de sus rămâne neschimbat.</span><button class="text-button" data-action="q-ev-export" data-scope="filtered">'+icons.download+' Descarcă filtrate · '+number(rows.length)+'</button></div>':'')+(visible.length?'<table class="q-ev-table"><caption class="sr-only">'+esc(selectedLabel())+'; pagina '+state.page+' din '+totalPages+'</caption><thead><tr><th scope="col">Data / referința</th><th scope="col">Obiectul achiziției</th><th scope="col">Instituție → firmă</th><th scope="col">Starea ofertei</th><th scope="col">Valoare înregistrată</th><th scope="col">Sursa</th></tr></thead><tbody>'+visible.map((row,index)=>rowMarkup(row,start+index)).join('')+'</tbody></table>':'<div class="q-ev-empty">'+icons.search+'<h4>Nicio înregistrare în această selecție.</h4><p>'+(isFiltered?'Încearcă altă căutare sau resetează filtrul.':'Acest rezultat nu are înregistrări în datele selectate.')+'</p></div>')+'<div class="q-ev-pagination"><span>'+(rows.length?number(start+1)+'–'+number(Math.min(start+PAGE_SIZE,rows.length))+' din '+number(rows.length):'0 înregistrări')+' <small>· '+PAGE_SIZE+' pe pagină</small></span><div><button class="icon-button" data-action="q-ev-page" data-page="'+(state.page-1)+'" aria-label="Pagina anterioară"'+(state.page<=1?' disabled':'')+'>'+icons.back+'</button><span>'+state.page+' / '+number(totalPages)+'</span><button class="icon-button" data-action="q-ev-page" data-page="'+(state.page+1)+'" aria-label="Pagina următoare"'+(state.page>=totalPages?' disabled':'')+'>'+icons.arrow+'</button></div></div>';
  }
  function csvCell(value) {let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
  function exportCSV(which) {
    const rows=which==='filtered'?filteredRows():state.rows,scope=state.result.scopeLabel+' · '+selectedLabel(),query=JSON.stringify(state.result.query),headers=['ID','Referință SEAP','Tip','Dată','Descriere','ID instituție','Instituție','ID furnizor','Furnizor','Cod CPV','Denumire CPV','Stare ofertă','Valoare lei','Sursă SEAP','Întrebare aplicată','Selecție exportată','Filtru de căutare','Filtru de stare','Data extragerii'];
    const lines=[headers.map(csvCell).join(';'),...rows.map(row=>[row.id,row.code,row.source==='da'?'Achiziție directă':'Contract',row.date,row.title,row.authorityId,row.authorityName,row.supplierId,row.supplierName,row.cpvCode,row.cpvName,row.state||'Nespecificată',Number(row.amount||0).toFixed(2),row.sourceUrl,query,scope,which==='filtered'?state.search:'',which==='filtered'?state.status:'all',window.COMPLETE_PROFILES?.meta?.snapshotDate||'2026-09-13'].map((value,index)=>index===12?'"'+value+'"':csvCell(value)).join(';'))];
    const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='cinecastiga-'+state.result.block+'-'+(which==='filtered'?'inregistrari-filtrate':'toata-selectia')+'.csv';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);window.UI?.toast('CSV pregătit: '+number(rows.length)+' înregistrări și legăturile lor SEAP.');
  }
  function handleAction(action,element) {
    if(!state)return;
    switch(action){
      case 'q-ev-close':close();break;
      case 'q-ev-all':{const result=state.result;open(result);break;}
      case 'q-ev-save':close();window.Complete?.save?.(state.result);break;
      case 'q-ev-detail':{const row=state.filtered[Number(element.dataset.index)];if(!row)return;state.detail=state.detail===row.id?null:row.id;const index=element.dataset.index;refreshRows();dialog.querySelector('[data-action="q-ev-detail"][data-index="'+index+'"]')?.focus({preventScroll:true});break;}
      case 'q-ev-page':state.page=Math.max(1,Number(element.dataset.page)||1);state.detail=null;refreshRows();dialog.querySelector('.q-ev-ledger').scrollIntoView({block:'start'});dialog.querySelector('#q-ev-search').focus({preventScroll:true});break;
      case 'q-ev-reset':state.search='';state.status='all';state.page=1;dialog.querySelector('#q-ev-search').value='';if(dialog.querySelector('#q-ev-status'))dialog.querySelector('#q-ev-status').value='all';refreshRows();dialog.querySelector('#q-ev-search').focus();break;
      case 'q-ev-export':exportCSV(element.dataset.scope);break;
      case 'q-ev-example':{const profile=(window.COMPLETE_PROFILES?.entities||[]).find(item=>String(item.id)===element.dataset.profile);if(!profile?.splitExample)return;state.previous={rows:state.rows,profiles:state.profiles,group:state.group};state.example=profile.splitExample;const ids=new Set(state.example.recordIds);state.rows=profile.records.filter(row=>ids.has(row.id));state.profiles=[profile];state.search='';state.status='all';state.page=1;state.detail=null;prepare();render();dialog.querySelector('.q-ev-scroll').scrollTop=0;dialog.querySelector('.q-ev-back').focus({preventScroll:true});break;}
      case 'q-ev-example-back':Object.assign(state,state.previous);state.previous=null;state.example=null;state.search='';state.status='all';state.page=1;state.detail=null;prepare();render();dialog.querySelector('.q-ev-scroll').scrollTop=0;dialog.querySelector('[data-action="q-ev-close"]').focus({preventScroll:true});break;
    }
  }
  window.Evidence={open,close,handleAction,getState:()=>state?{count:state.rows.length,total:state.sumCents/100,filteredCount:state.filtered?.length||0,filteredTotal:cents(state.filtered||[])/100,page:state.page,groupKey:state.group?.key||null,example:!!state.example,open:!!dialog?.open}:null};
})();
