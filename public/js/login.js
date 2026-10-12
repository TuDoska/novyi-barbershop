// Вхід / реєстрація
const next = new URLSearchParams(location.search).get('next');
const safeNext = next && /^\/[a-z]/.test(next) && !next.startsWith('//') ? next : null;

function showTab(name) {
  $$('[data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
  $$('[data-form]').forEach((f) => { f.hidden = f.dataset.form !== name; });
}
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
if (location.hash === '#register') showTab('register');

$$('[data-form]').forEach((f) => f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const kind = f.dataset.form;
  const err = $('[data-err]', f);
  const body = { phone: f.phone.value, password: f.password.value };
  if (kind === 'register') Object.assign(body, { name: f.name.value.trim(), agree: f.agree.checked });
  if (kind === 'register' && body.password.length < 8) { err.textContent = errText('bad_password'); return; }
  if (kind === 'register' && !body.agree) { err.textContent = errText('agree_required'); return; }
  const btn = $('button', f);
  btn.disabled = true;
  const r = await api('POST', '/auth/' + kind, body);
  btn.disabled = false;
  if (r.error) { err.textContent = errText(r.error); return; }
  const staff = ['admin', 'master'].includes(r.user.role);
  location.href = safeNext || (staff ? '/admin' : '/account');
}));

initHeader().then((me) => { if (me) location.replace(['admin', 'master'].includes(me.role) ? '/admin' : '/account'); });
