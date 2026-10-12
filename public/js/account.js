// Кабінет клієнта: таймер до наступної стрижки, візити, записи, налаштування
const STATUS = { pending: 'Очікує', confirmed: 'Підтверджено', done: 'Виконано', noshow: 'Не прийшов', cancelled: 'Скасовано' };
const INTERVALS = [14, 21, 28, 35, 42];
const DAY_MS = 24 * 60 * 60 * 1000;
let DATA = null;

const badge = (s) => `<span class="badge badge--${s}">${STATUS[s]}</span>`;

function visitRow(b, cancel) {
  const d = new Date(b.date + 'T00:00:00Z');
  return `<div class="visit">
    <div class="visit__date"><b>${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}</b><span>${WEEKDAYS[d.getUTCDay()]} · ${b.time}</span></div>
    <div><h4>${esc(b.serviceName)}</h4><p>${esc(b.masterName)} · № ${b.number}</p></div>
    <div class="visit__side">
      <span class="visit__price">${b.from ? '<small>від</small> ' : ''}${uah(b.price)}</span>
      ${badge(b.status)}
      ${cancel ? `<button class="icon-btn icon-btn--bad" data-cancel="${esc(b.id)}">Скасувати</button>` : ''}
    </div>
  </div>`;
}

function renderTimer() {
  const box = $('#timer-box');
  const t = DATA.timer;
  const interval = DATA.user.interval;
  const chips = `<div class="interval" role="group" aria-label="Як часто стрижетесь">${INTERVALS.map((d) =>
    `<button data-interval="${d}" class="${d === interval ? 'is-active' : ''}">кожні ${d} дн.</button>`).join('')}</div>`;
  if (!t) {
    box.innerHTML = `<div class="timer">
      <div class="ring">${ringSvg(0)}<div class="ring__label"><b>—</b><span>днів</span></div></div>
      <div><h3>Таймер до наступної стрижки</h3>
      <p>Запуститься після першого візиту: майстер позначить запис як виконаний, і ми порахуємо, коли час знову до нас.</p>
      <p class="label" style="margin-bottom:12px">Як часто ви стрижетесь</p>${chips}
      <a class="btn btn--gold" href="/booking">Записатися</a></div></div>`;
    return;
  }
  const left = t.daysLeft;
  const ratio = Math.min(1, Math.max(0, left / t.interval));
  const over = left < 0;
  const head = left > 0
    ? `До наступної стрижки ${left} ${plural(left, 'день', 'дні', 'днів')}`
    : left === 0 ? 'Сьогодні — саме час для стрижки' : `Час стригтися минув ${-left} ${plural(-left, 'день', 'дні', 'днів')} тому`;
  box.innerHTML = `<div class="timer">
    <div class="ring">${ringSvg(ratio)}<div class="ring__label"><b>${over ? '!' : left}</b><span>${over ? 'пора' : plural(left, 'день', 'дні', 'днів')}</span></div></div>
    <div><h3>${head}</h3>
    <p>Останній візит — ${fmtDate(t.lastVisit)}. Рекомендована дата — <b style="color:var(--gold-2)">${fmtDate(t.nextDue)}</b>.</p>
    <p class="label" style="margin-bottom:12px">Як часто ви стрижетесь</p>${chips}
    ${DATA.upcoming.length ? '' : '<a class="btn btn--gold" href="/booking">Записатися на цю дату</a>'}</div></div>`;
  requestAnimationFrame(() => setTimeout(() => {
    const fg = $('.ring__fg', box);
    if (fg) fg.style.strokeDashoffset = String(fg.dataset.target);
  }, 60));
}

function ringSvg(ratio) {
  const c = 2 * Math.PI * 80;
  return `<svg viewBox="0 0 170 170" aria-hidden="true">
    <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6d3a3"/><stop offset="1" stop-color="#8a7140"/></linearGradient></defs>
    <circle class="ring__bg" cx="85" cy="85" r="80"/>
    <circle class="ring__fg" cx="85" cy="85" r="80" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - ratio)}"/>
  </svg>`;
}

function render() {
  const u = DATA.user;
  $('#hello').innerHTML = `Вітаємо, <em>${esc(u.name)}</em>`;
  $('#visits').textContent = DATA.visits;
  $('#spent').textContent = uah(DATA.spent);
  renderTimer();
  $('#upcoming').innerHTML = DATA.upcoming.length
    ? DATA.upcoming.map((b) => visitRow(b, true)).join('')
    : '<div class="empty"><b>Записів немає</b><a class="textlink" href="/booking">Записатися</a></div>';
  $('#history').innerHTML = DATA.history.length
    ? DATA.history.map((b) => visitRow(b, false)).join('')
    : '<div class="empty">Тут зʼявляться ваші візити</div>';
  $('#f-name').name.placeholder = u.name;
  $('#f-phone').phone.placeholder = fmtPhone(u.phone);
  renderLocks();
}

// Скільки чекати до наступної зміни імені / телефону
function renderLocks() {
  const left = (iso) => (iso ? Math.max(0, Date.parse(iso) + DAY_MS - Date.now()) : 0);
  const fmt = (ms) => { const h = Math.floor(ms / 3600000); const m = Math.ceil((ms % 3600000) / 60000); return `${h} год ${m} хв`; };
  [['#f-name', DATA.user.nameChangedAt], ['#f-phone', DATA.user.phoneChangedAt]].forEach(([id, iso]) => {
    const ms = left(iso);
    const form = $(id);
    $('[data-lock]', form).textContent = ms ? `Наступна зміна буде доступна через ${fmt(ms)}` : '';
    $('button:not(.pass__eye)', form).disabled = !!ms;
  });
}

async function load() {
  const r = await api('GET', '/my');
  if (r.error === 'auth_required') { location.replace('/login?next=/account'); return; }
  if (r.error) { toast(errText(r.error), 'is-error'); return; }
  if (['admin', 'master'].includes(r.user.role)) {
    // Персонал теж може мати візити, але основний екран — панель
    $('.admin-top .btn-row').insertAdjacentHTML('afterbegin', '<a class="btn btn--line" href="/admin">Панель</a>');
  }
  DATA = r;
  render();
}

document.addEventListener('click', async (e) => {
  const c = e.target.closest('[data-cancel]');
  if (c) {
    if (c.dataset.sure !== '1') { c.dataset.sure = '1'; c.textContent = 'Точно скасувати?'; return; }
    c.disabled = true;
    const r = await api('POST', `/my/bookings/${encodeURIComponent(c.dataset.cancel)}/cancel`, {});
    if (r.error) { toast(errText(r.error), 'is-error'); c.disabled = false; return; }
    toast('Запис скасовано');
    load();
  }
  const iv = e.target.closest('[data-interval]');
  if (iv) {
    const r = await api('PATCH', '/auth/interval', { days: Number(iv.dataset.interval) });
    if (r.error) return toast(errText(r.error), 'is-error');
    load();
  }
});

function bindForm(id, url, build, done) {
  const f = $(id);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-err]', f);
    err.textContent = '';
    const body = build(f);
    if (typeof body === 'string') { err.textContent = body; return; }
    const btn = $('button:not(.pass__eye)', f);
    btn.disabled = true;
    const r = await api('PATCH', url, body);
    btn.disabled = false;
    if (r.error) {
      err.textContent = r.error === 'too_soon' ? `${errText('too_soon')}. Залишилось ${Math.ceil(r.retryInMs / 3600000)} год` : errText(r.error);
      return;
    }
    f.reset();
    $$('.pass__eye.is-on', f).forEach((b) => b.click());
    toast(done);
    load();
  });
}

bindForm('#f-name', '/auth/name', (f) => (f.name.value.trim().length < 2 ? errText('bad_name') : { name: f.name.value.trim() }), "Імʼя змінено");
bindForm('#f-phone', '/auth/phone', (f) => (!f.password.value ? 'Введіть поточний пароль' : { phone: f.phone.value, password: f.password.value }), 'Телефон змінено. Тепер входьте з новим номером');
bindForm('#f-pass', '/auth/password', (f) => {
  if (f.password.value.length < 8) return errText('bad_password');
  if (f.password.value !== f.repeat.value) return errText('mismatch');
  return { password: f.password.value, repeat: f.repeat.value };
}, 'Пароль змінено');

initHeader();
load();
setInterval(() => DATA && renderLocks(), 60000);
