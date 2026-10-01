const screen = document.querySelector('#screen');
const amounts = [52000, 48000, 46000, 44000, 42000, 40000, 38000, 37000, 36000, 34000, 33000, 30000];
const savedRows = amounts.map((value, i) => ({ id: `DEMO-${String(i + 1).padStart(3, '0')}`, title: ['Întreținere spații verzi', 'Lucrări de întreținere parcuri', 'Îngrijire zone verzi'][i % 3], date: `${String(i + 1).padStart(2, '0')}.06.2025`, value }));
const currentRows = [...savedRows, { id: 'DEMO-013', title: 'Întreținere spații verzi', date: '13.06.2025', value: 22000 }, { id: 'DEMO-014', title: 'Îngrijire zone verzi', date: '14.06.2025', value: 18000 }];
const money = value => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const icons = {
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></svg>',
};
let page = 0, source = '', timer, toastTimer, busy = false;
const mode = () => location.hash === '#referinta' ? 'saved' : location.hash === '#actual' ? 'current' : 'signal';
const rows = () => mode() === 'current' ? currentRows : savedRows;

function announce(text) {
  clearTimeout(toastTimer);
  document.querySelector('#status').textContent = text;
  toastTimer = setTimeout(() => document.querySelector('#status').textContent = '', 5000);
}

function render() {
  const state = mode(), saved = state === 'saved', current = state === 'current';
  const guest = document.querySelector('#visitor').value === 'guest';
  const total = rows().reduce((sum, r) => sum + r.value, 0);
  screen.innerHTML = `
    <a class="back" href="${saved ? '#semnal' : '#referinta'}">${saved ? '← Înapoi la semnal' : 'Deschide versiunea păstrată →'}</a>
    <h1 tabindex="-1">Posibilă fracționare sub prag</h1>
    <p class="parties">Primăria Valea Clară <span>către</span> Servicii Verzi Demo SRL</p>
    ${saved ? '<div class="version"><div><strong>Versiune păstrată · 1 octombrie 2026</strong><br>Aceste cifre rămân cele citate.</div><a href="#actual">Vezi situația actuală →</a></div>' : current ? '<div class="version"><div><strong>Situație actualizată · 8 octombrie 2026</strong><br>Două înregistrări în plus în acest exemplu.</div><a href="#referinta">Înapoi la cifrele citate →</a></div>' : '<p class="reference-note">Datele calculului din 1 octombrie 2026 · pot fi actualizate.</p>'}
    <div class="facts"><div><strong>${money(total)} lei</strong><small>valoare înregistrată · nu plăți</small></div><div><strong>${rows().length}</strong><small>achiziții directe</small></div><div class="period">Iunie 2025<small>perioada achizițiilor</small></div></div>
    <p class="explanation">Achiziții către același furnizor, în aceeași clasă CPV. Fiecare este sub prag; împreună îl depășesc.</p>
    <div class="actions">${saved ? `<button class="primary" id="copy">${icons.copy}Copiază citarea</button><button id="export">${icons.download}Descarcă sursele</button>` : current ? '<a class="button primary" href="#referinta">Revino la versiunea citată</a><button id="jump">Vezi cele 14 surse</button>' : `<button class="primary" id="jump">Vezi cele 12 surse</button><button id="preserve" ${guest ? 'disabled aria-describedby="account-note"' : ''}>${icons.save}Păstrează pentru citare</button>${guest ? '<span id="account-note" class="account-note">Ai nevoie de cont pentru a crea o referință.</span>' : ''}`}</div>
    <div id="confirmation" class="confirmation" hidden></div>
    <textarea id="copy-fallback" class="copy-fallback" aria-label="Citare pentru copiere manuală" readonly hidden></textarea>
    <details class="details"><summary>${saved ? 'Ce s-a păstrat în această referință?' : 'Ce merită verificat?'}</summary>
      <p>${saved ? 'Observația, valorile, cele 12 înregistrări și criteriul de calcul, în forma de la 1 octombrie. Referința nu se actualizează odată cu semnalul.' : 'Verifică dacă achizițiile răspund unui necesar comun și de ce au fost făcute separat. Această grupare nu stabilește singură o încălcare a legii.'}</p>
      <p>Clasă CPV: 7731 · servicii pentru spații verzi. Prag folosit în exemplu: 270.120 lei, fără TVA. Date și metodă ilustrative, fără valoare de constatare.</p>
    </details>
    <section class="sources" id="sources" tabindex="-1"><div class="source-heading"><div><h2>${saved ? 'Sursele cifrelor citate' : 'Înregistrările sursă'}</h2><p>${saved ? 'Păstrate împreună cu referința.' : 'Fiecare rând face parte din calcul.'}</p></div><span class="count">${rows().length} înregistrări</span></div><div id="source-list"></div></section>
  `;
  renderRows();
}

function renderRows() {
  const records = rows(), subset = records.slice(page * 10, (page + 1) * 10);
  document.querySelector('#source-list').innerHTML = `<table><thead><tr><th scope="col">Achiziție / sursă</th><th class="date-col" scope="col">Data</th><th class="num" scope="col">Valoare · lei</th></tr></thead><tbody>${subset.map(r => `<tr><td><button class="source-button" data-source="${r.id}" aria-expanded="${source === r.id}" aria-controls="detail-${r.id}">${r.title}</button><span class="source-code">${r.id}</span></td><td class="date-col">${r.date}</td><td class="num">${money(r.value)}</td></tr><tr class="source-extra" id="detail-${r.id}" ${source !== r.id ? 'hidden' : ''}><td colspan="3">Înregistrare fictivă · ${r.date} · CPV 77310000-6.<br>În aplicație, aici vei putea deschide înregistrarea păstrată și linkul oficial SEAP. Acest exemplu nu are un document oficial.</td></tr>`).join('')}</tbody></table>
    <div class="pager"><span>${page * 10 + 1}–${Math.min((page + 1) * 10, records.length)} din ${records.length}</span><div><button data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>Înapoi</button><button data-page="${page + 1}" ${(page + 1) * 10 >= records.length ? 'disabled' : ''}>Următoarele</button></div></div>
    <p class="reconcile">Totalul celor ${records.length} înregistrări: <strong>${money(records.reduce((sum, r) => sum + r.value, 0))} lei</strong>.</p>`;
}

function confirmation(error = false) {
  const box = document.querySelector('#confirmation'); box.hidden = false;
  box.innerHTML = `<h3>${error ? 'Referința nu a putut fi creată' : 'Păstrezi o referință publică'}</h3><p>${error ? 'Eroare simulată. Datele semnalului sunt în continuare disponibile.' : 'Oricine are linkul va putea vedea aceste cifre și sursele lor. Nu includem numele tău sau conținutul anchetelor private.'}</p><div class="actions"><button class="primary" id="create">${error ? 'Reîncearcă' : 'Creează referința'}</button><button id="cancel">Renunță</button></div>`;
  document.querySelector('#create').focus();
}

function create() {
  if (busy || document.querySelector('#visitor').value !== 'account') return;
  busy = true;
  document.querySelector('#confirmation').innerHTML = '<p role="status">Se păstrează observația și cele 12 surse…</p><progress aria-label="Se creează referința"></progress>';
  document.querySelector('#preserve').disabled = true;
  timer = setTimeout(() => {
    busy = false;
    if (document.querySelector('#outcome').value === 'error') { document.querySelector('#preserve').disabled = false; confirmation(true); }
    else { location.hash = 'referinta'; announce('Referință creată în mockup. Poți copia citarea.'); }
  }, 900);
}

function citation() {
  const url = new URL(location.href); url.hash = 'referinta';
  return `EXEMPLU FICTIV — „Posibilă fracționare sub prag: Primăria Valea Clară / Servicii Verzi Demo SRL”, iunie 2025, 12 achiziții, 480.000,00 lei — cinecâștigă?, versiune demonstrativă păstrată la 1 octombrie 2026. ${url.href}`;
}

screen.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.id === 'preserve') confirmation();
  if (button.id === 'cancel') { document.querySelector('#confirmation').hidden = true; document.querySelector('#preserve').focus(); }
  if (button.id === 'create') create();
  if (button.id === 'jump') { document.querySelector('#sources').scrollIntoView({ behavior: 'instant' }); document.querySelector('#sources').focus({ preventScroll: true }); }
  if (button.dataset.page !== undefined) { page = Number(button.dataset.page); source = ''; renderRows(); document.querySelector('#sources').focus({ preventScroll: true }); }
  if (button.dataset.source) { const id = button.dataset.source; source = source === id ? '' : id; renderRows(); document.querySelector(`[data-source="${id}"]`).focus({ preventScroll: true }); }
  if (button.id === 'copy') {
    try { await navigator.clipboard.writeText(citation()); announce('Citarea demonstrativă a fost copiată.'); }
    catch { const field = document.querySelector('#copy-fallback'); field.hidden = false; field.value = citation(); field.focus(); field.select(); announce('Selectează și copiază citarea de mai jos.'); }
  }
  if (button.id === 'export') {
    const csv = '\uFEFFdate_fictive,cod,titlu,data,valoare_lei\n' + savedRows.map(r => `da,${r.id},${r.title},${r.date},${r.value.toFixed(2)}`).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'EXEMPLU-FICTIV-referinta-12-surse.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('CSV-ul demonstrativ conține toate cele 12 surse.');
  }
});
window.addEventListener('hashchange', () => { clearTimeout(timer); busy = false; page = 0; source = ''; render(); screen.querySelector('h1').focus({ preventScroll: true }); window.scrollTo(0, 0); });
document.querySelector('#visitor').addEventListener('change', () => { clearTimeout(timer); busy = false; render(); });
document.querySelector('#reset').addEventListener('click', () => { clearTimeout(timer); busy = false; page = 0; source = ''; if (location.hash === '#semnal') render(); else location.hash = 'semnal'; window.scrollTo(0, 0); });
document.querySelector('#theme').addEventListener('click', () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; });
render();
