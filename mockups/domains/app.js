/* Shared interaction layer: both directions use the exact same real records. */
const fmtNumber = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const fmtDecimal = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });
const fmtExact = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ţ/g, 't').replace(/ş/g, 's').toLowerCase();
const compact = value => value >= 1e9 ? `${fmtDecimal.format(value / 1e9)} mld.` : value >= 1e6 ? `${fmtDecimal.format(value / 1e6)} mil.` : fmtNumber.format(value);
const pct = (value, total) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(total ? value / total * 100 : 0);
const aliases = {
  '45':'Construcții','33':'Medical & farmaceutice','34':'Echipamente de transport','90':'Deșeuri, apă & mediu','09':'Energie & combustibili','71':'Arhitectură & inginerie','79':'Servicii pentru organizații','50':'Reparații & întreținere','other':'Celelalte domenii',
  '03':'Agricultură & produse conexe','14':'Materii prime & minerit','15':'Alimente & băuturi','16':'Utilaje agricole','18':'Îmbrăcăminte & încălțăminte','19':'Piele, textile & materiale','22':'Cărți & imprimate','24':'Produse chimice','30':'Calculatoare & echipamente de birou','31':'Echipamente electrice','32':'Radio & telecomunicații','35':'Securitate & apărare','37':'Sport, jocuri & artă','38':'Laboratoare & instrumente','39':'Mobilier & produse pentru clădiri','41':'Apă','42':'Echipamente industriale','43':'Utilaje de construcții','44':'Materiale de construcții','48':'Software','51':'Servicii de instalare','55':'Servicii hoteliere & restaurante','60':'Servicii de transport','63':'Servicii conexe transportului','64':'Poștă & telecomunicații','65':'Utilități publice','66':'Finanțe & asigurări','70':'Servicii imobiliare','72':'Servicii IT','73':'Cercetare & dezvoltare','75':'Administrație & apărare','76':'Servicii pentru petrol & gaze','77':'Agricultură & spații verzi','80':'Învățământ & formare','85':'Sănătate & asistență socială','92':'Cultură, recreere & sport','98':'Servicii comunitare',
  '4523':'Drumuri, rețele & infrastructură','4521':'Clădiri','4531':'Instalații electrice','4532':'Izolații','4545':'Alte lucrări de finisare','4500':'Construcții — cod general','4525':'Construcții industriale','4520':'Lucrări publice — cod general','4511':'Demolări & terasamente','4544':'Vopsitorie & geamuri','4526':'Acoperișuri & lucrări speciale','4522':'Inginerie & construcții','4524':'Lucrări hidraulice','4533':'Instalații de apă','4550':'Utilaje cu operator — cod general','4542':'Tâmplărie & dulgherie','4534':'Garduri & dispozitive de siguranță','4543':'Pardoseli & pereți','4530':'Instalații — cod general','4541':'Tencuieli','4540':'Finisaje — cod general','4552':'Închiriere utilaje de terasament','4535':'Instalații mecanice','4551':'Închiriere macarale','4510':'Pregătire șantier — cod general','4512':'Sondaje & foraje'
};
const colors = {'45':'#204c3c','33':'#809665','34':'#bc956e','90':'#668f82','09':'#bfc89e','71':'#a0b596','79':'#84928b','50':'#c8cbb9','other':'#dce3cf'};
const glyphs = {
  arrow:'M5 12h14m-5-5 5 5-5 5', up:'M7 17 17 7M7 7h10v10', search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', close:'m6 6 12 12M6 18 18 6', chevron:'m9 5 7 7-7 7', back:'m14 6-6 6 6 6', globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c4 4 4 14 0 18-4-4-4-14 0-18', calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2', cursor:'m5 3 14 9-7 2-3 7-4-18', folder:'M3 7V5h6l2 3h10v12H3V7', grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3', building:'M4 21V9l8-6 8 6v12M2 21h20M9 21v-7h6v7M8 9h1m6 0h1', medical:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3', truck:'M2 6h12v11H2zM14 10h4l4 4v3h-8M8 17a2 2 0 1 1-4 0m16 0a2 2 0 1 1-4 0', leaf:'M20 3c0 12-3 17-10 17a7 7 0 0 1-7-7C3 6 8 3 20 3M5 19 15 9', bolt:'m13 2-9 12h7l-1 8 10-12h-7l1-8', ruler:'m3 17 14-14 4 4L7 21l-4-4M14 6l3 3m-6 0 3 3m-6 0 3 3', briefcase:'M8 6V3h8v3M3 7h18v14H3V7m0 7c6 3 12 3 18 0M10 12h4', wrench:'M20 4a6 6 0 0 1-8 8l-8 8-3-3 8-8a6 6 0 0 1 8-8l-4 4 3 3 4-4', chart:'M4 3v18h17M8 16v-5m5 5V7m5 9V4', users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4-4a4 4 0 0 1 0 8m1 4a4 4 0 0 1 4 4v2', shield:'M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6l-9-3m-4 9 3 3 5-6'
};
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${glyphs[name] || glyphs.grid}"/></svg>`;
const categoryIcon = code => ({'45':'building','33':'medical','34':'truck','90':'leaf','09':'bolt','71':'ruler','79':'briefcase','50':'wrench','other':'grid'}[code] || (code.startsWith('45') ? 'building' : 'grid'));
const allNodes = new Map();
const parents = new Map();
function indexNodes(nodes, parent = '') {
  nodes.forEach((node, index) => {
    node.displayName = aliases[node.code] || node.name;
    node.color = colors[node.code] || ['#557b5d','#8aa17a','#b4c49f','#809a82','#b3a583'][index % 5];
    allNodes.set(node.code, node); parents.set(node.code, parent);
    if (node.children) indexNodes(node.children, node.code);
  });
}
indexNodes(DOMAIN_DATA.categories);
const allDivisions = DOMAIN_DATA.categories.flatMap(node => node.isOther ? node.children : [node]);
const state = { mode:'atlas', code:'', view:'browse', from:'', query:'', sort:'value', all:false };
let disposeAtlas = null;
let pendingFocus = '';
let atlasNavigation = 0;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const currentNode = () => allNodes.get(state.code);
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  state.mode = params.get('mode') === 'cards' ? 'cards' : 'atlas';
  state.code = allNodes.has(params.get('code')) ? params.get('code') : '';
  state.view = state.code && (params.get('view') === 'details' || state.mode === 'cards' || !currentNode()?.children?.length) ? 'details' : 'browse';
  state.from = params.has('from') ? (allNodes.has(params.get('from')) ? params.get('from') : '') : parents.get(state.code) || '';
  state.query = params.get('q') || '';
  state.sort = params.get('sort') === 'name' ? 'name' : 'value';
  state.all = params.get('all') === '1';
}
function hashFor(patch = {}) {
  const next = { ...state, ...patch };
  const params = new URLSearchParams({mode:next.mode});
  if (next.code) params.set('code',next.code);
  if (next.code && next.view === 'details') { params.set('view','details'); params.set('from',next.from || ''); }
  if (next.query) params.set('q',next.query);
  if (next.sort === 'name') params.set('sort','name');
  if (next.all) params.set('all','1');
  return '#' + params;
}
function navigate(patch, focus = 'heading') {
  pendingFocus = focus;
  const nextHash = hashFor(patch);
  if (location.hash === nextHash) return;
  location.hash = nextHash;
}
function chooseCategory(code) {
  if (state.mode !== 'atlas' || !allNodes.get(code)?.children?.length) { openDetails(code); return; }
  browseCategory(code);
}
function openDetails(code) {
  atlasNavigation++;
  const source = document.querySelector(`[data-open="${CSS.escape(code)}"] .card-name`);
  if (source) source.style.viewTransitionName = 'category-title';
  navigate({code,view:'details',from:state.view==='browse'?state.code:state.from,query:'',all:false});
}
function browseCategory(code) {
  if (code && !allNodes.get(code)?.children?.length) { openDetails(code); return; }
  const canvas = document.querySelector('.atlas-canvas');
  const tile = document.querySelector(`[data-atlas-code="${CSS.escape(code)}"]`);
  const navigation = ++atlasNavigation;
  if (state.mode === 'atlas' && canvas && tile && !reduced()) {
    const a = canvas.getBoundingClientRect(), b = tile.getBoundingClientRect();
    canvas.style.transformOrigin = `${b.x - a.x + b.width / 2}px ${b.y - a.y + b.height / 2}px`;
    canvas.animate([{transform:'scale(1)',opacity:1},{transform:'scale(1.07)',opacity:.25}],{duration:160,easing:'ease-in',fill:'forwards'}).finished.then(() => {
      if(navigation===atlasNavigation) navigate({mode:'atlas',code,view:'browse',query:'',all:false},'atlas');
    }).catch(()=>{});
  } else navigate({mode:'atlas',code,view:'browse',query:'',all:false},'atlas');
}
function scopeChips() {
  return `<div class="scope-chips" aria-label="Perimetrul datelor din schiță"><span class="scope-chip">${icon('globe',15)} ${htmlEscape(DOMAIN_DATA.scope.place)}</span><span class="scope-chip">${icon('calendar',15)} ${DOMAIN_DATA.scope.year}</span></div>`;
}
function searchMarkup() {
  return `<div class="search-row"><label class="search-box">${icon('search',20)}<input id="domain-search" type="search" aria-label="Caută un domeniu sau cod CPV" placeholder="Caută un domeniu sau un cod CPV…" value="${htmlEscape(state.query)}" autocomplete="off"><kbd>/</kbd></label>${scopeChips()}</div><div class="quick-search"><span>Încearcă</span><button data-search="construcții">Construcții</button><button data-search="medical">Medical</button><button data-search="servicii IT">Servicii IT</button><button data-search="spații verzi">Spații verzi</button></div>`;
}
function heroMarkup() {
  return `<section class="hero"><div><p class="eyebrow"><span class="dash"></span> EXPLOREAZĂ / DOMENII</p><h1>Ce cumpără<br><em>instituțiile publice?</em></h1><p class="intro">De la drumuri la medicamente. Alege un domeniu și urmărește banii până la înregistrările din SEAP.</p></div><aside class="hero-context"><p class="eyebrow">VALOARE ÎNREGISTRATĂ · ${DOMAIN_DATA.scope.year}</p><div class="national-value">${compact(DOMAIN_DATA.total)} <span>lei</span></div><p class="context-note"><strong>${fmtNumber.format(DOMAIN_DATA.count)} înregistrări</strong> cu cod CPV<br>Achiziții directe și contracte atribuite</p><button class="tiny-link" data-action="national-evidence">Vezi înregistrările ${icon('up',12)}</button></aside></section>${searchMarkup()}`;
}
function cardsMarkup(nodes, total) {
  return `<div class="category-grid">${nodes.map((node,index)=>`<button class="category-card card-enter ${node.code==='45'?'featured':''} ${node.isOther?'remainder':''}" data-open="${htmlEscape(node.code)}" style="--i:${Math.min(index,8)};--bar:${node.color}" aria-label="Explorează ${htmlEscape(node.displayName)}. ${fmtNumber.format(node.count)} înregistrări."><span class="card-top"><span class="category-icon">${icon(categoryIcon(node.code),21)}</span><span class="card-cpv">${node.isOther?`${node.children.length} DOMENII`:`CPV ${node.code}`}</span><span class="card-arrow">${icon('arrow',14)}</span></span><span class="card-name">${htmlEscape(node.displayName)}</span><span class="card-value">${compact(node.value)} <small>lei</small></span><span class="card-meta">${fmtNumber.format(node.count)} înregistrări</span><span class="card-bottom"><span class="share-track"><span style="width:${Math.min(100,node.value/total*100)}%"></span></span><span class="share-caption"><strong>${pct(node.value,total)}% <span class="share-label">din selecție</span></strong><span>Explorează ${icon('chevron',10)}</span></span></span></button>`).join('')}</div>`;
}
function atlasMarkup(nodes, total) {
  return `<div class="atlas-layout"><div class="atlas-canvas" id="atlas-canvas"></div><aside class="atlas-side"><p class="eyebrow">DOMENIILE DIN ACEASTĂ VEDERE</p><div class="atlas-list">${nodes.map(node=>`<div class="atlas-list-row"><button data-open="${htmlEscape(node.code)}" aria-label="${node.children?.length?'Explorează subdomeniile':'Vezi detaliile'}: ${htmlEscape(node.displayName)}"><i style="background:${node.color}"></i><span class="list-name">${htmlEscape(node.displayName)}</span><span class="list-percent">${pct(node.value,total)}%</span></button><button class="list-details" data-details="${htmlEscape(node.code)}" aria-label="Vezi detaliile: ${htmlEscape(node.displayName)}">${icon('up',14)}</button></div>`).join('')}</div><div class="atlas-help">${icon('cursor',20)}<p><strong>Click pe zonă: intri în subdomenii.</strong><br>Săgeata ↗ deschide direct detaliile.<br>La ultimul nivel, și zona deschide detaliile.</p></div></aside></div>`;
}
function ancestryFor(code) {
  const result = []; let cursor = code;
  while (cursor && allNodes.has(cursor) && result.length < 16) { result.unshift(allNodes.get(cursor)); cursor = parents.get(cursor); }
  return result;
}
function atlasScopeMarkup() {
  const selected = currentNode();
  const chain = ancestryFor(state.code);
  return `<div class="atlas-scope"><div class="atlas-path"><nav aria-label="Traseul din atlas"><button data-browse="">Toate domeniile</button>${chain.map((node,index)=>`${icon('chevron',11)}${index===chain.length-1?`<span aria-current="page">${htmlEscape(node.displayName)}</span>`:`<button data-browse="${htmlEscape(node.code)}">${htmlEscape(node.displayName)}</button>`}`).join('')}</nav>${selected?`<button class="atlas-back" data-browse="${htmlEscape(parents.get(selected.code)||'')}">${icon('back',13)} Un nivel înapoi</button>`:`<span class="atlas-path-hint">Plimbă cursorul peste orice zonă pentru informații.</span>`}</div><div class="atlas-scope-summary"><div><h2 id="atlas-heading" tabindex="-1">${selected?htmlEscape(selected.displayName):'Toate domeniile'}</h2><p>${compact(selected?.value||DOMAIN_DATA.total)} lei <span>·</span> ${fmtNumber.format(selected?.count||DOMAIN_DATA.count)} înregistrări</p></div>${selected?`<button class="button secondary" data-details="${htmlEscape(selected.code)}">Detalii despre domeniu ${icon('up',15)}</button>`:`<button class="text-link" data-action="evidence">Vezi înregistrările ${icon('up',14)}</button>`}</div></div>`;
}
function listingNodes() {
  const selected = currentNode();
  let nodes = selected ? [...(selected.children || [])] : [...(state.all || state.query ? allDivisions : DOMAIN_DATA.categories)];
  if (state.query) {
    const query = plain(state.query).trim();
    const words = query.split(/\s+/).filter(Boolean);
    if (/^\d{2,8}(?:-\d)?$/.test(query)) {
      const rawCode = query.split('-')[0];
      let prefix = rawCode;
      while (prefix.length > 2 && prefix.endsWith('0')) prefix = prefix.slice(0,-1);
      const available = selected ? nodes : [...allNodes.values()].filter(node=>!node.isOther);
      const fullCode = available.filter(node=>node.code===rawCode);
      const exact = fullCode.length ? fullCode : available.filter(node=>node.code===prefix);
      const descendants = available.filter(node=>node.code.startsWith(prefix));
      const ancestors = available.filter(node=>prefix.startsWith(node.code)).sort((a,b)=>b.code.length-a.code.length);
      nodes = exact.length ? exact : descendants.length ? descendants.filter(node=>!descendants.some(other=>other!==node && node.code.startsWith(other.code))) : ancestors.slice(0,1);
    } else {
      const matches = node=>words.every(word=>plain(`${node.name} ${node.displayName} ${node.code}`).includes(word));
      nodes = nodes.filter(matches);
      // Only search deeper groups when no division matches: the result totals
      // must never include both a parent and one of its own children.
      if (!selected && !nodes.length) {
        const candidates = [...allNodes.values()].filter(node=>node.code.length>2 && !node.isOther && matches(node));
        nodes = candidates.filter(node=>!candidates.some(other=>other!==node && node.code.startsWith(other.code)));
      }
    }
  }
  return nodes.sort(state.sort === 'name' ? (a,b)=>a.displayName.localeCompare(b.displayName,'ro') : (a,b)=> (a.isOther?1:0)-(b.isOther?1:0) || b.value-a.value);
}
function listingMarkup() {
  const selected = currentNode();
  const nodes = listingNodes();
  const total = state.query ? nodes.reduce((sum,n)=>sum+n.value,0) : selected?.value || DOMAIN_DATA.total;
  const label = state.query ? 'Rezultatele căutării' : selected ? 'Intră într-un subdomeniu' : state.mode === 'atlas' ? 'O imagine de ansamblu. Multe puncte de pornire.' : 'Cu ce domeniu vrei să începi?';
  return `<section id="listing" class="${state.mode==='atlas'?'atlas-listing':''}">${state.mode==='atlas'?atlasScopeMarkup():''}<div class="section-heading"><div class="section-title"><h2>${label}</h2><span class="count">${nodes.length}</span></div><label class="sort-control"><span>Ordonează</span><select id="sort" aria-label="Ordonează domeniile"><option value="value" ${state.sort==='value'?'selected':''}>După valoare</option><option value="name" ${state.sort==='name'?'selected':''}>Alfabetic</option></select></label></div>${nodes.length ? state.mode === 'atlas' ? atlasMarkup(nodes,total) : cardsMarkup(nodes,total) : `<div class="empty"><h3>Niciun domeniu găsit</h3><p>Încearcă un cuvânt mai simplu sau un cod CPV.</p><button class="button secondary" data-search="">Resetează căutarea</button></div>`}<div class="caption"><span>${state.query ? 'Ponderi calculate între rezultatele căutării.' : selected ? 'Fiecare zonă păstrează înregistrările proprii. Codurile generale sunt separate de subdomenii, fără dublă numărare.' : !selected && !state.all ? `Cele mai mari 8 domenii + celelalte ${DOMAIN_DATA.categoryCount-8}, grupate. Fiecare înregistrare este numărată o singură dată.` : 'Ponderi din valoarea totală a selecției. Denumirile CPV oficiale sunt disponibile în detalii.'}</span>${!selected && !state.all && !state.query?`<button data-action="all">Toate cele ${DOMAIN_DATA.categoryCount} ${icon('arrow',11)}</button>`:`<button data-action="method">Despre date</button>`}</div></section>`;
}
function scopedQuestions(node) {
  if (node.isOther || node.code.length !== 2) return '';
  const makeUrl = (block,dim) => {
    const spec = {...node.sourceSpec,block,...(dim?{dim,topN:10}:{})};
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(spec)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return `https://cinecastiga.ro/intreaba?spec=${encoded}`;
  };
  return `<section class="question-strip"><p><strong>Următoarea întrebare?</strong> Domeniul și perioada sunt deja alese.</p><a href="${makeUrl('table','supplier')}" target="_blank" rel="noopener">${icon('users',17)} Cine câștigă? ${icon('up',14)}</a><a href="${makeUrl('table','authority')}" target="_blank" rel="noopener">${icon('building',17)} Cine cumpără? ${icon('up',14)}</a><a href="${makeUrl('timeseries')}" target="_blank" rel="noopener">${icon('chart',17)} Cum evoluează? ${icon('up',14)}</a></section>`;
}
function detailMarkup(node) {
  const parent = allNodes.get(parents.get(node.code));
  return `<nav class="breadcrumbs" aria-label="Poziția în domenii"><button class="detail-atlas-return" data-browse="${htmlEscape(state.from)}">${icon('back',12)} Înapoi la atlas</button><button data-action="home">${icon('back',12)} Toate domeniile</button>${parent?`${icon('chevron',10)}<button data-open="${parent.code}">${htmlEscape(parent.displayName)}</button>`:''}${icon('chevron',10)}<span>${htmlEscape(node.displayName)}</span></nav><section class="detail-hero"><div><div class="detail-title-line"><span class="detail-icon" style="--category-color:${node.color};color:${['other','09','50'].includes(node.code)?'#29452f':'#fffefa'}">${icon(categoryIcon(node.code),29)}</span><div><p class="eyebrow">${node.isOther?'DOMENII GRUPATE':`CPV ${node.code}`} · ${DOMAIN_DATA.scope.year}</p><h1 id="detail-title" style="view-transition-name:category-title">${htmlEscape(node.displayName)}</h1></div></div><p class="official-name">${node.isOther?`${node.children.length} diviziuni CPV, păstrate integral în total. Alege una pentru a continua.`:htmlEscape(node.officialName)}</p></div><div class="detail-actions"><button class="button" data-action="evidence">Vezi înregistrările ${icon('arrow',15)}</button></div></section><div class="stats-row"><div class="stat"><span class="stat-label">Valoare înregistrată</span><strong class="stat-value">${compact(node.value)} lei</strong><span class="stat-foot">Valori din surse, nu plăți confirmate</span></div><div class="stat"><span class="stat-label">Înregistrări în selecție</span><strong class="stat-value">${fmtNumber.format(node.count)}</strong><span class="stat-foot">Achiziții directe + atribuiri pe câștigător</span></div><div class="stat"><span class="stat-label">Pondere în ${parent ? htmlEscape(parent.displayName.toLowerCase()) : 'totalul național'}</span><strong class="stat-value">${pct(node.value,parent?.value||DOMAIN_DATA.total)}%</strong><span class="stat-foot">${DOMAIN_DATA.scope.year} · înregistrări cu cod CPV</span></div></div>${node.children?.length?listingMarkup():`<div class="leaf-note"><div><p class="eyebrow">MAI APROAPE DE DATE</p><h3>Aici începe verificarea.</h3><p>Deschide înregistrările acestei categorii în aplicație. Fiecare rând păstrează legătura cu sursa SEAP.</p></div><a class="button secondary" href="${htmlEscape(node.evidenceUrl)}" target="_blank" rel="noopener">Deschide sursele ${icon('up',15)}</a></div>`}${scopedQuestions(node)}`;
}
function invitation() {
  return `<aside class="next-step"><span class="next-step-icon">${icon('spark',23)}</span><div><h3>Un domeniu e doar începutul.</h3><p>Compară firme, urmărește instituții și păstrează descoperirile într-o anchetă.</p></div><a href="https://cinecastiga.ro/intreaba" target="_blank" rel="noopener">Construiește o întrebare ${icon('arrow',18)}</a></aside>`;
}
function mountAtlas() {
  disposeAtlas?.(); disposeAtlas = null;
  const canvas = document.getElementById('atlas-canvas');
  if (canvas) disposeAtlas = renderAtlas(canvas,listingNodes().map(n=>({...n,name:n.displayName})),chooseCategory,{shareLabel:'din selecție',onDetails:openDetails});
}
function updateListing() {
  disposeAtlas?.(); disposeAtlas = null;
  const listing = document.getElementById('listing');
  if (listing) listing.outerHTML = listingMarkup();
  mountAtlas();
}
function renderPage() {
  const previousCanvasTop = pendingFocus==='atlas' && !document.getElementById('detail-title') ? document.querySelector('.atlas-layout')?.getBoundingClientRect().top : undefined;
  disposeAtlas?.(); disposeAtlas = null;
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===state.mode)));
  const node = currentNode();
  document.getElementById('content').innerHTML = `${node && state.view==='details'?detailMarkup(node):heroMarkup()+listingMarkup()}${invitation()}`;
  mountAtlas();
  if (typeof previousCanvasTop==='number') {
    const nextCanvas = document.getElementById('atlas-canvas');
    if(nextCanvas) window.scrollBy(0,nextCanvas.getBoundingClientRect().top-previousCanvasTop);
  }
  document.title = `${state.mode==='cards'?'A · Categorii':'B · Atlas animat'}${node?' · '+node.displayName:''} — cinecâștigă?`;
  document.getElementById('announcer').textContent = `${state.mode==='cards'?'Categorii':'Atlas animat'}${node?': '+node.displayName:': toate domeniile'}`;
  if (pendingFocus==='heading') {
    const heading = document.querySelector('h1');
    heading.tabIndex = -1; heading.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'instant'});
  } else if (pendingFocus==='atlas') {
    document.getElementById('atlas-heading')?.focus({preventScroll:true});
    if(typeof previousCanvasTop!=='number') document.getElementById('atlas-canvas')?.scrollIntoView({block:'center',behavior:'instant'});
  } else if (pendingFocus.startsWith('card:')) document.querySelector(`[data-open="${CSS.escape(pendingFocus.slice(5))}"]`)?.focus({preventScroll:true});
  pendingFocus = '';
}
function showEvidence(code = state.code) {
  const node = allNodes.get(code);
  const source = node || DOMAIN_DATA;
  const rows = node?.records || [];
  const label = node?.displayName || 'Toate domeniile';
  document.getElementById('evidence-content').innerHTML = `<div class="dialog-body"><div class="dialog-top"><div><p class="eyebrow">TRANSPARENȚĂ / SURSELE CIFRELOR</p><h2 id="evidence-title">${htmlEscape(label)}</h2></div><button class="close" data-action="close" aria-label="Închide">${icon('close',18)}</button></div><p class="dialog-intro">${DOMAIN_DATA.scope.year} · ${htmlEscape(DOMAIN_DATA.scope.place)} · ${fmtNumber.format(source.count)} înregistrări.<br>Fiecare sumă poate fi urmărită până la sursa sa.</p><div class="evidence-summary"><div><strong>${fmtExact.format(source.value||source.total)} lei</strong><span>Valoarea întregii selecții</span></div><a class="button" href="${htmlEscape(source.evidenceUrl)}" target="_blank" rel="noopener">Vezi toate înregistrările ${icon('up',15)}</a></div>${rows.length?`<p class="dialog-intro">${htmlEscape(node.recordsNote||DOMAIN_DATA.recordsNote)}</p><div class="records">${rows.map(row=>`<article class="record"><div class="record-head"><h3>${htmlEscape(row.title)}</h3><strong class="record-value">${fmtExact.format(row.value)} lei</strong></div><p class="record-meta">${htmlEscape(row.buyer)}<br>→ ${htmlEscape(row.supplier)} · ${htmlEscape(row.date)} · CPV ${htmlEscape(row.cpvCode)}${row.nWinners>1?`<br>Consorțiu: valoare alocată 1/${row.nWinners} acestui câștigător. Valoarea integrală a contractului: ${fmtExact.format(Number(row.contractValueFull))} lei.`:''}</p><a href="${htmlEscape(row.url)}" target="_blank" rel="noopener">Deschide sursa SEAP ${icon('up',12)}</a></article>`).join('')}</div>`:`<p class="dialog-intro">Lista completă se deschide în aplicația publică, cu aceeași selecție. Previzualizarea locală a rândurilor este disponibilă în domeniul Construcții.</p>`}<div class="dialog-foot"><p>Valorile sunt înregistrate, nu plăți confirmate. Rândurile cu membri ai unui consorțiu nu sunt contracte distincte.</p><button class="button secondary" data-action="close">Înapoi la explorare</button></div></div>`;
  document.getElementById('evidence').showModal();
}
function showMethod() {
  document.getElementById('evidence-content').innerHTML = `<div class="dialog-body"><div class="dialog-top"><div><p class="eyebrow">DATE REALE / SCHIȚĂ INTERACTIVĂ</p><h2 id="evidence-title">Aceleași cifre. Aceleași surse.</h2></div><button class="close" data-action="close" aria-label="Închide">${icon('close',18)}</button></div><div class="method-copy"><p><strong>Ambele propuneri folosesc aceleași date reale:</strong> ${fmtNumber.format(DOMAIN_DATA.count)} rânduri, în valoare de ${fmtExact.format(DOMAIN_DATA.total)} lei, din ${htmlEscape(DOMAIN_DATA.scope.period)}.</p><p>${htmlEscape(DOMAIN_DATA.scope.sourceNote)}</p><p>${htmlEscape(DOMAIN_DATA.provenance.grouping)} Denumirile scurte sunt etichete de navigare; denumirea CPV oficială apare în detalii.</p><p><strong>Ce poți încerca:</strong> comută A / B, caută, sortează, deschide Construcții sau Celelalte domenii, verifică sursele și revino folosind traseul de sus sau butonul Înapoi al browserului.</p><p>Perioada și aria geografică sunt fixe în această schiță. Alte întrebări și listele complete se deschid în <a href="${htmlEscape(DOMAIN_DATA.evidenceUrl)}" target="_blank" rel="noopener">aplicația publică</a>. Datele au fost extrase la ${htmlEscape(DOMAIN_DATA.scope.extractedAt.slice(0,10))}; disponibilitatea SEAP nu a fost verificată.</p></div></div>`;
  document.getElementById('evidence').showModal();
}
document.addEventListener('click',event=>{
  if(event.target.closest('.skip')){event.preventDefault();document.getElementById('main').focus();return;}
  const button = event.target.closest('[data-mode],[data-open],[data-action],[data-search],[data-details],[data-browse]');
  if (!button) return;
  if (button.dataset.mode) { navigate({mode:button.dataset.mode},''); return; }
  if (button.hasAttribute('data-browse')) { browseCategory(button.dataset.browse); return; }
  if (button.dataset.details) { openDetails(button.dataset.details); return; }
  if (button.dataset.open) { chooseCategory(button.dataset.open); return; }
  if (button.hasAttribute('data-search')) {
    if (state.code) { navigate({code:'',view:'browse',query:button.dataset.search},''); return; }
    state.query = button.dataset.search; history.replaceState(null,'',hashFor());
    const search = document.getElementById('domain-search'); search.value = state.query; search.focus({preventScroll:true}); updateListing(); return;
  }
  switch(button.dataset.action) {
    case 'home': { const oldCode = state.code; navigate({code:'',view:'browse',query:'',all:false},'card:'+oldCode); break; }
    case 'evidence': showEvidence(); break;
    case 'national-evidence': showEvidence(''); break;
    case 'close': document.getElementById('evidence').close(); break;
    case 'method': showMethod(); break;
    case 'all': navigate({all:true},''); break;
  }
});
document.addEventListener('input',event=>{
  if (event.target.id!=='domain-search') return;
  state.query = event.target.value; history.replaceState(null,'',hashFor()); updateListing();
});
document.addEventListener('change',event=>{
  if (event.target.id!=='sort') return;
  state.sort = event.target.value; history.replaceState(null,'',hashFor()); updateListing(); document.getElementById('sort')?.focus({preventScroll:true});
});
document.addEventListener('keydown',event=>{
  if (event.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !document.getElementById('evidence').open) {
    const search = document.getElementById('domain-search'); if(search){event.preventDefault();search.focus();}
  }
});
document.getElementById('evidence').addEventListener('click',event=>{if(event.target.id==='evidence'){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
window.addEventListener('hashchange',()=>{
  atlasNavigation++;
  readHash();
  if (document.startViewTransition && !reduced()) document.startViewTransition(renderPage);
  else renderPage();
});
readHash();renderPage();
