// Сторінка запису: майстер → послуга → дата й час → підтвердження
const TIER = { top: 'Top barber', prime: 'Prime barber' };
const CATS = { hair: 'Стрижки', combo: 'Комплекси', beard: 'Борода', camo: 'Камуфлювання', art: 'Завивка й колір', care: 'Догляд' };
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} год${m % 60 ? ' ' + (m % 60) + ' хв' : ''}` : `${m} хв`);
const params = new URLSearchParams(location.search);

let META = null;
const state = { master: null, service: null, date: null, start: null };
let wantService = params.get('service');

const offerOf = (s, m) => (s && m ? s[m.tier] : null);

/* ---------- Кроки ---------- */
function go(step) {
  $$('.step').forEach((s) => s.classList.toggle('is-active', s.dataset.step === String(step)));
  $$('#stepper li').forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle('is-current', n === step);
    li.classList.toggle('is-done', n < step);
  });
  $('#stepper').hidden = step === 5;
  $('#summary').hidden = step === 5;
  if (step === 3) renderDates();
  if (step === 4) renderConfirm();
  const top = $('.wizard').getBoundingClientRect().top + scrollY - 110;
  if (scrollY > top) scrollTo({ top, behavior: 'smooth' });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) go(Number(b.dataset.go));
});

function renderSummary() {
  const o = offerOf(state.service, state.master);
  const set = (id, v) => { const el = $(id); el.textContent = v || '—'; el.classList.toggle('is-empty', !v); };
  set('#s-master', state.master && `${state.master.name} · ${TIER[state.master.tier]}`);
  set('#s-service', state.service?.name);
  set('#s-duration', o && dur(o.duration));
  set('#s-date', state.date && fmtDate(state.date));
  set('#s-time', state.start != null && hhmm(state.start));
  $('#s-total').textContent = o ? `${o.from ? 'від ' : ''}${uah(o.price)}` : '—';
}

/* ---------- 1. Майстер ---------- */
function renderMasters() {
  const wanted = wantService && META.services.find((s) => s.id === wantService);
  $('#pick-masters').innerHTML = META.masters.map((m) => {
    const can = !wanted || wanted[m.tier];
    return `
    <button class="pick-master ${state.master?.id === m.id ? 'is-active' : ''}" data-master="${esc(m.id)}" ${can ? '' : 'disabled style="opacity:.35"'}>
      <div class="master__photo">
        ${m.photo ? `<img src="${esc(m.photo)}" alt="" loading="lazy" width="400" height="400">` : ''}
        <span class="master__initial" aria-hidden="true">${esc(m.name[0])}</span>
      </div>
      <div class="pick-master__body"><b>${esc(m.name)}</b><span>${TIER[m.tier]}</span></div>
    </button>`;
  }).join('');
  $$('#pick-masters img').forEach((img) => img.addEventListener('error', () => img.remove()));
}

$('#pick-masters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-master]');
  if (!b) return;
  state.master = META.masters.find((m) => m.id === b.dataset.master);
  // Якщо послуга недоступна в нового майстра — скидаємо
  if (state.service && !offerOf(state.service, state.master)) state.service = null;
  if (wantService) {
    const s = META.services.find((x) => x.id === wantService);
    if (offerOf(s, state.master)) state.service = s;
    wantService = null;
  }
  state.date = null; state.start = null;
  renderMasters();
  renderServices();
  renderSummary();
  go(state.service ? 3 : 2);
});

/* ---------- 2. Послуга ---------- */
function renderServices() {
  const m = state.master;
  if (!m) return;
  $('#services-lead').textContent = `Ціни ${TIER[m.tier]} · майстер ${m.name}`;
  const list = META.services.filter((s) => s[m.tier]);
  const groups = Object.keys(CATS).filter((c) => list.some((s) => s.cat === c));
  $('#pick-services').innerHTML = groups.map((c) => `
    <p class="pick-cat">${CATS[c]}</p>
    <ul class="pick-list">${list.filter((s) => s.cat === c).map((s) => {
      const o = s[m.tier];
      const note = (m.tier === 'prime' && s.primeNote) || s.note;
      return `<li><button class="pick-row ${state.service?.id === s.id ? 'is-active' : ''}" data-service="${esc(s.id)}">
        <div><h3>${esc(s.name)}</h3>${note ? `<p>${esc(note)}</p>` : ''}</div>
        <span class="pick-row__time">${dur(o.duration)}</span>
        <span class="pick-row__price">${o.from ? '<small>від</small> ' : ''}${uah(o.price)}</span>
      </button></li>`;
    }).join('')}</ul>`).join('');
}

$('#pick-services').addEventListener('click', (e) => {
  const b = e.target.closest('[data-service]');
  if (!b) return;
  state.service = META.services.find((s) => s.id === b.dataset.service);
  state.start = null;
  renderServices();
  renderSummary();
  go(3);
});

/* ---------- 3. Дата й час ---------- */
function renderDates() {
  const days = state.master.days;
  if (!state.date || !days.some((d) => d.date === state.date && d.open)) state.date = days.find((d) => d.open)?.date || null;
  $('#dates').innerHTML = days.map((d, i) => {
    const dt = new Date(d.date + 'T00:00:00Z');
    return `<button class="date ${d.date === state.date ? 'is-active' : ''}" data-date="${d.date}" ${d.open ? '' : 'disabled'} role="option" aria-selected="${d.date === state.date}">
      <small>${i === 0 ? 'Сьогодні' : i === 1 ? 'Завтра' : WEEKDAYS[dt.getUTCDay()]}</small>
      <b>${dt.getUTCDate()}</b><em>${MONTHS[dt.getUTCMonth()].slice(0, 3)}</em></button>`;
  }).join('');
  $('#dates .is-active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  renderSummary();
  loadTimes();
}

$('#dates').addEventListener('click', (e) => {
  const b = e.target.closest('[data-date]');
  if (!b) return;
  state.date = b.dataset.date;
  state.start = null;
  $$('#dates .date').forEach((d) => {
    d.classList.toggle('is-active', d === b);
    d.setAttribute('aria-selected', d === b);
  });
  renderSummary();
  loadTimes();
});

let timesReq = 0;
async function loadTimes() {
  const box = $('#times');
  if (!state.date) { box.innerHTML = '<div class="empty"><b>Немає робочих днів</b>Зателефонуйте нам, щоб домовитися.</div>'; return; }
  box.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  const req = ++timesReq;
  const r = await api('GET', `/slots?master=${encodeURIComponent(state.master.id)}&service=${encodeURIComponent(state.service.id)}&date=${state.date}`);
  if (req !== timesReq) return;
  if (r.error) { box.innerHTML = `<div class="empty">${esc(errText(r.error))}</div>`; return; }
  if (!r.slots.length) {
    box.innerHTML = '<div class="empty"><b>На цей день усе зайнято</b>Оберіть іншу дату — або іншого майстра.</div>';
    return;
  }
  const parts = [['Ранок', 0, 720], ['День', 720, 1020], ['Вечір', 1020, 1441]];
  box.innerHTML = parts.map(([label, a, b]) => {
    const list = r.slots.filter((t) => t >= a && t < b);
    return list.length ? `<p class="times-group">${label}</p><div class="times">${list.map((t) =>
      `<button class="time ${t === state.start ? 'is-active' : ''}" data-time="${t}">${hhmm(t)}</button>`).join('')}</div>` : '';
  }).join('');
}

$('#times').addEventListener('click', (e) => {
  const b = e.target.closest('[data-time]');
  if (!b) return;
  state.start = Number(b.dataset.time);
  $$('#times .time').forEach((t) => t.classList.toggle('is-active', t === b));
  renderSummary();
  setTimeout(() => go(4), 250);
});

/* ---------- 4. Підтвердження ---------- */
function renderConfirm() {
  const auth = $('#confirm-auth');
  const form = $('#confirm-form');
  if (ME) {
    auth.innerHTML = '';
    form.hidden = false;
    $('#confirm-who').innerHTML = `Записуємо: <b>${esc(ME.name)}</b>, ${esc(fmtPhone(ME.phone))}. <a class="textlink" href="/account">Змінити дані</a>`;
    return;
  }
  form.hidden = true;
  auth.innerHTML = `
    <p class="step__lead">Щоб бачити свої записи й таймер до наступної стрижки, увійдіть або створіть акаунт — це хвилина.</p>
    <div class="tabs" role="tablist">
      <button class="is-active" data-auth-tab="register" role="tab">Новий клієнт</button>
      <button data-auth-tab="login" role="tab">Вже маю акаунт</button>
    </div>
    <form class="form" data-auth="register">
      <label class="field"><span>Імʼя</span><input class="input" name="name" autocomplete="name" required minlength="2" maxlength="40"></label>
      <label class="field"><span>Телефон</span><input class="input" name="phone" type="tel" autocomplete="tel" placeholder="067 123 45 67" required></label>
      <label class="field"><span>Пароль</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="8" required>
        <span class="field__hint">Щонайменше 8 символів</span></label>
      <label class="check"><input type="checkbox" name="agree" required> <span>Погоджуюсь на обробку імені й телефону для запису.</span></label>
      <p class="field__err" data-err></p>
      <button class="btn btn--gold btn--block">Створити акаунт і продовжити</button>
    </form>
    <form class="form" data-auth="login" hidden>
      <label class="field"><span>Телефон</span><input class="input" name="phone" type="tel" autocomplete="tel" placeholder="067 123 45 67" required></label>
      <label class="field"><span>Пароль</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <p class="field__err" data-err></p>
      <button class="btn btn--gold btn--block">Увійти і продовжити</button>
    </form>`;
  initPasswordEyes(auth);
}

$('#confirm-auth').addEventListener('click', (e) => {
  const t = e.target.closest('[data-auth-tab]');
  if (!t) return;
  $$('[data-auth-tab]').forEach((b) => b.classList.toggle('is-active', b === t));
  $$('[data-auth]').forEach((f) => { f.hidden = f.dataset.auth !== t.dataset.authTab; });
});

$('#confirm-auth').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const kind = f.dataset.auth;
  const btn = $('button', f);
  const body = { phone: f.phone.value, password: f.password.value };
  if (kind === 'register') Object.assign(body, { name: f.name.value, agree: f.agree.checked });
  btn.disabled = true;
  const r = await api('POST', '/auth/' + kind, body);
  btn.disabled = false;
  if (r.error) { $('[data-err]', f).textContent = errText(r.error); return; }
  ME = r.user;
  await initHeaderAccount();
  renderConfirm();
});

async function initHeaderAccount() {
  const acc = $('.header__account');
  if (acc && ME) {
    acc.href = '/account';
    acc.innerHTML = `<span class="avatar">${esc(ME.name[0])}</span><span class="header__account-name">Кабінет</span>`;
  }
}

$('#confirm-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (!f.agree.checked) { toast('Поставте галочку згоди', 'is-error'); return; }
  const btn = $('button[type="submit"]', f);
  btn.disabled = true;
  btn.textContent = 'Записуємо…';
  const r = await api('POST', '/bookings', {
    masterId: state.master.id, serviceId: state.service.id, date: state.date, start: state.start,
    comment: f.comment.value, agree: true,
  });
  btn.disabled = false;
  btn.textContent = 'Записатися';
  if (r.error) {
    toast(errText(r.error), 'is-error');
    if (r.error === 'slot_taken') { state.start = null; renderSummary(); go(3); }
    if (r.error === 'auth_required') { ME = null; renderConfirm(); }
    return;
  }
  const b = r.booking;
  $('#ok-number').textContent = b.number;
  $('#ok-summary').innerHTML = `<dl>
    <div><dt>Майстер</dt><dd>${esc(b.masterName)}</dd></div>
    <div><dt>Послуга</dt><dd>${esc(b.serviceName)}</dd></div>
    <div><dt>Коли</dt><dd>${fmtDate(b.date)}, ${b.time}</dd></div>
    <div><dt>Сума</dt><dd>${b.from ? 'від ' : ''}${uah(b.price)}</dd></div></dl>`;
  go(5);
});

/* ---------- Старт ---------- */
(async () => {
  const [meta] = await Promise.all([api('GET', '/meta'), initHeader()]);
  if (meta.error) {
    $('#pick-masters').innerHTML = `<div class="empty"><b>Сервер прокидається</b>Оновіть сторінку за хвилинку.</div>`;
    return;
  }
  META = meta;
  renderMasters();
  const pm = params.get('master');
  const m = pm && META.masters.find((x) => x.id === pm);
  if (m) $(`[data-master="${CSS.escape(m.id)}"]`).click();
  else go(1);
})();
