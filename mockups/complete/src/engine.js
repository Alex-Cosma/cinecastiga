/* The thirteen queries share one explicit applied scope and one evidence set. */
(function () {
  'use strict';
  const D = window.MOCK_DATA;
  const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const intf = new Intl.NumberFormat('ro-RO');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const money = value => nf.format(Number(value) || 0) + ' lei';
  const compact = value => { const n = Number(value) || 0; const a = Math.abs(n); return a >= 1e9 ? new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(n / 1e9) + ' mld. lei' : a >= 1e6 ? new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(n / 1e6) + ' mil. lei' : money(n); };
  const sum = rows => rows.reduce((n, r) => n + Math.round(Number(r.amount) * 100), 0) / 100;
  const unique = rows => [...new Map(rows.map(r => [r.id, r])).values()];
  const names = { '2084803': 'Spitalul Județean Cluj', '2143172': 'Consiliul Județean Cluj', '2146445': 'Primăria Cluj-Napoca', '2146146': 'CNAIR' };
  const name = id => names[id] || D.authorities.find(a => a.id === id)?.name || D.records.find(r => r.supplierId === id)?.supplierName || 'entitatea selectată';
  const kindOf = id => id === '2084803' ? 'spital' : id === '2146445' ? 'oras_municipiu' : id === '2143172' ? 'consiliu_judetean' : 'national';
  const countyName = c => fold(c) === 'bucuresti' ? 'București' : c;
  const kinds = { all: 'autoritățile', spital: 'spitalele', oras_municipiu: 'primăriile', consiliu_judetean: 'consiliile județene', national: 'autoritățile naționale', comuna: 'comunele', scoala: 'școlile' };
  const profileBlocks = ['compare', 'distribution', 'scatter', 'entity_card'];
  const blocks = [
    { id:'table', group:'Bani și achiziții', label:'Cine furnizează cel mai mult?', description:'Un clasament al firmelor, autorităților sau județelor.', icon:'bars' },
    { id:'stat', group:'Bani și achiziții', label:'Care este valoarea achizițiilor?', description:'O sumă verificabilă, până la ultima înregistrare.', icon:'total' },
    { id:'timeseries', group:'Bani și achiziții', label:'Cum s-au schimbat în timp?', description:'Urmărește valoarea sau numărul de achiziții, an cu an.', icon:'time' },
    { id:'map', group:'Bani și achiziții', label:'Unde se fac achizițiile?', description:'Vezi distribuția pe județele autorităților.', icon:'map' },
    { id:'breakdown', group:'Bani și achiziții', label:'Pe ce se duc banii?', description:'Domeniile achizițiilor și ponderea fiecăruia.', icon:'category' },
    { id:'compare', group:'Comparații și schimbări', label:'Cum se compară două instituții?', description:'Două profiluri de achiziții directe, explicate alături.', icon:'compare' },
    { id:'trend', group:'Comparații și schimbări', label:'Cine are cea mai mare schimbare?', description:'Diferența dintre doi ani, cu ambele sume la vedere.', icon:'change' },
    { id:'network', group:'Relații', label:'Cu cine lucrează o instituție sau firmă?', description:'Partenerii de achiziții ai unei entități.', icon:'network' },
    { id:'sankey', group:'Relații', label:'Cum se împart banii între parteneri și domenii?', description:'Urmărește fiecare flux până la achizițiile sale.', icon:'flow' },
    { id:'fact_check', group:'Relații', label:'A cumpărat instituția de la această firmă?', description:'Verifică o relație precisă între cumpărător și furnizor.', icon:'check' },
    { id:'distribution', group:'Repere și semnale', label:'Unde se situează indicele de risc?', description:'Un profil în contextul unei populații definite.', icon:'distribution' },
    { id:'scatter', group:'Repere și semnale', label:'Cum se leagă riscul de volumul achizițiilor?', description:'Pune față în față indicele de risc și numărul de înregistrări.', icon:'scatter' },
    { id:'entity_card', group:'Repere și semnale', label:'Cine are cea mai mare valoare sau cel mai mare indice?', description:'O entitate de urmărit, cu criteriul și populația explicate.', icon:'star' }
  ];
  const defaults = { block:'table', dim:'supplier', dataset:'contracts', authorityKind:'spital', county:'Cluj', yearFrom:2024, yearTo:2026, category:'all', authorityId:null, supplierId:null, compareId:null, rankBy:'value', measure:'value', topN:5, focusRole:'authority' };
  const authorities = D.authorities.map(a => ({ ...a, label:name(a.id), kind:kindOf(a.id) }));
  const suppliers = [...new Map(D.records.map(r => [r.supplierId, { id:r.supplierId, name:r.supplierName, label:r.supplierName }])).values()].sort((a,b) => a.name.localeCompare(b.name, 'ro'));
  const categories = [...new Set(D.records.map(r => r.category))].sort((a,b) => a.localeCompare(b,'ro'));
  const pick = (v, values, fallback) => values.includes(v) ? v : fallback;
  function sanitize(input = {}) {
    const q = { ...defaults, ...input };
    q.block = pick(q.block, blocks.map(b => b.id), defaults.block);
    q.dim = pick(q.dim, ['authority','supplier','county'], 'supplier');
    q.dataset = pick(q.dataset, ['contracts','da','all'], 'contracts');
    q.authorityKind = pick(q.authorityKind, Object.keys(kinds), 'all');
    q.county = fold(q.county) === 'bucuresti' ? 'București' : pick(q.county, ['all','Cluj'], 'all');
    q.yearFrom = Number.isFinite(Number(q.yearFrom)) ? Math.min(2026, Math.max(2018, Math.round(Number(q.yearFrom)))) : 2024;
    q.yearTo = Number.isFinite(Number(q.yearTo)) ? Math.min(2026, Math.max(2018, Math.round(Number(q.yearTo)))) : 2026;
    q.category = pick(q.category, ['all', ...categories], 'all');
    q.authorityId = authorities.some(a => a.id === String(q.authorityId)) ? String(q.authorityId) : null;
    q.supplierId = suppliers.some(s => s.id === String(q.supplierId)) ? String(q.supplierId) : null;
    q.compareId = authorities.some(a => a.id === String(q.compareId)) ? String(q.compareId) : null;
    q.rankBy = pick(q.rankBy, ['value','count','risk'], 'value');
    q.measure = pick(q.measure, ['value','count'], 'value');
    q.topN = pick(Number(q.topN), [5,10,25,50], 5);
    q.focusRole = pick(q.focusRole, ['authority','supplier'], 'authority');
    return Object.fromEntries(Object.keys(defaults).map(k => [k, q[k]]));
  }
  function validate(input) {
    const q = sanitize(input), errors = [];
    if (q.yearFrom > q.yearTo && !profileBlocks.includes(q.block)) errors.push('Anul de început trebuie să fie înaintea anului de sfârșit.');
    if (q.block === 'trend' && q.yearFrom === q.yearTo) errors.push('Alege doi ani diferiți pentru a calcula schimbarea.');
    if (['network','sankey'].includes(q.block) && !(q.focusRole === 'supplier' ? q.supplierId : q.authorityId)) errors.push('Alege entitatea ale cărei relații vrei să le vezi.');
    if (q.block === 'fact_check' && (!q.authorityId || !q.supplierId)) errors.push('Alege atât autoritatea, cât și firma.');
    if (q.block === 'compare' && (!q.authorityId || !q.compareId)) errors.push('Alege două autorități pentru comparație.');
    if (q.block === 'compare' && q.authorityId && q.authorityId === q.compareId) errors.push('Alege două autorități diferite.');
    if (q.block === 'distribution' && !q.authorityId) errors.push('Alege autoritatea al cărei indice vrei să îl vezi.');
    if (profileBlocks.includes(q.block) && q.focusRole !== 'authority') errors.push('Acest extras conține profiluri doar pentru autorități.');
    if (q.block === 'map' && q.county !== 'all') errors.push('Harta compară județe: elimină condiția de județ înainte de aplicare.');
    return errors;
  }
  function transition(input, block) {
    const before = sanitize(input), q = { ...before, block }, changes = [];
    if (!blocks.some(b => b.id === block)) return {query:before, changes:['Tipul întrebării nu există.']};
    const set = (key, val, why) => { if (q[key] !== val) { q[key] = val; if (why && !changes.includes(why)) changes.push(why); } };
    if (['breakdown','trend','network','sankey','fact_check'].includes(block)) set('measure','value','Această întrebare calculează valorile în lei; numărul de înregistrări rămâne disponibil în surse.');
    if (block === 'map') { set('county','all','Harta extinde selecția la toate județele din extras.'); set('authorityId',null,'Harta elimină selecția unei singure autorități.'); set('authorityKind','all','Harta include toate tipurile de autorități din extras.'); }
    if (block === 'trend') { if(q.yearFrom===q.yearTo) set('yearFrom',Math.max(2018,q.yearTo-1),'Schimbarea compară doi ani diferiți.'); set('dim','authority','Schimbarea este grupată pe autorități.'); set('authorityKind','all','Comparația între ani include toate tipurile de autorități din extras.'); set('authorityId',null,'Se compară autoritățile din selecție.'); }
    if (['network','sankey'].includes(block)) {
      if (q.focusRole === 'supplier') { set('supplierId',q.supplierId || '2161704','Am pregătit o firmă din extras; o poți schimba.'); set('authorityId',null,'Relațiile firmei includ toți cumpărătorii din condițiile rămase.'); }
      else { set('authorityId',q.authorityId || '2084803','Am pregătit Spitalul Județean Cluj; îl poți schimba.'); set('supplierId',null,'Relațiile autorității includ toți furnizorii din condițiile rămase.'); }
    }
    if (block === 'fact_check') { set('authorityId',q.authorityId || '2084803','Am pregătit autoritatea pentru verificare.'); const r = D.records.find(r => r.authorityId === q.authorityId && (q.dataset === 'all' || r.source === (q.dataset === 'da' ? 'da' : 'contract'))); set('supplierId',q.supplierId || r?.supplierId || suppliers[0].id,'Am pregătit un furnizor real al acestei autorități; îl poți schimba.'); }
    if (profileBlocks.includes(block)) {
      set('dataset','da','Profilurile folosesc achiziții directe, inclusiv oferte neacceptate.');
      set('yearFrom',2020,'Perioada profilurilor este întregul extras 2020–2026; condiția de perioadă nu se aplică.');
      set('yearTo',2026,'Perioada profilurilor este întregul extras 2020–2026; condiția de perioadă nu se aplică.');
      set('category','all','Profilurile acoperă toate domeniile; condiția de domeniu nu se aplică.');
      set('supplierId',null,'Profilurile nu folosesc condiția de furnizor.'); set('focusRole','authority','Extrasul de profiluri conține patru autorități.');
      if (['compare','distribution'].includes(block)) set('authorityId',q.authorityId || '2084803','Am pregătit profilul Spitalului Județean Cluj; îl poți schimba.');
      if (block === 'compare') { set('compareId',q.compareId && q.compareId!==q.authorityId ? q.compareId : authorities.find(a => a.id !== q.authorityId && a.id==='2146445')?.id || authorities.find(a => a.id!==q.authorityId).id,'Am pregătit a doua autoritate pentru comparație.'); set('county','all','Comparația folosește profilurile celor două autorități, indiferent de județ.'); set('authorityKind','all','Comparația folosește profilurile selectate, indiferent de tip.'); }
      else { set('authorityKind','all','Populația inițială include toate tipurile de autorități din extras; o poți restrânge.'); set('county','all','Populația inițială include toate cele patru autorități din extras; o poți restrânge.'); }
      if (['scatter','entity_card'].includes(block)) set('authorityId',null,'Reperul se calculează pentru populație, fără o singură autoritate selectată.');
      if (block === 'entity_card') set('rankBy','value','Criteriul inițial este valoarea înregistrată în profil; poți alege indicele de risc.');
    } else if (profileBlocks.includes(before.block)) {
      set('yearFrom',2024,'Întrebarea revine la înregistrările selectate din 2024–2026.');
      set('dataset','all','Întrebarea folosește contractele și achizițiile directe din eșantion.');
    }
    return { query:sanitize(q), changes };
  }
  function scope(q) {
    return [q.authorityId ? name(q.authorityId) : kinds[q.authorityKind], q.county === 'all' ? 'toate județele din extras' : countyName(q.county), q.yearFrom === q.yearTo ? q.yearFrom : `${q.yearFrom}–${q.yearTo}`, {contracts:'contracte din proceduri',da:'achiziții directe',all:'contracte și achiziții directe'}[q.dataset], q.category !== 'all' ? q.category : null, q.supplierId ? name(q.supplierId) : null].filter(Boolean).join(' · ');
  }
  function describe(input) {
    const q = sanitize(input), who = q.authorityId ? name(q.authorityId) : kinds[q.authorityKind];
    const where = q.county === 'all' ? 'din extras' : `din ${countyName(q.county)}`;
    const years = q.yearFrom === q.yearTo ? q.yearFrom : `${q.yearFrom}–${q.yearTo}`;
    return ({
      table:`Cine ${q.dim==='supplier'?'furnizează':'înregistrează'} cel mai mult pentru ${who} ${where}, în ${years}?`,
      stat:`Care este ${q.measure==='count'?'numărul':'valoarea'} achizițiilor pentru ${who} ${where}, în ${years}?`,
      timeseries:`Cum au evoluat achizițiile pentru ${who} ${where}, în ${years}?`,
      map:`Cum se distribuie achizițiile pe județe, în ${years}?`,
      breakdown:`Ce cumpără ${who} ${where}, în ${years}?`,
      trend:`Cine are cea mai mare schimbare între ${q.yearFrom} și ${q.yearTo}?`,
      network:`Cu cine lucrează ${name(q.focusRole==='supplier'?q.supplierId:q.authorityId)}?`,
      sankey:`Cum se împart achizițiile ${name(q.focusRole==='supplier'?q.supplierId:q.authorityId)} între parteneri și domenii?`,
      fact_check:`A cumpărat ${name(q.authorityId)} de la ${name(q.supplierId)}, în ${years}?`,
      compare:`Cum se compară profilurile ${name(q.authorityId)} și ${name(q.compareId)}?`,
      distribution:`Unde se situează indicele de risc al ${name(q.authorityId)}?`,
      scatter:'Cum se leagă indicele de risc de numărul de achiziții directe?',
      entity_card:`Cine are ${q.rankBy==='risk'?'cel mai mare indice de risc':q.rankBy==='count'?'cele mai multe înregistrări':'cea mai mare valoare înregistrată'} în populația selectată?`
    })[q.block];
  }
  function groupRows(rows, getId, getLabel, prefix) {
    const map = new Map();
    for (const r of rows) { const id=String(getId(r)); if(!map.has(id))map.set(id,{key:prefix+':'+id,id,label:getLabel(r),rows:[]}); map.get(id).rows.push(r); }
    return [...map.values()].map(g => ({...g, amount:sum(g.rows), count:g.rows.length}));
  }
  function filterRows(q) {
    return D.records.filter(r => {
      const y=Number(r.date.slice(0,4));
      if(q.block==='trend' ? y!==q.yearFrom&&y!==q.yearTo : y<q.yearFrom||y>q.yearTo)return false;
      if(q.dataset!=='all'&&r.source!==(q.dataset==='contracts'?'contract':'da'))return false;
      if(q.county!=='all'&&fold(r.county)!==fold(q.county))return false;
      if(q.authorityKind!=='all'&&kindOf(r.authorityId)!==q.authorityKind)return false;
      if(q.category!=='all'&&r.category!==q.category)return false;
      if(q.authorityId&&r.authorityId!==q.authorityId)return false;
      if(q.supplierId&&r.supplierId!==q.supplierId)return false;
      return true;
    });
  }
  function profileRun(q) {
    const P=window.COMPLETE_PROFILES || {meta:{},entities:[]};
    let cohort=P.entities.filter(p=>p.role==='authority'&&p.nDas>=(q.block==='entity_card'?20:10));
    if(q.block==='compare')cohort=cohort.filter(p=>[q.authorityId,q.compareId].includes(String(p.id)));
    else cohort=cohort.filter(p=>(q.county==='all'||fold(p.county)===fold(q.county))&&(q.authorityKind==='all'||kindOf(String(p.id))===q.authorityKind));
    const groups=[];
    for(const p of cohort) {
      const rows=p.records||[], amount=sum(rows);
      const reconciles=rows.length===Number(p.nDas)&&Math.abs(amount-Number(p.totalRon))<.011;
      const g={key:'profile:'+p.id,id:String(p.id),label:name(String(p.id)),amount,count:rows.length,rows,profile:p,calculation:p.calculation,extra:{profile:p,provenance:P.meta,reconciles,publishedAmount:Number(p.totalRon),publishedCount:Number(p.nDas),cri:Number(p.cri),note:'Valoare înregistrată în profil. Include oferte neacceptate; nu reprezintă plăți sau exclusiv achiziții atribuite.'}};
      groups.push(g);
      if(p.splitExample?.recordIds?.length) {
        const ids=new Set(p.splitExample.recordIds.map(String)), r=rows.filter(r=>ids.has(String(r.id))||ids.has(String(r.id).replace(/^da-/,'')));
        groups.push({key:'split:'+p.id,id:'split:'+p.id,label:'Exemplul indicatorului de fragmentare · '+name(String(p.id)),amount:sum(r),count:r.length,rows:r,calculation:p.splitExample.calculation||p.splitExample.explanation||p.calculation,extra:{splitExample:p.splitExample,profile:p,provenance:P.meta,note:'Acest grup documentează un exemplu al indicatorului de fragmentare; nu este întregul profil.'}});
      }
    }
    const profileGroups=groups.filter(g=>g.key.startsWith('profile:'));
    const rows=unique(profileGroups.flatMap(g=>g.rows));
    const bins=[0,1,2,3,4].map(index=>{const selected=profileGroups.filter(g=>Math.min(4,Math.floor(Number(g.profile.cri)*5+1e-8))===index),binRows=selected.flatMap(g=>g.rows);return {key:'riskbin:'+index,id:String(index),label:'Indice de risc '+['0–0,19','0,20–0,39','0,40–0,59','0,60–0,79','0,80–1'][index],amount:sum(binRows),count:binRows.length,rows:binRows,extra:{profiles:selected.map(g=>g.profile),entityCount:selected.length,provenance:P.meta,note:'Înregistrările profilurilor din acest interval al indicelui de risc.'}};});
    if(q.block==='distribution')groups.push(...bins.filter(g=>g.count));
    const criterion=p=>q.rankBy==='risk'?Number(p.cri):q.rankBy==='count'?Number(p.nDas):Number(p.totalRon);
    const sorted=[...profileGroups].sort((a,b)=>criterion(b.profile)-criterion(a.profile));
    const best=sorted[0]?criterion(sorted[0].profile):null;
    const winners=sorted.filter(g=>criterion(g.profile)===best);
    const focus=profileGroups.find(g=>g.id===q.authorityId);
    const minCri=cohort.length?Math.min(...cohort.map(p=>Number(p.cri))):null,maxCri=cohort.length?Math.max(...cohort.map(p=>Number(p.cri))):null;
    return {block:q.block,query:q,title:describe(q),scopeLabel:`Profiluri de achiziții directe · 2020–2026 · ${cohort.length} autorități din extras`,scopeNote:'Populație restrânsă la cele patru autorități extrase din baza proiectului; nu este un reper național. Valorile profilurilor includ oferte neacceptate. Perioada și domeniul din întrebările pe contracte nu filtrează aceste profiluri.',rows,groups,total:sum(rows),count:rows.length,extra:{profile:true,provenance:P.meta,cohort,profiles:cohort,profileGroups,bins,focus,winners,best,minCri,maxCri,criterion:q.rankBy,unavailable:cohort.length===0,allEqual:cohort.length>1&&minCri===maxCri,reconciles:profileGroups.every(g=>g.extra.reconciles),note:'Indicele afișat este cel publicat în profil: un semnal statistic, nu o constatare de ilegalitate. În aceste patru profiluri, 1 dintre 5 indicatori este activ: 1 ÷ 5 = 0,20. Deschide exemplul indicatorului pentru înregistrările aferente.'}};
  }
  function run(input) {
    const q=sanitize(input);
    if(profileBlocks.includes(q.block))return profileRun(q);
    const rows=filterRows(q), total=sum(rows), count=rows.length;
    let groups=[],extra={};
    const dim=q.dim==='authority'?r=>r.authorityId:q.dim==='county'?r=>countyName(r.county):r=>r.supplierId;
    const dimLabel=q.dim==='authority'?r=>name(r.authorityId):q.dim==='county'?r=>countyName(r.county):r=>r.supplierName;
    const sort=gs=>gs.sort((a,b)=>(q.measure==='count'?b.count-a.count:b.amount-a.amount)||a.label.localeCompare(b.label,'ro'));
    if(q.block==='table')groups=sort(groupRows(rows,dim,dimLabel,'rank'));
    if(q.block==='stat')groups=groupRows(rows,r=>r.source,r=>r.source==='contract'?'Contracte din proceduri':'Achiziții directe','source');
    if(q.block==='timeseries')groups=groupRows(rows,r=>r.date.slice(0,4),r=>r.date.slice(0,4),'year').sort((a,b)=>a.id.localeCompare(b.id));
    if(q.block==='map')groups=sort(groupRows(rows,r=>countyName(r.county),r=>countyName(r.county),'county'));
    if(q.block==='breakdown')groups=groupRows(rows,r=>r.category,r=>r.category,'category').sort((a,b)=>b.amount-a.amount).map(g=>({...g,extra:{numerator:g.amount,denominator:total,percentage:total?g.amount/total*100:0,calculation:`${money(g.amount)} ÷ ${money(total)} × 100 = ${new Intl.NumberFormat('ro-RO',{maximumFractionDigits:2}).format(total?g.amount/total*100:0)}%. Numitorul cuprinde toate cele ${count} înregistrări ale selecției.`}}));
    if(q.block==='trend') {
      const entities=groupRows(rows,dim,dimLabel,'change').map(g=>{const fromRows=g.rows.filter(r=>Number(r.date.slice(0,4))===q.yearFrom),toRows=g.rows.filter(r=>Number(r.date.slice(0,4))===q.yearTo),fromAmount=sum(fromRows),toAmount=sum(toRows),difference=Math.round((toAmount-fromAmount)*100)/100;return {...g,extra:{fromYear:q.yearFrom,toYear:q.yearTo,fromAmount,toAmount,difference,fromRows,toRows,calculation:`${q.yearTo}: ${money(toAmount)} − ${q.yearFrom}: ${money(fromAmount)} = ${money(difference)}. Doar cei doi ani de referință intră în calcul; absența din extras nu înseamnă lipsa activității reale.`}};}).sort((a,b)=>Math.abs(b.extra.difference)-Math.abs(a.extra.difference));
      groups=[...entities,...groupRows(rows,r=>r.date.slice(0,4),r=>r.date.slice(0,4),'endpoint')];
      extra.entities=entities;extra.fromAmount=sum(rows.filter(r=>Number(r.date.slice(0,4))===q.yearFrom));extra.toAmount=sum(rows.filter(r=>Number(r.date.slice(0,4))===q.yearTo));extra.difference=Math.round((extra.toAmount-extra.fromAmount)*100)/100;
    }
    if(['network','sankey'].includes(q.block)) {
      const supplier=q.focusRole==='supplier';
      const partners=groupRows(rows,supplier?r=>r.authorityId:r=>r.supplierId,supplier?r=>name(r.authorityId):r=>r.supplierName,'partner').sort((a,b)=>b.amount-a.amount);
      groups=partners;extra.partners=partners;extra.focus=name(supplier?q.supplierId:q.authorityId);
      if(q.block==='sankey') {const flows=groupRows(rows,r=>(supplier?r.authorityId:r.supplierId)+'|'+r.category,r=>(supplier?name(r.authorityId):r.supplierName)+' → '+r.category,'flow').map(g=>({...g,extra:{partner:g.label.split(' → ')[0],category:g.rows[0].category}})).sort((a,b)=>b.amount-a.amount);groups=[...partners,...flows,...groupRows(rows,r=>r.category,r=>r.category,'flowcategory')];extra.flows=flows;}
    }
    if(q.block==='fact_check') {groups=groupRows(rows,r=>r.date.slice(0,4),r=>r.date.slice(0,4),'factyear').sort((a,b)=>b.id.localeCompare(a.id));extra.found=count>0;extra.buyer=name(q.authorityId);extra.supplier=name(q.supplierId);}
    return {block:q.block,query:q,title:describe(q),scopeLabel:scope(q),scopeNote:'Eșantion autentic de 48 de înregistrări din patru autorități. Selecția nu reprezintă totalul activității lor. Valorile înregistrate nu sunt dovezi ale plăților. Județul indică sediul cumpărătorului.',rows,groups,total,count,extra};
  }
  window.CQ={blocks,defaults,sanitize,validate,transition,run,describe,formatMoney:money,formatCompact:compact,formatCount:n=>intf.format(n),escape:esc,profileBlocks,authorities,suppliers,categories,kinds,name,kindOf,scope,fold,sum};
})();
