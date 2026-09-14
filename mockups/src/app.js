(function () {
  'use strict';
  const D = window.MOCK_DATA;
  const countyLabels = {'arges':'Argeș','bacau':'Bacău','bistrita-nasaud':'Bistrița-Năsăud','botosani':'Botoșani','brasov':'Brașov','braila':'Brăila','bucuresti':'București','buzau':'Buzău','calarasi':'Călărași','caras-severin':'Caraș-Severin','constanta':'Constanța','dambovita':'Dâmbovița','galati':'Galați','iasi':'Iași','ialomita':'Ialomița','maramures':'Maramureș','mehedinti':'Mehedinți','mures':'Mureș','neamt':'Neamț','salaj':'Sălaj','timis':'Timiș','valcea':'Vâlcea'};
  const M = {...window.MOCK_MAP,shapes:window.MOCK_MAP.shapes.map(c=>({...c,label:countyLabels[c.key]||c.label}))};
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });
  const money = (n) => nf.format(n) + ' lei';
  const compact = (n) => n >= 1e9 ? nf.format(Math.round(n / 1e8) / 10) + ' mld.' : n >= 1e6 ? nf.format(Math.round(n / 1e5) / 10) + ' mil.' : nf.format(Math.round(n));
  const date = (s) => new Date(s + 'T12:00:00').toLocaleDateString('ro-RO', {day:'numeric',month:'short',year:'numeric'});
  const total = (rows) => rows.reduce((sum,r) => sum + r.amount, 0);
  const unique = (rows, key) => new Set(rows.map(r=>r[key])).size;
  const prettyNames = {'2146445':'Primăria Cluj-Napoca','2143172':'Consiliul Județean Cluj','2084803':'Spitalul Județean de Urgență Cluj','2146146':'Compania Națională de Drumuri (CNAIR)'};
  const pretty = (id, fallback) => prettyNames[id] || fallback;
  const countyName = (s) => M.shapes.find(c=>fold(c.label) === fold(s))?.label || s;
  const icons = {
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    'arrow-up-right':'<path d="M6 18 18 6M6 6h12v12"/>',
    x:'<path d="m6 6 12 12M6 18 18 6"/>',
    pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    building:'<path d="m3 9 9-6 9 6M3 10h18M5 10v9m5-9v9m4-9v9m5-9v9M3 21h18"/>',
    hospital:'<path d="M5 21V5h14v16M3 21h18M10 9h4m-2-2v4M8 15h1m6 0h1M10 21v-3h4v3"/>',
    road:'<path d="m7 3-4 18M17 3l4 18M12 4v3m0 4v3m0 4v3"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/>',
    compass:'<path d="m12 2 7 19-7-5-7 5 7-19Z"/><path d="M12 2v14"/>',
    folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v11H3Z"/><path d="M3 10h18"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    link:'<path d="m10 13 4-4m-7 5-2 2a4 4 0 0 0 6 6l4-4a4 4 0 0 0 0-6M17 10l2-2a4 4 0 0 0-6-6L9 6a4 4 0 0 0 0 6"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>',
    map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  };
  const icon = (name) => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+(icons[name] || icons.arrow)+'</svg>';
  let state = { view:'home', params:{} };
  let toastTimer;
  let lastFocus = null;
  let dialogRecord = null;
  let selectedSuggestion = 0;
  let activeSuggestions = [];
  const plainTitles = {
    'ct-405405':'Analiza semaforizării din Cluj-Napoca',
    'ct-366680':'Echipamente de joacă, inclusiv pentru copii cu dizabilități',
    'ct-366679':'Echipamente de joacă, inclusiv pentru copii cu dizabilități',
    'ct-455884':'Parc fotovoltaic în Valea Chintăului',
    'ct-632867':'40 de autobuze electrice și stații de încărcare · act adițional',
    'ct-544642':'Întreținerea spațiilor verzi și a locurilor de joacă',
    'ct-544643':'Întreținerea spațiilor verzi și a locurilor de joacă',
    'ct-560648':'Drumul expres Satu Mare–Oar',
    'ct-748100':'Modernizarea DN73 · lotul 1',
    'ct-717841':'Centura ocolitoare a orașului Buftea',
  };

  function route(view, params = {}) {
    const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v !== '' && v != null));
    return '#' + view + (q.size ? '?' + q.toString() : '');
  }
  function navigate(view, params = {}) {
    closeModal();
    const next = route(view, params);
    if(location.hash === next) { render(); return; }
    location.hash = next;
  }
  function readRoute() {
    const [v, p] = location.hash.slice(1).split('?');
    return {view:['home','explore','entity','investigations'].includes(v) ? v : 'home', params:Object.fromEntries(new URLSearchParams(p || ''))};
  }
  function toast(message) {
    const el = $('#toast');
    el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.classList.remove('show'), 4500);
  }
  function hydrateIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
  function modal(title, html, onOpen) {
    const el = $('#modal');
    if (!el.open) lastFocus = document.activeElement;
    $('#modal-content').innerHTML = '<h2 id="modal-title" class="modal-title">'+esc(title)+'</h2>'+html;
    hydrateIcons(el);
    if(!el.open) el.showModal();
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(()=>{
      const focus = el.querySelector('[autofocus],input,select,textarea');
      (focus || el.querySelector('[data-action="close-modal"]'))?.focus();
      if(onOpen) onOpen();
    });
  }
  function closeModal() {
    const el=$('#modal');
    if(el.open) el.close();
    document.body.style.overflow='';
  }
  $('#modal').addEventListener('close',()=>{
    document.body.style.overflow='';
    if(dialogRecord) {
      const closingRecord=dialogRecord;
      dialogRecord=null;
      const parsed=readRoute();
      if(parsed.params.record===closingRecord){delete parsed.params.record;history.replaceState(null,'',route(parsed.view,parsed.params));state=parsed;}
    }
    if(lastFocus?.isConnected && (document.activeElement===document.body||$('#modal').contains(document.activeElement))) lastFocus.focus();
  });
  $('#modal').addEventListener('click', e=>{if(e.target === e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
  window.UI = {escape:esc,icon,toast,modal,closeModal,navigate,rerender:()=>render(false)};

  function searchBox(id='hero-search', placeholder='O primărie, o firmă, un subiect…') {
    return '<div class="hero-search-wrap"><form class="search-form" data-search-form>'+icon('search')+'<label for="'+id+'" class="sr-only">Caută în datele prototipului</label><input id="'+id+'" type="search" placeholder="'+esc(placeholder)+'" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="'+id+'-suggestions" data-search><button class="search-submit" type="submit" aria-label="Caută">'+icon('arrow')+'</button></form><div id="'+id+'-suggestions" class="suggestions" role="listbox" aria-label="Sugestii de căutare" hidden></div></div>';
  }
  function mapCard(selected='Cluj') {
    const selectedCounty = D.counties.find(c=>fold(c.county)===fold(selected));
    const palette=['#cbd8be','#bccfaf','#a9c097','#96b080','#789963','#577b4b'];
    const shapes=M.shapes.map(c=>{
      const item=D.counties.find(x=>fold(x.county)===fold(c.key));
      const intensity=item ? Math.min(5,Math.max(0,Math.floor((Math.log10(item.totalRon)-9)*3))) : 0;
      return '<path class="county-shape '+(fold(c.key)===fold(selected)?'selected':'')+'" fill="'+palette[intensity]+'" style="fill:'+palette[intensity]+'" d="'+c.d+'" role="button" tabindex="0" data-action="county" data-county="'+esc(c.label)+'" aria-label="'+esc(c.label+', '+(item?money(item.totalRon):'fără date')+', vezi detaliile')+'"/>';
    }).join('');
    return '<section class="map-card" aria-label="Harta achizițiilor publice pe județe"><div class="map-card-header"><div><p class="eyebrow">România, mai de aproape</p><h2>Pe ce se duc banii<br>în județul tău?</h2></div><span class="map-compass">N'+icon('compass')+'</span></div><svg class="romania-map" viewBox="-20 -20 '+(M.width+40)+' '+(M.height+40)+'" role="group" aria-label="Alege un județ">'+shapes+'<text x="290" y="245" class="map-label">Cluj</text><text x="595" y="584" class="map-label-small">București</text></svg><button class="map-selection" data-action="county" data-county="'+esc(selected)+'"><span><b>'+esc(countyName(selected))+'</b><small>'+ (selectedCounty?compact(selectedCounty.totalRon)+' lei înregistrați':'Explorează datele')+'</small></span><span class="circle-arrow">'+icon('arrow')+'</span></button><div class="map-bottom"><span>Sediul instituțiilor · 2018–2026</span><span class="map-legend" aria-label="Valoare: de la mică la mare">'+palette.map(c=>'<i style="background:'+c+'"></i>').join('')+'</span></div></section>';
  }
  function art(kind) {
    if(kind==='road') return '<svg viewBox="0 0 300 105" aria-hidden="true"><ellipse cx="150" cy="93" rx="97" ry="5" fill="#e8ecdf"/><path d="M41 85h42c24 0 14-63 43-63h38c26 0 17 63 43 63h49" stroke="#d8ddca" stroke-width="28" fill="none"/><path d="M41 85h42c24 0 14-63 43-63h38c26 0 17 63 43 63h49" stroke="#a7b69d" stroke-width="1.5" stroke-dasharray="6 6" fill="none"/><path d="M83 24v42" stroke="#97ab83" stroke-width="2"/><path d="m75 23 8-16 8 16Z" fill="#9db58a"/><rect x="171" y="49" width="15" height="23" rx="4" fill="#c7522d" transform="rotate(-15 178 60)"/><rect x="173" y="53" width="11" height="5" rx="1" fill="#eed6b5" transform="rotate(-15 178 60)"/><path d="M231 36v24" stroke="#b1bca1" stroke-width="2"/><circle cx="231" cy="29" r="10" fill="#d4dfc3"/></svg>';
    if(kind==='hospital') return '<svg viewBox="0 0 300 105" aria-hidden="true"><ellipse cx="150" cy="94" rx="94" ry="5" fill="#e9e9dc"/><rect x="86" y="44" width="46" height="47" rx="2" fill="#e1d7c3"/><rect x="170" y="40" width="43" height="51" rx="2" fill="#e3ddcc"/><rect x="126" y="19" width="48" height="73" rx="3" fill="#eae4d5"/><path d="M145 29v16m-8-8h16" stroke="#bc7353" stroke-width="4"/><path d="M97 55h8m9 0h8M97 68h8m9 0h8M182 54h8m7 0h8M182 67h8m7 0h8M137 54h9m9 0h8M137 65h9m9 0h8" stroke="#b1aa92" stroke-width="4"/><rect x="141" y="77" width="17" height="15" fill="#adbaa2"/><path d="M71 91V65m155 26V67" stroke="#a6b48f" stroke-width="2"/><ellipse cx="71" cy="62" rx="8" ry="12" fill="#bdcaaa"/><ellipse cx="226" cy="65" rx="8" ry="12" fill="#c9d4b9"/></svg>';
    return '<svg viewBox="0 0 300 105" aria-hidden="true"><path d="M92 51h32m0 0c20 0 13-27 32-27h37m-69 27h70m-70 0c20 0 13 28 32 28h37" fill="none" stroke="#bdc6b2" stroke-width="1.5"/><circle cx="86" cy="51" r="24" fill="#e0e8d2"/><path d="m72 47 14-9 14 9M73 48h26m-22 1v14m9-14v14m9-14v14M72 64h28" stroke="#69835b" stroke-width="1.6" fill="none"/><rect x="190" y="8" width="52" height="30" rx="6" fill="#e4eada"/><rect x="190" y="40" width="66" height="26" rx="6" fill="#ead9c8"/><rect x="190" y="70" width="42" height="25" rx="6" fill="#e4eada"/><path d="M199 19h30m-30 7h21M199 50h43m-43 7h29M199 80h23m-23 7h14" stroke="#a2b295" stroke-width="2"/><circle cx="140" cy="51" r="4" fill="#c7522d"/><circle cx="174" cy="24" r="3" fill="#b1bda2"/><circle cx="174" cy="79" r="3" fill="#b1bda2"/></svg>';
  }
  function home() {
    const starters=[['road','01','La tine în oraș','Cine repară<br>drumurile?','De la o stradă asfaltată la un contract de milioane. Urmărește traseul banilor.','Explorează infrastructura',route('explore',{category:'Drumuri și construcții'})],['hospital','02','Lucrurile care contează','Ce cumpără<br>spitalele?','Medicamente, echipamente, servicii. Vezi ce se află în spatele unei sume.','Intră în lumea sănătății',route('entity',{id:'2084803'})],['people','03','Dincolo de cifre','Cine primește<br>contractele?','Firmele, instituțiile și legăturile dintre ele. Pune prima piesă la locul ei.','Cunoaște furnizorii',route('explore',{layout:'suppliers'})]];
    return '<div class="page-enter"><section class="home-hero"><div class="hero-copy"><p class="eyebrow"><span class="tiny-line"></span>Banii publici, pe înțelesul tău</p><h1>Sunt banii tăi.<br><span>Vezi unde ajung.</span></h1><p class="hero-description">De la strada ta la marile contracte. Descoperă cine cumpără, cine câștigă și ce întrebări merită puse.</p>'+searchBox()+'<div class="quick-search"><span>Încearcă</span><a class="quick-chip" href="#explore?county=Cluj">'+icon('pin')+'Cluj</a><a class="quick-chip" href="'+route('explore',{category:'Drumuri și construcții'})+'">'+icon('road')+'Drumuri</a><a class="quick-chip" href="#entity?id=2084803">'+icon('hospital')+'Spitale</a></div><p class="hero-reassurance">'+icon('shield')+'Gratuit. Date publice. Curiozitatea e suficientă.</p></div>'+mapCard()+'</section><section class="national-strip" aria-label="Dimensiunea bazei de date"><div class="national-label"><span class="database-mark">'+icon('database')+'</span><span><b>Date reale. Întrebări deschise.</b><br>Arhiva importată · 2018–2026</span></div><button class="national-stat" data-action="coverage"><strong>'+compact(D.headline.totalSpend)+' <span style="font-size:.52em">lei</span></strong><small>valoare înregistrată în arhivă ↗</small></button><button class="national-stat" data-action="coverage"><strong>'+nf.format(D.headline.authorities)+'</strong><small>instituții publice în arhivă ↗</small></button><button class="national-stat" data-action="coverage"><strong>'+nf.format(D.headline.suppliers)+'</strong><small>furnizori în arhivă ↗</small></button></section><section class="discovery-section"><div class="section-heading"><div><h2>O întrebare bună e un început.</h2><p>Nu trebuie să fii expert. Alege ce te interesează.</p></div><a class="text-button" href="#explore">Explorează achizițiile '+icon('arrow')+'</a></div><div class="question-grid">'+starters.map(([kind,n,kicker,title,desc,cta,href])=>'<a href="'+href+'" class="question-card"><div class="question-card-top"><span>'+kicker+'</span><span class="number">'+n+'</span></div><div class="question-art">'+art(kind)+'</div><h3>'+title+'</h3><p>'+desc+'</p><div class="card-bottom"><span>'+cta+'</span><span class="round-arrow">'+icon('arrow')+'</span></div></a>').join('')+'</div></section><section class="investigation-banner"><div class="folder-art" aria-hidden="true"><div class="folder-back"></div><div class="folder-paper"><i></i><i></i><i></i></div><div class="folder-front"></div></div><div><p class="eyebrow">Pentru curiozități care devin investigații</p><h2>Ai găsit un fir? Urmărește-l.</h2><p>Adună contracte, leagă informații și păstrează-ți întrebările într-o anchetă.</p></div><a class="button secondary" href="#investigations">Începe o anchetă '+icon('arrow')+'</a></section></div>';
  }

  function matches(r, q) {
    if(!q)return true;
    const hay=fold([r.title,r.cpvName,r.category,r.authorityName,pretty(r.authorityId,''),r.supplierName,r.code,r.county,r.authorityId,r.supplierId].join(' '));
    const words=fold(q).split(/\s+/).filter(x=>!['din','de','la','in','si','o','un','a','ale'].includes(x));
    return words.every(w=>hay.includes(w));
  }
  function rowsFor(params=state.params) {
    return D.records.filter(r=>(!params.county||fold(r.county)===fold(params.county))&&(!params.category||r.category===params.category)&&(!params.year||r.date.startsWith(params.year))&&(!params.authority||r.authorityId===params.authority)&&(!params.supplier||r.supplierId===params.supplier)&&(!params.source||r.source===params.source)&&matches(r,params.q)).sort((a,b)=>state.params.sort==='value'?b.amount-a.amount:b.date.localeCompare(a.date)||a.title.localeCompare(b.title));
  }
  function scopeNote() { return '<div class="scope-note">'+icon('info')+'<span>Prototip cu <b>48 de înregistrări reale</b>, din 4 instituții, 2024–2026. Sumele de mai jos descriu doar selecția afișată; pot include acorduri-cadru și acte adiționale. <button data-action="coverage">Despre eșantion</button></span></div>'; }
  function metrics(rows) {
    return '<div class="result-metrics"><div class="result-metric"><small>Valoarea înregistrărilor</small><strong>'+compact(total(rows))+' <span style="font-size:.45em">lei</span></strong><span>Suma înregistrărilor filtrate</span></div><div class="result-metric"><small>Achiziții în selecție</small><strong>'+rows.length+'</strong><span>Înregistrări care corespund filtrelor</span></div><div class="result-metric"><small>Furnizori în selecție</small><strong>'+unique(rows,'supplierId')+'</strong><span>Identificați în aceste înregistrări</span></div></div>';
  }
  function options(items,value,empty) { return '<option value="">'+empty+'</option>'+items.map(x=>'<option value="'+esc(x)+'" '+(x===value?'selected':'')+'>'+esc(x)+'</option>').join(''); }
  function filters() {
    const p=state.params;
    return '<form id="filters" class="filter-bar"><div class="field filter-search"><label for="filter-q">Caută în selecție</label><input id="filter-q" name="q" placeholder="Instituție, firmă, obiectul achiziției…" value="'+esc(p.q||'')+'"></div><div class="field"><label for="filter-county">Județul instituției</label><select id="filter-county" name="county">'+options(M.shapes.map(c=>c.label).sort((a,b)=>a.localeCompare(b,'ro')),p.county,'Toată România')+'</select></div><div class="field"><label for="filter-category">Ce s-a cumpărat</label><select id="filter-category" name="category">'+options([...new Set(D.records.map(r=>r.category))].sort(),p.category,'Toate domeniile')+'</select></div><div class="field" style="max-width:130px"><label for="filter-year">Perioada</label><select id="filter-year" name="year">'+options(D.years,p.year,'2024–2026')+'</select></div><button type="submit" class="button primary" aria-label="Aplică filtrele">'+icon('search')+'</button><a class="text-button" href="#explore">Resetează</a></form>';
  }
  function shortTitle(r) {
    if(plainTitles[r.id])return plainTitles[r.id];
    if(r.titleKind==='cpv')return r.cpvName || r.title;
    if(fold(r.title).startsWith('acord cadru') || fold(r.title).startsWith('act aditional') || r.title.length<10)return r.title+' · '+r.cpvName;
    return r.title.charAt(0).toLocaleUpperCase('ro')+r.title.slice(1);
  }
  function table(rows) {
    if(!rows.length) return emptyResults();
    const pages=Math.ceil(rows.length/10);const page=Math.min(pages,Math.max(1,Number(state.params.page)||1));const shown=rows.slice((page-1)*10,page*10);
    return '<div class="table-controls"><span>'+rows.length+' înregistrări în selecție</span><label for="sort-records">Ordonează <select id="sort-records"><option value="date" '+(state.params.sort!=='value'?'selected':'')+'>Cele mai recente</option><option value="value" '+(state.params.sort==='value'?'selected':'')+'>Valoare descrescătoare</option></select></label></div><table class="evidence-table"><caption class="sr-only">Înregistrările din selecția curentă, cu instituție, furnizor, valoare și dată</caption><thead><tr><th>Ce s-a cumpărat / Instituție</th><th>Cine a câștigat</th><th>Valoare înregistrată</th><th>Data atribuirii</th></tr></thead><tbody>'+shown.map(r=>'<tr><td><button class="evidence-title" data-action="record" data-id="'+esc(r.id)+'">'+esc(shortTitle(r))+'</button><small><a href="'+route('entity',{id:r.authorityId})+'">'+esc(pretty(r.authorityId,r.authorityName))+'</a> · '+(r.source==='da'?'Achiziție directă · etichetă CPV':fold(r.title).includes('acord cadru')?'Acord-cadru':fold(r.title).includes('act aditional')?'Act adițional':'Contract')+'</small></td><td><a class="supplier-link" href="'+route('entity',{id:r.supplierId})+'">'+esc(r.supplierName)+'</a></td><td class="amount">'+money(r.amount)+'</td><td class="date">'+date(r.date)+'</td></tr>').join('')+'</tbody></table><div class="table-footer"><span>'+((page-1)*10+1)+'–'+Math.min(page*10,rows.length)+' din '+rows.length+' înregistrări · fiecare sumă are o sursă</span><div><button class="text-button" data-action="export">'+icon('download')+'Exportă CSV</button><button class="text-button" data-action="share">'+icon('link')+'Copiază linkul</button></div></div>'+(pages>1?'<div class="pagination" role="group" aria-label="Paginarea înregistrărilor"><button class="button secondary" data-action="page" data-page="'+(page-1)+'" '+(page===1?'disabled':'')+'>← Înapoi</button><span>Pagina '+page+' din '+pages+'</span><button class="button secondary" data-action="page" data-page="'+(page+1)+'" '+(page===pages?'disabled':'')+'>Mai departe →</button></div>':'');
  }
  function emptyResults() {
    return '<div class="empty-state">'+icon('search')+'<h2>Mai e loc de căutat.</h2><p>Nu avem înregistrări pentru această combinație în eșantionul de 48 de achiziții. Încearcă un alt termen sau revino la toate înregistrările.</p><a class="button primary" href="#explore">Vezi toate cele 48 de achiziții '+icon('arrow')+'</a></div>';
  }
  function group(rows,key,name) {
    const items=new Map();rows.forEach(r=>{let item=items.get(r[key]);if(!item){item={id:r[key],name:r[name]||r[key],amount:0,count:0};items.set(r[key],item);}item.amount+=r.amount;item.count++;});
    return [...items.values()].sort((a,b)=>b.amount-a.amount);
  }
  function bars(items,totalAmount,kind='category') {
    if(!items.length)return '<p class="muted">Nicio înregistrare în selecția curentă.</p>';
    return items.map(item=>'<button class="bar-row" data-action="bar" data-kind="'+kind+'" data-value="'+esc(item.id)+'" data-tip-title="'+esc(item.name)+'" data-tip-value="'+esc(money(item.amount))+'" data-tip-context="'+item.count+' înregistrări · '+nf.format(item.amount/Math.max(totalAmount,1)*100)+'% din selecție" aria-label="'+esc(item.name)+', '+money(item.amount)+', '+item.count+' înregistrări, vezi sursele"><span class="bar-heading"><span>'+esc(item.name)+'</span><b>'+compact(item.amount)+' lei</b></span><div class="bar-track"><div class="bar-fill" style="width:'+Math.max(0,item.amount/Math.max(totalAmount,1)*100)+'%"></div></div></button>').join('')+'<p class="bar-help">Alege o bară pentru a vedea înregistrările din spatele sumei.</p>';
  }
  function suppliersView(rows) {
    if(!rows.length)return emptyResults();
    const items=group(rows,'supplierId','supplierName');
    return '<div class="chart-panel"><h2>Firmele din spatele contractelor</h2><p>Valoare cumulată în selecție. Un furnizor poate apărea în mai multe înregistrări.</p>'+bars(items,total(rows),'supplier')+'</div>';
  }
  function signalsView(rows) {
    const flagged=rows.filter(r=>r.flags.includes('da_rapid') && r.gapMinutes!==null).sort((a,b)=>b.amount-a.amount);
    return '<div class="scope-note">'+icon('eye')+'<span><b>Semnale, nu verdicte.</b> O achiziție rapidă poate avea o explicație legitimă. Intervalul scurt este un punct de pornire pentru verificare, nu dovada unei nereguli. <button data-action="method-signal">Cum se calculează?</button></span></div>'+(flagged.length?'<div class="signal-grid">'+flagged.map(r=>'<article class="signal-card"><div class="signal-top"><span>'+icon('clock')+'Achiziție finalizată rapid</span><span class="inline-label">De verificat</span></div><strong>'+r.gapMinutes+' <span>minute</span></strong><h3>De ce a durat atât de puțin?</h3><p>'+esc(pretty(r.authorityId,r.authorityName))+' · '+esc(r.cpvName)+'</p><div class="signal-fact"><span>'+money(r.amount)+'</span><span>'+date(r.date)+'</span></div><button class="text-button" data-action="record" data-id="'+esc(r.id)+'">Vezi achiziția și sursa '+icon('arrow')+'</button></article>').join('')+'</div>':'<div class="empty-state">'+icon('shield')+'<h2>Niciun semnal rapid în această selecție.</h2><p>Absența acestui indicator nu evaluează corectitudinea achizițiilor. Poți explora toate înregistrările semnalate din eșantion.</p><a class="button secondary" href="#explore?layout=signals">Vezi semnalele din eșantion</a></div>');
  }
  function mapView() {
    return '<div class="scope-note">'+icon('info')+'<span>Harta arată agregatele întregii arhive importate, 2018–2026, după sediul instituției. Filtrele de mai sus se aplică înregistrărilor detaliate. Nu indică bugetele județelor sau locul execuției lucrărilor.</span></div><div class="explore-map-layout">'+mapCard(state.params.county||'Cluj')+'<div class="county-list" aria-label="Lista județelor, alternativă la hartă">'+D.counties.map(c=>'<button class="county-row" data-action="county" data-county="'+esc(countyName(c.county))+'"><span>'+esc(countyName(c.county))+'<small>'+nf.format(c.n)+' instituții în arhivă</small></span><b>'+compact(c.totalRon)+' lei '+icon('arrow-up-right')+'</b></button>').join('')+'</div></div>';
  }
  function explore() {
    const p=state.params;const layout=p.layout||'list';const filtered=rowsFor();const rows=layout==='signals'?filtered.filter(r=>r.flags.includes('da_rapid')):filtered;
    const c=D.counties.find(x=>fold(x.county)===fold(p.county));
    const title=p.county?'Mai aproape de '+countyName(p.county)+'.':p.category?p.category+'.':'Urmărește banii.';
    const countyBanner=c?'<div class="county-summary"><div><p class="eyebrow">Context din arhiva importată · 2018–2026</p><h2>'+esc(countyName(c.county))+' în cifre</h2><p>'+nf.format(c.n)+' instituții cu sediul aici. Totalul arhivei este separat de selecția de mai jos.</p></div><button class="national-stat" data-action="coverage" style="border:0;padding:0"><strong>'+compact(c.totalRon)+' lei</strong><small>valoare înregistrată ↗</small></button></div>':'';
    return '<section class="inner-page"><div class="breadcrumbs"><a href="#home">Descoperă</a><span>/</span><span>Explorează</span></div><div class="page-heading"><div><p class="eyebrow" style="margin-bottom:12px">O achiziție. O firmă. Un fir de urmărit.</p><h1>'+esc(title)+'</h1><p>Caută ce te interesează. Fiecare rând te duce mai aproape de sursă.</p></div><span class="sample-tag">48 de înregistrări reale</span></div>'+filters()+countyBanner+(p.authority||p.supplier?'<div class="scope-note">'+icon('building')+'<span>Filtru activ: '+esc(p.authority?pretty(p.authority,D.authorities.find(a=>a.id===p.authority)?.name):D.records.find(r=>r.supplierId===p.supplier)?.supplierName)+' · <button data-action="clear-entity">Elimină acest filtru</button></span></div>':'')+scopeNote()+metrics(rows)+'<div class="results-heading"><h2>'+({list:'Dincolo de sumă',suppliers:'Cine câștigă?',signals:'Ce merită verificat?',map:'România, județ cu județ'}[layout]||'Dincolo de sumă')+'</h2><div class="segmented" role="group" aria-label="Afișare rezultate">'+[['list','list','Achiziții'],['suppliers','people','Furnizori'],['signals','eye','Semnale'],['map','map','Hartă']].map(([v,i,label])=>'<button data-action="layout" data-layout="'+v+'" class="'+(layout===v?'active':'')+'" aria-pressed="'+(layout===v)+'">'+icon(i)+'<span>'+label+'</span></button>').join('')+'</div></div>'+ (layout==='map'?mapView():layout==='suppliers'?suppliersView(rows):layout==='signals'?signalsView(rows):table(rows))+'<div class="next-question"><div><p class="eyebrow" style="margin:0 0 7px">Curiozitatea te duce mai departe</p><h3>Ai observat ceva ce merită păstrat?</h3><p>Deschide o achiziție și adaug-o într-o anchetă. Poți reveni oricând la sursă.</p></div><a class="button secondary" href="#investigations">Anchetele tale '+icon('arrow')+'</a></div></section>';
  }
  function entity() {
    const id=state.params.id;
    const authority=D.authorities.find(a=>a.id===id);
    const sample=D.records.find(r=>r.supplierId===id);
    if(!authority&&!sample) return '<section class="inner-page">'+emptyResults()+'</section>';
    const params={...state.params,...(authority?{authority:id}:{supplier:id})};
    const rows=rowsFor(params);
    const name=authority?pretty(authority.id,authority.name):sample.supplierName;
    const tab=state.params.tab||'overview';
    return '<section class="inner-page"><div class="breadcrumbs"><a href="#home">Descoperă</a><span>/</span><a href="#explore">Explorează</a><span>/</span><span>'+ (authority?'Instituție':'Furnizor')+'</span></div><div class="page-heading"><div class="profile-identity"><span class="profile-icon">'+icon(authority?(id==='2084803'?'hospital':'building'):'people')+'</span><div><p class="eyebrow">'+(authority?'Instituție publică · '+esc(countyName(authority.county)):'Firmă · furnizor de bunuri sau servicii')+'</p><h1>'+esc(name)+'</h1><p>'+esc(authority?authority.name:sample.supplierName)+' · ID în proiect '+esc(id)+'</p></div></div><button class="button secondary" data-action="save-entity" data-id="'+esc(id)+'">'+icon('folder')+'Salvează în anchetă</button></div><p class="profile-summary">În această selecție, <strong>'+esc(name)+'</strong> apare în <strong>'+rows.length+' înregistrări</strong>, cu o valoare însumată de <strong>'+money(total(rows))+'</strong>. Urmărește fiecare sumă până la achiziția din care provine.</p>'+scopeNote()+metrics(rows)+'<div class="tabs" role="group" aria-label="Secțiuni profil">'+[['overview','Pe scurt'],['records','Achiziții'],['partners',authority?'Furnizori':'Instituții'],['signals','Semnale']].map(([v,l])=>'<button class="'+(tab===v?'active':'')+'" data-action="entity-tab" data-tab="'+v+'" aria-pressed="'+(tab===v)+'">'+l+'</button>').join('')+'</div>'+(tab==='records'?table(rows):tab==='signals'?signalsView(rows):tab==='partners'?'<div class="chart-panel"><h2>'+ (authority?'Cine a primit contractele?':'Cine a cumpărat de la această firmă?')+'</h2><p>Valorile provin din înregistrările incluse în selecție.</p>'+bars(group(rows,authority?'supplierId':'authorityId',authority?'supplierName':'authorityName'),total(rows),authority?'supplier':'authority')+'</div>':'<div class="profile-charts"><section class="chart-panel"><h2>Ce s-a cumpărat?</h2><p>Domenii de achiziție, din selecția afișată.</p>'+bars(group(rows,'category','category'),total(rows))+'</section><section class="chart-panel"><h2>'+(authority?'La cine ajung contractele?':'Cine sunt cumpărătorii?')+'</h2><p>Fiecare relație are în spate înregistrări verificabile.</p>'+bars(group(rows,authority?'supplierId':'authorityId',authority?'supplierName':'authorityName').slice(0,6),total(rows),authority?'supplier':'authority')+'<button class="text-button" style="margin-top:16px" data-action="entity-tab" data-tab="partners">Vezi '+(authority?'toți furnizorii':'toate instituțiile')+' '+icon('arrow')+'</button></section></div>')+'<div class="next-question"><div><h3>Ce se află în spatele cifrelor?</h3><p>Vezi achizițiile, verifică sursele și continuă de acolo.</p></div><button class="button primary" data-action="entity-tab" data-tab="records">Vezi cele '+rows.length+' înregistrări '+icon('arrow')+'</button></div></section>';
  }

  function recordDetail(id, updateUrl=true) {
    const r=D.records.find(r=>r.id===id);if(!r){toast('Această înregistrare nu se află în prototip.');return;}
    dialogRecord=id;
    if(updateUrl){state.params.record=id;history.replaceState(null,'',route(state.view,state.params));}
    const signal=r.flags.includes('da_rapid')?'<div class="scope-note signal-caveat">'+icon('clock')+'<span><b>'+r.gapMinutes+' minute între publicare și finalizare.</b> Acesta este un indiciu de verificat; poate exista o explicație legitimă. <button data-action="method-signal">Cum se calculează?</button></span></div>':'';
    modal(shortTitle(r),(plainTitles[r.id]?'<details class="original-title"><summary>Titlul original din înregistrare</summary><p>'+esc(r.title)+'</p></details>':'')+'<span class="sample-tag">'+(r.source==='da'?'Achiziție directă':'Contract')+' · '+esc(r.code)+'</span><div class="evidence-value">'+money(r.amount)+'</div><p class="evidence-caption">Valoare înregistrată. Nu confirmă o plată efectuată.</p><dl class="evidence-details"><div><dt>Instituția care cumpără</dt><dd><a class="supplier-link" href="'+route('entity',{id:r.authorityId})+'">'+esc(pretty(r.authorityId,r.authorityName))+' ↗</a></dd></div><div><dt>Firma care furnizează</dt><dd><a class="supplier-link" href="'+route('entity',{id:r.supplierId})+'">'+esc(r.supplierName)+' ↗</a></dd></div><div><dt>Data atribuirii / finalizării</dt><dd>'+date(r.date)+'</dd></div><div><dt>Tipul achiziției</dt><dd>'+esc(r.procedure || 'Nespecificat în extras')+'</dd></div><div><dt>Categoria oficială (CPV)</dt><dd>'+esc(r.cpvName)+'<small class="muted" style="display:block;margin-top:4px">'+esc(r.cpvCode)+'</small></dd></div><div><dt>Referința originală</dt><dd>'+esc(r.code)+'</dd></div></dl>'+signal+(r.titleKind==='cpv'?'<p class="modal-copy" style="font-size:11px">Titlul afișat este denumirea categoriei CPV; titlul original nu este inclus în acest extras.</p>':'')+'<div class="modal-actions"><button class="button primary" data-action="save-record" data-id="'+esc(id)+'">'+icon('folder')+'Salvează în anchetă</button><a class="button secondary" href="'+esc(r.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Deschide sursa SICAP '+icon('arrow-up-right')+'</a><button class="text-button" data-action="share">'+icon('link')+'Copiază linkul</button></div><p class="about-meta" style="margin-top:20px">Extras real din baza proiectului. Sursa externă nu a fost reverificată de pe acest dispozitiv. Acordurile-cadru și actele adiționale pot reprezenta plafoane sau modificări.</p>');
  }
  function about(coverage=false) {
    modal(coverage?'Date reale. Contextul contează.':'Curiozitatea e un bun început.', '<p class="modal-copy">'+(coverage?'Datele din acest prototip provin din baza locală a proiectului, construită din informații publice SICAP. Extras realizat la 12 septembrie 2026; activitatea selectată ajunge până în iulie 2026.':'cinecâștigă? face achizițiile publice mai ușor de înțeles. Pornești de la o întrebare și ajungi la contractele și firmele din spatele ei.')+'</p><div class="method-step"><span>01</span><div><h3>Începe cu ce te interesează</h3><p>Alege un județ, o instituție sau un subiect. Harta și cifrele naționale descriu întreaga arhivă importată, 2018–2026. Județul reprezintă sediul instituției, nu locul investiției.</p></div></div><div class="method-step"><span>02</span><div><h3>Fiecare cifră are un context</h3><p>Explorarea detaliată include 48 de înregistrări reale, din 4 instituții, în perioada 2024–2026. Nu reprezintă toate achizițiile acestora. Contractele, acordurile-cadru și actele adiționale pot avea semnificații diferite: suma rândurilor nu este un buget și nu confirmă plăți.</p></div></div><div class="method-step"><span>03</span><div><h3>Păstrează firul și verifică sursa</h3><p>Deschide o înregistrare pentru referința SICAP. Salvează în Anchete și adaugă note. În prototip, dosarele rămân doar în browserul tău; exportă-le ca să ai o copie. Un semnal invită la verificare, fără a demonstra o neregulă.</p></div></div><div class="modal-actions"><a class="button primary" href="#explore">Explorează cele 48 de înregistrări '+icon('arrow')+'</a><a class="button secondary" href="#explore?layout=map">Vezi arhiva pe județe</a></div><details style="margin-top:25px;font-size:11px;color:var(--muted)"><summary style="cursor:pointer">Proveniență și limite ale prototipului</summary><p style="margin-top:10px;line-height:1.8">'+esc(D.meta.sampleSelection)+' '+esc(D.meta.aggregateScope)+' '+esc(D.meta.sourceLinkStatus)+'</p><p style="margin-top:10px">Tabele: '+esc(D.meta.source)+'. Hartă: '+esc(M._source)+'. Interfață fără conectare la server; nu implementează motorul complet de interogări al aplicației.</p></details>');
  }
  function signalMethod() { modal('Un semnal. O întrebare de verificat.','<p class="modal-copy">Indicatorul „finalizare rapidă” compară momentul publicării achiziției directe cu momentul finalizării înregistrat în datele SICAP. Aici afișăm doar înregistrări care au deja semnalul <code>da_rapid</code> în baza proiectului.</p><div class="method-step"><span>'+icon('clock')+'</span><div><h3>Ce vezi concret</h3><p>Numărul de minute dintre cele două momente. Acest interval nu măsoară timpul întregii proceduri de achiziție și nu descrie negocierile sau verificările anterioare publicării.</p></div></div><div class="scope-note">'+icon('info')+'<span>O durată scurtă nu dovedește favoritism, fraudă sau o încălcare. Verifică documentele și explicația instituției înainte de a formula o concluzie.</span></div><a class="button secondary" href="#explore?layout=signals">Vezi înregistrările semnalate '+icon('arrow')+'</a>'); }

  function candidates(q) {
    const query=fold(q);
    const all=[
      ...D.authorities.map(a=>({title:pretty(a.id,a.name),meta:'Instituție publică · '+countyName(a.county),search:fold(pretty(a.id,a.name)+' '+a.name+' '+a.county+' '+a.id),view:'entity',params:{id:a.id},icon:a.id==='2084803'?'hospital':'building'})),
      {title:'Drumuri și construcții',meta:'Domeniu · achiziții de infrastructură',search:'drumuri drum asfalt strada strazi autostrada infrastructura constructii',view:'explore',params:{category:'Drumuri și construcții'},icon:'road'},
      {title:'Sănătate',meta:'Domeniu · medicamente și echipamente',search:'sanatate spitale spital medicamente medical echipamente',view:'explore',params:{category:'Sănătate'},icon:'hospital'},
      ...M.shapes.map(c=>({title:c.label,meta:'Județ · vezi instituțiile și achizițiile',search:fold(c.label),view:'explore',params:{county:c.label},icon:'pin'})),
      ...[...new Map(D.records.map(r=>[r.supplierId,r])).values()].map(r=>({title:r.supplierName,meta:'Furnizor · înregistrări în eșantion',search:fold(r.supplierName+' '+r.supplierId),view:'entity',params:{id:r.supplierId},icon:'people'}))
    ];
    if(!query)return all.slice(0,4);
    return all.filter(c=>query.split(/\s+/).filter(Boolean).every(w=>c.search.includes(w))).sort((a,b)=>(fold(b.title)===query?1:0)-(fold(a.title)===query?1:0)).slice(0,6);
  }
  function suggest(input) {
    const box=document.getElementById(input.id+'-suggestions');if(!box)return;
    activeSuggestions=candidates(input.value);selectedSuggestion=0;
    if(!activeSuggestions.length)activeSuggestions=[{title:'Caută „'+input.value+'” în achiziții',meta:'Caută în titluri, firme și categorii',view:'explore',params:{q:input.value},icon:'search'}];
    box.innerHTML=activeSuggestions.map((c,i)=>'<button type="button" id="'+input.id+'-opt-'+i+'" class="suggestion '+(i===0?'selected':'')+'" role="option" aria-selected="'+(i===0)+'" tabindex="-1" data-action="suggestion" data-index="'+i+'">'+icon(c.icon)+'<span>'+esc(c.title)+'<small>'+esc(c.meta)+'</small></span>'+icon('arrow-up-right')+'</button>').join('')+'<div class="suggestion-hint" role="presentation">↑ ↓ alege · Enter deschide · Esc închide</div>';
    box.hidden=false;input.setAttribute('aria-expanded','true');input.setAttribute('aria-activedescendant',input.id+'-opt-0');
    $('#announcer').textContent=activeSuggestions.length+' sugestii disponibile.';
  }
  function dismissSearch() {document.querySelectorAll('.suggestions').forEach(el=>el.hidden=true);document.querySelectorAll('[data-search]').forEach(el=>{el.setAttribute('aria-expanded','false');el.removeAttribute('aria-activedescendant');});}
  function searchOpen() {if(state.view==='home'){closeModal();const input=$('#hero-search');input.focus();suggest(input);}else{modal('Ce vrei să afli?',searchBox('modal-search','O instituție, o firmă, un subiect…')+'<p class="modal-copy" style="font-size:12px;margin-top:20px">Încearcă „Cluj”, „drumuri” sau „spital”. Căutarea folosește datele reale incluse în acest prototip.</p>');}}
  function useSuggestion(index) {const c=activeSuggestions[index];if(c)navigate(c.view,c.params);}
  function updateParams(p) {navigate(state.view,{...state.params,...p,record:undefined});}
  function currentRows() {return state.view==='entity'?rowsFor({...state.params,...(D.authorities.some(a=>a.id===state.params.id)?{authority:state.params.id}:{supplier:state.params.id})}):rowsFor();}
  function download(content,type,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function exportCSV(){const rows=currentRows();const cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};const header=['id','data','institutie','furnizor','obiect','tip','valoare_lei','sursa','acoperire'];const lines=rows.map(r=>[r.id,r.date,r.authorityName,r.supplierName,r.title,r.source,r.amount,r.sourceUrl,'Eșantion prototip; valoare înregistrată, nu plată; extras 2026-09-12']);download('\ufeff'+[header,...lines].map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8','cinecastiga-selectie.csv');toast(rows.length+' înregistrări exportate cu sursele lor.');}
  async function share(){try{await navigator.clipboard.writeText(location.href);toast(location.protocol==='file:'?'Link local copiat. Pentru alt dispozitiv, trimite și fișierul HTML.':'Linkul către această selecție a fost copiat.');}catch(_){modal('Link către această selecție','<p class="modal-copy">Copiază adresa de mai jos. Dacă deschizi prototipul ca fișier local, trimite și fișierul HTML pentru acces de pe alt dispozitiv.</p><label class="field">Link<input readonly autofocus value="'+esc(location.href)+'" id="copy-link"></label>',()=>$('#copy-link').select());}}
  function onAction(action,el) {
    if(action.startsWith('inv-')){window.Investigations.handleAction(action,el);if(['inv-open','inv-back'].includes(action))$('#view').focus({preventScroll:true});return;}
    switch(action){
      case 'close-modal':closeModal();break;
      case 'about':about();break;
      case 'coverage':about(true);break;
      case 'search':searchOpen();break;
      case 'county':navigate('explore',{county:countyName(el.dataset.county)});break;
      case 'layout':updateParams({layout:el.dataset.layout,page:undefined});break;
      case 'page':updateParams({page:el.dataset.page});break;
      case 'record':recordDetail(el.dataset.id);break;
      case 'entity-tab':updateParams({tab:el.dataset.tab});break;
      case 'clear-entity':updateParams({authority:undefined,supplier:undefined});break;
      case 'suggestion':useSuggestion(Number(el.dataset.index));break;
      case 'method-signal':signalMethod();break;
      case 'share':share();break;
      case 'export':exportCSV();break;
      case 'save-record':{const r=D.records.find(r=>r.id===el.dataset.id);if(r){window.Investigations.openSave({...r,type:r.source,title:shortTitle(r),subtitle:pretty(r.authorityId,r.authorityName),snapshotDate:D.meta.snapshotDate,scope:'Înregistrare din eșantion; valoare înregistrată, nu plată.'});}break;}
      case 'save-entity':{const a=D.authorities.find(a=>a.id===el.dataset.id);const r=D.records.find(r=>r.supplierId===el.dataset.id);const rows=currentRows();window.Investigations.openSave({id:el.dataset.id,type:'entity',title:a?pretty(a.id,a.name):r?.supplierName,subtitle:a?'Instituție publică':'Furnizor',amount:total(rows),records:rows,sourceUrl:rows[0]?.sourceUrl,snapshotDate:D.meta.snapshotDate,scope:'Profil în eșantion, '+rows.length+' înregistrări. Totalul este suma rândurilor, nu un buget.'});break;}
      case 'bar':{const kind=el.dataset.kind;const params={...state.params,id:undefined,tab:undefined,record:undefined,layout:'list'};if(state.view==='entity'){if(D.authorities.some(a=>a.id===state.params.id))params.authority=state.params.id;else params.supplier=state.params.id;}params[kind]=el.dataset.value;delete params.page;navigate('explore',params);break;}
    }
  }
  document.addEventListener('click', e=>{
    const skip=e.target.closest('.skip-link');if(skip){e.preventDefault();$('#view').focus();$('#view').scrollIntoView();return;}
    const anchor=e.target.closest('a[href^="#"]');
    if(anchor&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();const [v,p]=anchor.getAttribute('href').slice(1).split('?');navigate(v,Object.fromEntries(new URLSearchParams(p||'')));}
    const el=e.target.closest('[data-action]');if(el){e.preventDefault();onAction(el.dataset.action,el);}if(!e.target.closest('.hero-search-wrap'))dismissSearch();
  });
  document.addEventListener('input', e=>{if(e.target.matches('[data-search]'))suggest(e.target);});
  document.addEventListener('focusin',e=>{if(e.target.matches('[data-search]'))suggest(e.target);});
  document.addEventListener('submit',e=>{
    if(e.target.matches('[data-search-form]')){e.preventDefault();const input=e.target.querySelector('input');if(!document.getElementById(input.id+'-suggestions').hidden && activeSuggestions.length)useSuggestion(selectedSuggestion);else navigate('explore',{q:input.value});}
    if(e.target.id==='filters'){e.preventDefault();const data=Object.fromEntries(new FormData(e.target));navigate('explore',{...state.params,...data,page:undefined});}
  });
  document.addEventListener('change',e=>{if(e.target.closest('#filters')&&e.target.tagName==='SELECT')$('#filters').requestSubmit();if(e.target.id==='sort-records')updateParams({sort:e.target.value,page:undefined});});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&$('#modal').open&&!e.target.matches('[data-search]')){e.preventDefault();closeModal();return;}
    if(e.key==='/'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.target.matches('input,textarea,select,[contenteditable="true"]')){e.preventDefault();searchOpen();}
    if(e.target.matches('.county-shape')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onAction('county',e.target);}
    if(e.target.matches('[data-search]')){
      const box=document.getElementById(e.target.id+'-suggestions');
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismissSearch();return;}
      if(e.key==='Enter'){e.preventDefault();if(!box.hidden&&activeSuggestions.length)useSuggestion(selectedSuggestion);else navigate('explore',{q:e.target.value});return;}
      if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(box.hidden)suggest(e.target);else selectedSuggestion=(selectedSuggestion+(e.key==='ArrowDown'?1:-1)+activeSuggestions.length)%activeSuggestions.length;box.querySelectorAll('[role="option"]').forEach((el,i)=>{el.classList.toggle('selected',i===selectedSuggestion);el.setAttribute('aria-selected',String(i===selectedSuggestion));});e.target.setAttribute('aria-activedescendant',e.target.id+'-opt-'+selectedSuggestion);}
    }
  });
  function showBarTip(el,x,y){const tip=$('#map-tip');tip.innerHTML='<b>'+esc(el.dataset.tipTitle)+'</b>'+esc(el.dataset.tipValue)+'<small>'+esc(el.dataset.tipContext)+'</small>';tip.hidden=false;tip.style.left=Math.max(8,Math.min(innerWidth-280,x+14))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-95,y+14))+'px';}
  document.addEventListener('pointerover',e=>{const bar=e.target.closest('.bar-row');if(bar)showBarTip(bar,e.clientX,e.clientY);});
  document.addEventListener('pointermove',e=>{const bar=e.target.closest('.bar-row');if(bar)showBarTip(bar,e.clientX,e.clientY);});
  document.addEventListener('pointerout',e=>{const bar=e.target.closest('.bar-row');if(bar&&!bar.contains(e.relatedTarget))$('#map-tip').hidden=true;});
  document.addEventListener('focusin',e=>{if(e.target.matches('.bar-row')){const r=e.target.getBoundingClientRect();showBarTip(e.target,r.x,r.y);}});
  document.addEventListener('focusout',e=>{if(e.target.matches('.bar-row'))$('#map-tip').hidden=true;});
  function showTip(el,x,y){const c=D.counties.find(c=>fold(c.county)===fold(el.dataset.county));const tip=$('#map-tip');tip.innerHTML='<b>'+esc(countyName(el.dataset.county))+'</b>'+(c?money(c.totalRon)+'<small>'+nf.format(c.n)+' instituții · arhivă 2018–2026</small>':'Fără valoare disponibilă');tip.hidden=false;tip.style.left=Math.max(8,Math.min(innerWidth-240,x+14))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-90,y+14))+'px';}
  document.addEventListener('pointerover',e=>{if(e.target.matches('.county-shape'))showTip(e.target,e.clientX,e.clientY);});
  document.addEventListener('pointermove',e=>{if(e.target.matches('.county-shape'))showTip(e.target,e.clientX,e.clientY);});
  document.addEventListener('pointerout',e=>{if(e.target.matches('.county-shape'))$('#map-tip').hidden=true;});
  document.addEventListener('focusin',e=>{if(e.target.matches('.county-shape')){const r=e.target.getBoundingClientRect();showTip(e.target,r.x,r.y);}});
  document.addEventListener('focusout',e=>{if(e.target.matches('.county-shape'))$('#map-tip').hidden=true;});

  function render(focus=false) {
    state=readRoute();
    $('#map-tip').hidden=true;
    document.querySelectorAll('[data-nav]').forEach(el=>{const active=el.dataset.nav===state.view||(state.view==='entity'&&el.dataset.nav==='explore');el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    $('#view').innerHTML=state.view==='home'?home():state.view==='explore'?explore():state.view==='entity'?entity():window.Investigations.render();
    document.title=(state.view==='home'?'Sunt banii tăi.':state.view==='investigations'?'Anchetele tale':state.view==='entity'?'Urmărește o instituție sau o firmă':'Explorează achizițiile')+' — cinecâștigă?';
    hydrateIcons();
    if(focus)$('#view').focus({preventScroll:true});
    if(state.params.record) recordDetail(state.params.record,false);
  }
  window.addEventListener('hashchange',()=>{closeModal();render(true);window.scrollTo({top:0,behavior:'instant'});});
  window.Investigations.init();
  render();
})();
