// Mockup only: no network requests; sending is simulated.
const $ = s => document.querySelector(s);
const fab = $('#fab'), dialog = $('#dialog'), form = $('#form'), message = $('#message'), error = $('#error');
const submit = $('#submit'), sent = $('#sent'), count = $('#count'), toast = $('#toast');
const params = new URLSearchParams(location.search);

// Theme: same light/dark tokens as the application.
$('#theme').addEventListener('click', () => {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('ff-theme', next); } catch {}
});

// Variant switches, reflected in the URL so a variant can be linked directly.
function apply(name, value) {
  if (name === 'pos') fab.dataset.pos = value;
  if (name === 'stil') fab.dataset.stil = value;
  const url = new URL(location.href);
  url.searchParams.set(name === 'pos' ? 'pozitie' : 'stil', value);
  history.replaceState(null, '', url);
}
for (const [name, key] of [['pos', 'pozitie'], ['stil', 'stil']]) {
  const initial = params.get(key);
  const radio = initial && document.querySelector(`input[name=${name}][value="${initial}"]`);
  if (radio) { radio.checked = true; apply(name, initial); }
  document.querySelectorAll(`input[name=${name}]`).forEach(input => input.addEventListener('change', () => apply(name, input.value)));
}
$('#admin').addEventListener('change', event => {
  document.body.classList.toggle('is-admin', event.target.checked);
  $('#admin-flag').hidden = !event.target.checked;
});

// Dialog: the existing ReportProblem behaviour, simulated.
let busy = false, wasSent = false;
function open() {
  if (wasSent) { form.reset(); message.value = ''; updateCount(); wasSent = false; }
  form.hidden = false; sent.hidden = true; error.hidden = true;
  $('#fd-title').textContent = 'Ce ai observat?';
  dialog.showModal();
}
function close() { if (busy) return; dialog.close(); fab.focus(); }
fab.addEventListener('click', open);
dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
dialog.addEventListener('click', event => { if (event.target.closest('[data-dismiss]')) close(); });
function updateCount() { count.textContent = `${message.value.length.toLocaleString('ro-RO')} / 3.000`; }
message.addEventListener('input', updateCount);
form.addEventListener('submit', event => {
  event.preventDefault();
  if (busy) return;
  if (message.value.trim().length < 20) { showError('Descrie problema în cel puțin 20 de caractere, ca să o putem verifica.'); return; }
  busy = true; error.hidden = true; submit.textContent = 'Se trimite…';
  form.querySelectorAll('button,select,textarea').forEach(el => { el.disabled = true; });
  form.setAttribute('aria-busy', 'true');
  setTimeout(() => {
    busy = false; submit.textContent = 'Trimite anonim'; form.removeAttribute('aria-busy');
    form.querySelectorAll('button,select,textarea').forEach(el => { el.disabled = false; });
    if ($('#outcome').value === 'error') { showError('Mesajul nu a fost trimis. Încearcă din nou.'); return; }
    wasSent = true; form.hidden = true; sent.hidden = false;
    $('#fd-title').textContent = 'Mesaj primit';
    requestAnimationFrame(() => sent.querySelector('button').focus());
  }, 700);
});
function showError(text) { error.textContent = text; error.hidden = false; }

// Toast collision check: centred toasts sit above the button layer.
let toastTimer;
$('#toast-btn').addEventListener('click', () => {
  toast.textContent = 'Întrebarea a fost copiată.';
  toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('on'), 2600);
});
