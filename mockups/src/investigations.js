/* Standalone prototype investigation notebook. Production accounts are not used. */
(function () {
  'use strict';

  const KEY = 'cinecastiga-prototype-investigations-v1';
  let state = { version: 1, selected: null, dossiers: [] };
  let initialized = false;
  let storageAvailable = true;
  let storageWarningShown = false;
  let pendingItem = null;

  const esc = (value) => window.UI.escape(String(value ?? ''));
  const now = () => new Date().toISOString();
  const uid = () => 'inv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  const date = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const current = () => state.dossiers.find((dossier) => dossier.id === state.selected);
  const rerender = (focus = false) => {
    window.UI.rerender();
    if (focus) requestAnimationFrame(() => document.getElementById('view')?.focus({ preventScroll: true }));
  };
  const toast = (message) => window.UI.toast(message);
  const icon = (name) => {
    const paths = {
      plus: '<path d="M12 5v14M5 12h14"/>',
      arrow: '<path d="m8 5 7 7-7 7M15 12H3"/>',
      back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
      document: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
      download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
      external: '<path d="M14 3h7v7M21 3l-11 11M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
      note: '<path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M9 15l1-5L19 1l4 4-9 9z"/>',
      remove: '<path d="m7 7 10 10M7 17 17 7"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    };
    return '<svg class="inv-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.document) + '</svg>';
  };

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch (_) { return ''; }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageAvailable = true;
      return true;
    } catch (_) {
      storageAvailable = false;
      if (!storageWarningShown) {
        storageWarningShown = true;
        toast('Browserul nu permite salvarea. Poți păstra dosarul prin export.');
      }
      return false;
    }
  }

  function normalizeSaved(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.dossiers)) return null;
    return {
      version: 1,
      selected: typeof raw.selected === 'string' ? raw.selected : null,
      dossiers: raw.dossiers.filter((d) => d && typeof d.id === 'string' && typeof d.title === 'string').map((d) => ({
        id: d.id,
        title: d.title.slice(0, 160),
        description: String(d.description || '').slice(0, 500),
        createdAt: typeof d.createdAt === 'string' ? d.createdAt : now(),
        updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : now(),
        evidence: Array.isArray(d.evidence) ? d.evidence.filter((item) => item && typeof item.id === 'string' && item.snapshot && typeof item.snapshot === 'object').map((item) => ({ ...item, title: String(item.title || 'Sursă salvată'), capturedAt: item.capturedAt || now() })) : [],
        notes: Array.isArray(d.notes) ? d.notes.filter((note) => note && typeof note.id === 'string').map((note) => ({ ...note, text: String(note.text || '') })) : [],
      })),
    };
  }

  function storageNote() {
    return '<p class="inv-storage-note">' + icon('document') + '<span>' + (storageAvailable
      ? 'Dosarele sunt salvate doar în acest browser. Exportă o copie ca să le păstrezi și în altă parte.'
      : 'Stocarea în browser nu este disponibilă. Dosarele rămân doar în această sesiune; exportă o copie.') + '</span></p>';
  }

  function folderArt(small) {
    return '<div class="inv-folder-art' + (small ? ' inv-folder-small' : '') + '" aria-hidden="true"><div class="inv-paper inv-paper-back"><i></i><i></i><i></i></div><div class="inv-paper inv-paper-front"><span></span><i></i><i></i></div><div class="inv-folder-tab"></div><div class="inv-folder-face"><span>o întrebare bună</span><b>este un început.</b><div class="inv-folder-mark">?</div></div></div>';
  }

  function renderOverview() {
    const list = state.dossiers.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return '<section class="inv-page"><div class="inv-heading"><div><p class="eyebrow">SPAȚIUL TĂU DE INVESTIGAȚIE</p><h1 class="page-heading">Anchetele tale<span class="inv-heading-dot">.</span></h1><p class="inv-intro">O întrebare azi. O imagine mai clară mâine.</p></div><button class="button primary" data-action="inv-new">' + icon('plus') + ' Anchetă nouă</button></div>' + storageNote() +
      (list.length ? '<div class="inv-folder-grid">' + list.map((d, index) => '<button class="inv-dossier-card" data-action="inv-open" data-id="' + esc(d.id) + '"><div class="inv-card-top"><span class="inv-folder-glyph">' + folderArt(true) + '</span><span class="inv-card-number">' + String(index + 1).padStart(2, '0') + '</span></div><h2>' + esc(d.title) + '</h2><p>' + esc(d.description || 'Un dosar deschis. Urmărește firul, sursă cu sursă.') + '</p><div class="inv-card-bottom"><span>' + d.evidence.length + ' ' + (d.evidence.length === 1 ? 'sursă' : 'surse') + ' · ' + d.notes.length + ' ' + (d.notes.length === 1 ? 'notă' : 'note') + '</span>' + icon('arrow') + '</div><span class="inv-card-date">Actualizată ' + esc(date(d.updatedAt)) + '</span></button>').join('') + '<button class="inv-dossier-card inv-new-card" data-action="inv-new"><span class="inv-new-circle">' + icon('plus') + '</span><h2>O nouă întrebare</h2><p>Începe un dosar pentru ce vrei să afli.</p></button></div>'
        : '<div class="inv-empty"><div class="inv-empty-visual">' + folderArt(false) + '<span class="inv-art-caption">Curiozitate. Context. Surse.</span></div><div class="inv-empty-copy"><p class="eyebrow">DE AICI ÎNCEPE FIRUL</p><h2>Ai observat ceva?<br>Dă-i un loc.</h2><p>Adună contracte și instituții, notează ce vrei să verifici și păstrează sursele la îndemână. Pas cu pas, descoperirile capătă sens.</p><button class="button primary" data-action="inv-new">Creează prima anchetă ' + icon('arrow') + '</button><div class="inv-empty-steps"><span><b>01</b> Pune o întrebare</span><span><b>02</b> Adună sursele</span><span><b>03</b> Leagă informațiile</span></div></div></div>') + '</section>';
  }

  function formatAmount(value) {
    const n = Number(value);
    return Number.isFinite(n) && value !== null && value !== undefined && value !== '' ? new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(n) + ' lei' : '';
  }

  function renderEvidence(item) {
    const sourceUrl = safeUrl(item.snapshot.sourceUrl);
    const isEntity = ['entity', 'authority', 'supplier'].includes(item.type);
    const kind = isEntity ? 'Instituție / firmă' : item.type === 'da' ? 'Achiziție directă' : 'Contract';
    const amount = formatAmount(item.snapshot.amount);
    const records = isEntity && Array.isArray(item.snapshot.records) ? item.snapshot.records.filter((record) => record && typeof record === 'object') : [];
    const entitySources = isEntity ? (records.length ? '<details class="inv-record-sources"><summary>' + (records.length === 1 ? 'Sursa înregistrării salvate' : 'Sursele celor ' + records.length + ' înregistrări') + '</summary><p>Înregistrările păstrate la salvare, din care provine suma de mai sus.</p><ol class="inv-captured-records">' + records.map((record) => {
      const url = safeUrl(record.sourceUrl);
      const title = String(record.title || record.cpvName || record.code || 'Înregistrare salvată');
      const meta = [record.code, record.supplierName, record.date ? date(record.date) : ''].filter(Boolean).map(esc).join(' · ');
      return '<li><div>' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + ' ' + icon('external') + '</a>' : '<span>' + esc(title) + '</span>') + (meta ? '<small>' + meta + '</small>' : '') + (!url ? '<small>Linkul original nu este inclus în acest instantaneu.</small>' : '') + '</div><strong>' + esc(formatAmount(record.amount)) + '</strong></li>';
    }).join('') + '</ol></details>' : '<p class="inv-source-note">Acest instantaneu nu conține lista înregistrărilor. Detaliile disponibile sunt păstrate în export.</p>') : '';
    return '<article class="inv-evidence"><div class="inv-evidence-icon">' + icon('document') + '</div><div class="inv-evidence-content"><div class="inv-evidence-top"><span class="inv-type">' + kind + '</span><button class="inv-remove text-button" data-action="inv-remove-evidence" data-id="' + esc(item.id) + '" aria-label="Elimină sursa: ' + esc(item.title) + '">' + icon('remove') + '</button></div><h3>' + esc(item.title) + '</h3>' + (item.snapshot.subtitle ? '<p>' + esc(item.snapshot.subtitle) + '</p>' : '') + '<div class="inv-evidence-meta">' + (amount ? '<strong>' + esc(amount) + '</strong>' : '') + '<span>Salvată ' + esc(date(item.capturedAt)) + '</span>' + (!isEntity ? (sourceUrl ? '<a class="inv-source" href="' + esc(sourceUrl) + '" target="_blank" rel="noopener noreferrer">Sursa originală ' + icon('external') + '</a>' : '<span class="inv-source-note">Referințele disponibile sunt incluse în export</span>') : '') + '</div>' + (item.snapshot.scope ? '<p class="inv-evidence-scope">' + esc(item.snapshot.scope) + '</p>' : '') + entitySources + '</div></article>';
  }

  function renderDossier(d) {
    return '<section class="inv-page"><button class="text-button inv-back" data-action="inv-back">' + icon('back') + ' Toate anchetele</button><div class="inv-heading inv-dossier-heading"><div><p class="eyebrow">DOSAR DE INVESTIGAȚIE · ' + esc(date(d.createdAt)) + '</p><h1 class="page-heading">' + esc(d.title) + '</h1>' + (d.description ? '<p class="inv-intro">' + esc(d.description) + '</p>' : '') + '</div><div class="inv-heading-actions"><button class="button secondary" data-action="inv-edit">Editează titlul</button><button class="button primary" data-action="inv-export">' + icon('download') + ' Exportă dosarul</button></div></div>' + storageNote() + '<div class="inv-workspace"><div class="inv-evidence-column"><div class="inv-section-head"><h2 class="section-heading">Surse adunate <span>' + d.evidence.length + '</span></h2><button class="text-button" data-action="inv-explore">Caută o sursă ' + icon('arrow') + '</button></div>' + (d.evidence.length ? '<div class="inv-evidence-list">' + d.evidence.map(renderEvidence).join('') + '</div>' : '<div class="inv-evidence-empty"><span class="inv-empty-file">' + icon('document') + '</span><h3>Primul lucru de verificat.</h3><p>Deschide un contract sau o instituție și apasă „Salvează în anchetă”. Sursa și cifrele de acum vor rămâne în dosar.</p><button class="button secondary" data-action="inv-explore">Explorează achizițiile ' + icon('arrow') + '</button></div>') + '<p class="inv-snapshot-note">Fiecare sursă păstrează informațiile disponibile la momentul salvării.</p></div><aside class="inv-notes-column"><div class="inv-section-head"><h2 class="section-heading">Notițele tale</h2><button class="text-button inv-add-note" data-action="inv-add-note" aria-label="Adaugă o notă">' + icon('plus') + '</button></div><p class="inv-notes-hint">Ce ai observat? Ce mai e de verificat?</p><div class="inv-notes-list">' + (d.notes.length ? d.notes.map((note, index) => '<div class="inv-note"><div class="inv-note-heading"><label for="note-' + esc(note.id) + '">NOTA ' + String(index + 1).padStart(2, '0') + '</label><button class="text-button inv-remove" data-action="inv-remove-note" data-id="' + esc(note.id) + '" aria-label="Șterge nota ' + (index + 1) + '">' + icon('remove') + '</button></div><textarea id="note-' + esc(note.id) + '" class="inv-note-input" data-inv-note="' + esc(note.id) + '" data-dossier="' + esc(d.id) + '" placeholder="Scrie o observație, o întrebare, un pas următor…" rows="5">' + esc(note.text) + '</textarea><span class="inv-note-status" id="status-' + esc(note.id) + '" aria-live="polite">' + (storageAvailable ? 'Salvat în acest browser' : 'Păstrat în această sesiune') + '</span></div>').join('') : '<button class="inv-note-placeholder" data-action="inv-add-note">' + icon('plus') + '<span>Adaugă prima observație</span></button>') + '</div><div class="inv-notebook-tip"><span class="inv-tip-line"></span><p>O întrebare clară e mai utilă decât o concluzie grăbită. Păstrează contextul lângă fiecare sursă.</p></div></aside></div></section>';
  }

  function newDossier(title, description) {
    const stamp = now();
    const dossier = { id: uid(), title: title.trim(), description: description.trim(), createdAt: stamp, updatedAt: stamp, evidence: [], notes: [] };
    state.dossiers.unshift(dossier);
    state.selected = dossier.id;
    return dossier;
  }

  function dossierForm(edit) {
    const d = edit ? current() : null;
    window.UI.modal(edit ? 'Editează ancheta' : 'O întrebare. Un dosar nou.', '<form id="inv-dossier-form" data-edit="' + (edit ? 'true' : 'false') + '" class="inv-modal-form"><p class="inv-modal-intro">' + (edit ? 'Un titlu clar te ajută să păstrezi firul.' : 'Poate fi ceva mare sau o curiozitate despre strada ta.') + '</p><label class="field" for="inv-title">Numele anchetei<input id="inv-title" name="title" required maxlength="160" placeholder="De exemplu: Ce se cumpără pentru școli?" value="' + esc(d?.title || '') + '"></label><label class="field" for="inv-description">Ce vrei să afli? <span class="muted">(opțional)</span><textarea id="inv-description" name="description" maxlength="500" rows="3" placeholder="O întrebare la care să revii pe parcurs…">' + esc(d?.description || '') + '</textarea></label><p class="inv-modal-storage">Salvare locală în acest browser, fără cont.</p><div class="inv-modal-actions"><button type="button" class="button secondary" data-action="inv-cancel">Renunță</button><button class="button primary" type="submit">' + (edit ? 'Salvează' : 'Creează ancheta') + ' ' + icon('arrow') + '</button></div></form>', () => document.getElementById('inv-title')?.focus());
  }

  function openSave(item) {
    init();
    if (!item || !item.id || !item.title) { toast('Această sursă nu poate fi salvată încă.'); return; }
    try { pendingItem = JSON.parse(JSON.stringify(item)); } catch (_) { toast('Sursa nu a putut fi pregătită pentru salvare.'); return; }
    const dossiers = state.dossiers;
    window.UI.modal('Păstrează firul.', '<form id="inv-save-form" class="inv-modal-form"><p class="inv-modal-intro">Salvează această sursă într-o anchetă. O poți reciti și adnota oricând.</p><div class="inv-saving-item">' + icon('document') + '<div><strong>' + esc(item.title) + '</strong>' + (item.subtitle ? '<span>' + esc(item.subtitle) + '</span>' : '') + '</div></div>' + (dossiers.length ? '<label class="field" for="inv-target">Alege ancheta<select id="inv-target" name="target">' + dossiers.map((d) => '<option value="' + esc(d.id) + '"' + (d.id === state.selected ? ' selected' : '') + '>' + esc(d.title) + '</option>').join('') + '<option value="new">＋ Creează o anchetă nouă</option></select></label>' : '<input type="hidden" name="target" value="new">') + '<div id="inv-new-name-wrap"' + (dossiers.length ? ' hidden' : '') + '><label class="field" for="inv-new-title">Numele anchetei<input id="inv-new-title" name="newTitle" maxlength="160" placeholder="Ce vrei să verifici?"' + (dossiers.length ? '' : ' required') + '></label></div><p class="inv-modal-storage">Sursa și data salvării vor fi păstrate în acest browser.</p><div class="inv-modal-actions"><button class="button secondary" type="button" data-action="inv-cancel">Renunță</button><button class="button primary" type="submit">Salvează în anchetă ' + icon('arrow') + '</button></div></form>', () => document.getElementById(dossiers.length ? 'inv-target' : 'inv-new-title')?.focus());
  }

  function exportDossier(d) {
    const payload = { format: 'cinecastiga-investigation', version: 1, exportedAt: now(), scope: 'Dosar local creat în prototipul cinecâștigă?. Sursele păstrează instantaneul de la data salvării. Valorile contractate nu reprezintă neapărat plăți efectuate.', dossier: d };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ancheta-' + d.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Exportul JSON include sursele, notițele și datele salvării.');
  }

  function handleAction(action, el) {
    init();
    const d = current();
    switch (action) {
      case 'inv-new': dossierForm(false); break;
      case 'inv-edit': if (d) dossierForm(true); break;
      case 'inv-cancel': pendingItem = null; window.UI.closeModal(); break;
      case 'inv-open': state.selected = el.dataset.id; persist(); rerender(true); break;
      case 'inv-back': state.selected = null; persist(); rerender(true); break;
      case 'inv-explore': window.UI.navigate('explore'); break;
      case 'inv-export': if (d) exportDossier(d); break;
      case 'inv-add-note':
        if (d) {
          const note = { id: uid(), text: '', createdAt: now(), updatedAt: now() };
          d.notes.push(note); d.updatedAt = now(); persist(); rerender();
          requestAnimationFrame(() => document.getElementById('note-' + note.id)?.focus());
        }
        break;
      case 'inv-remove-note':
        if (d) { d.notes = d.notes.filter((note) => note.id !== el.dataset.id); d.updatedAt = now(); persist(); rerender(); toast('Nota a fost eliminată.'); }
        break;
      case 'inv-remove-evidence':
        if (d) { d.evidence = d.evidence.filter((item) => item.id !== el.dataset.id); d.updatedAt = now(); persist(); rerender(); toast('Sursa a fost eliminată din dosar.'); }
        break;
      default: return false;
    }
    return true;
  }

  function init() {
    if (initialized) return;
    initialized = true;
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) { const normalized = normalizeSaved(JSON.parse(saved)); if (normalized) state = normalized; }
      localStorage.setItem(KEY + '-check', '1'); localStorage.removeItem(KEY + '-check');
    } catch (_) { storageAvailable = false; }

    document.addEventListener('change', (event) => {
      if (event.target.id !== 'inv-target') return;
      const creating = event.target.value === 'new';
      document.getElementById('inv-new-name-wrap').hidden = !creating;
      document.getElementById('inv-new-title').required = creating;
      if (creating) document.getElementById('inv-new-title').focus();
    });

    document.addEventListener('input', (event) => {
      const input = event.target;
      if (!input.matches?.('[data-inv-note]')) return;
      const dossier = state.dossiers.find((item) => item.id === input.dataset.dossier);
      const note = dossier?.notes.find((item) => item.id === input.dataset.invNote);
      if (!note) return;
      note.text = input.value; note.updatedAt = now(); dossier.updatedAt = note.updatedAt;
      // Store on every input so navigation or tab closure cannot lose a pending edit.
      const saved = persist();
      const status = document.getElementById('status-' + note.id);
      if (status) status.textContent = saved ? 'Salvat în acest browser' : 'Păstrat în această sesiune';
    });

    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!['inv-dossier-form', 'inv-save-form'].includes(form.id)) return;
      event.preventDefault();
      const values = new FormData(form);
      if (form.id === 'inv-dossier-form') {
        const title = String(values.get('title') || '').trim();
        if (!title) { document.getElementById('inv-title')?.focus(); return; }
        const description = String(values.get('description') || '').trim();
        if (form.dataset.edit === 'true') {
          const d = current(); if (!d) return;
          d.title = title.slice(0, 160); d.description = description.slice(0, 500); d.updatedAt = now();
        } else newDossier(title.slice(0, 160), description.slice(0, 500));
        persist(); window.UI.closeModal();
        window.UI.navigate('investigations'); rerender(true);
        toast(form.dataset.edit === 'true' ? 'Titlul a fost salvat.' : 'Ancheta e pregătită. Adaugă prima sursă.');
      } else {
        if (!pendingItem) return;
        const target = String(values.get('target') || 'new');
        let d = state.dossiers.find((item) => item.id === target);
        if (target === 'new') {
          const title = String(values.get('newTitle') || '').trim();
          if (!title) { document.getElementById('inv-new-title')?.focus(); return; }
          d = newDossier(title.slice(0, 160), '');
        }
        if (!d) return;
        const itemKey = String(pendingItem.type || 'contract') + ':' + String(pendingItem.id);
        const duplicate = d.evidence.some((item) => item.refKey === itemKey);
        if (!duplicate) d.evidence.push({ id: uid(), refKey: itemKey, type: String(pendingItem.type || 'contract'), refId: String(pendingItem.id), title: String(pendingItem.title), capturedAt: now(), snapshot: pendingItem });
        d.updatedAt = now(); state.selected = d.id; persist();
        pendingItem = null; window.UI.closeModal();
        toast(duplicate ? 'Sursa este deja în „' + d.title + '”.' : 'Salvat în „' + d.title + '”. Îl găsești în Anchete.');
      }
    });
  }

  window.Investigations = {
    init,
    render: () => { init(); const d = current(); return d ? renderDossier(d) : renderOverview(); },
    openSave,
    handleAction,
  };
})();
