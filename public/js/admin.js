// Панель: записи (адмін і майстри), заробіток, клієнти, послуги, майстри, графік (лише адмін)
const STATUS = { pending: 'Очікує', confirmed: 'Підтверджено', done: 'Виконано', noshow: 'Не прийшов', cancelled: 'Скасовано' };
const CATS = { hair: 'Стрижки', combo: 'Комплекси', beard: 'Борода', camo: 'Камуфлювання', art: 'Завивка й колір', care: 'Догляд' };
const TIER = { top: 'Top barber', prime: 'Prime barber' };
const DAYNAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const kyivToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
const addDays = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const toMin = (v) => { const [h, m] = String(v).split(':').map(Number); return h * 60 + m; };

let ROLE = null;
let MASTERS = [];
let SERVICES = [];
const isAdmin = () => ROLE === 'admin';

/* ---------- Модальне вікно ---------- */
const modal = $('#modal');
function openModal(html) {
  $('#modal-body').innerHTML = html;
  modal.hidden = false;
  document.body.classList.add('no-scroll');
  initPasswordEyes(modal);
  $('input, select, textarea', modal)?.focus();
}
function closeModal() { modal.hidden = true; document.body.classList.remove('no-scroll'); }
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

/* ---------- Вкладки ---------- */
const TITLES = { bookings: 'Записи', earnings: 'Заробіток', clients: 'Клієнти', services: 'Послуги', masters: 'Майстри', hours: 'Графік' };
const loaders = {};
function showTab(name) {
  $$('#admin-tabs [data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
  $$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  $('#admin-title').textContent = TITLES[name];
  history.replaceState(null, '', '#' + name);
  loaders[name]?.();
}
$('#admin-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });

/* =========================================================
   Записи
   ========================================================= */
let range = 'today';
function rangeDates() {
  const t = kyivToday();
  const picked = $('#pick-date').value;
  if (range === 'date' && picked) return [picked, picked];
  if (range === 'tomorrow') return [addDays(t, 1), addDays(t, 1)];
  if (range === 'week') return [t, addDays(t, 6)];
  if (range === 'past') return [addDays(t, -7), addDays(t, -1)];
  return [t, t];
}

$('#range-chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-range]');
  if (!b) return;
  range = b.dataset.range;
  $('#pick-date').value = '';
  $$('#range-chips button').forEach((x) => x.classList.toggle('is-active', x === b));
  loadBookings();
});
$('#pick-date').addEventListener('change', () => {
  range = 'date';
  $$('#range-chips button').forEach((x) => x.classList.remove('is-active'));
  loadBookings();
});
$('#f-master').addEventListener('change', loadBookings);
$('#f-status').addEventListener('change', loadBookings);

function bookingCard(b) {
  const priceText = b.finalPrice != null ? uah(b.finalPrice) : `${b.from ? 'від ' : ''}${uah(b.price)}`;
  const act = (status, label, cls = '') => `<button class="icon-btn ${cls}" data-status="${status}" data-id="${esc(b.id)}">${label}</button>`;
  const actions = [];
  if (b.status === 'pending') actions.push(act('confirmed', 'Підтвердити', 'icon-btn--gold'));
  if (['pending', 'confirmed'].includes(b.status)) {
    if (b.date <= kyivToday()) actions.push(act('done', 'Виконано', 'icon-btn--ok'), act('noshow', 'Не прийшов', 'icon-btn--bad'));
    actions.push(act('cancelled', 'Скасувати', 'icon-btn--bad'));
  }
  if (['cancelled', 'noshow'].includes(b.status)) actions.push(act('confirmed', 'Повернути'));
  if (b.status === 'done') actions.push(`<button class="icon-btn" data-price="${esc(b.id)}">Сума</button>`);
  return `<article class="bcard bcard--${b.status}">
    <div class="bcard__time"><b>${b.time}</b><span>${fmtDate(b.date)}</span></div>
    <div>
      <h4>${esc(b.clientName)} · ${esc(b.serviceName)}</h4>
      <p><a href="tel:${esc(b.clientPhone)}">${esc(fmtPhone(b.clientPhone))}</a> · ${esc(b.masterName)} · ${priceText} · № ${b.number}${b.source !== 'site' ? ' · створено вручну' : ''}</p>
      ${b.comment ? `<p>«${esc(b.comment)}»</p>` : ''}
    </div>
    <div class="bcard__actions"><span class="badge badge--${b.status}">${STATUS[b.status]}</span>${actions.join('')}</div>
  </article>`;
}

let BOOKINGS = [];
async function loadBookings() {
  const [from, to] = rangeDates();
  const q = new URLSearchParams({ from, to });
  if ($('#f-master')?.value) q.set('master', $('#f-master').value);
  if ($('#f-status').value) q.set('status', $('#f-status').value);
  const r = await api('GET', '/admin/bookings?' + q);
  if (r.error) { $('#blist').innerHTML = `<div class="empty">${esc(errText(r.error))}</div>`; return; }
  BOOKINGS = r.bookings;
  const pc = $('#pending-count');
  pc.hidden = !r.pending;
  pc.textContent = r.pending;
  if (!BOOKINGS.length) {
    $('#blist').innerHTML = '<div class="empty"><b>Записів немає</b>Оберіть інший день або додайте запис вручну.</div>';
    return;
  }
  // Групуємо за датою
  const byDate = BOOKINGS.reduce((acc, b) => ((acc[b.date] ||= []).push(b), acc), {});
  $('#blist').innerHTML = Object.entries(byDate).map(([date, list]) => {
    const sum = list.filter((b) => b.status === 'done').reduce((s, b) => s + (b.finalPrice ?? b.price), 0);
    return `<p class="pick-cat" style="padding-left:0">${fmtDate(date)} · ${list.length} ${plural(list.length, 'запис', 'записи', 'записів')}${sum ? ` · виконано на ${uah(sum)}` : ''}</p>${list.map(bookingCard).join('')}`;
  }).join('');
}
loaders.bookings = loadBookings;

async function setStatus(id, status, finalPrice) {
  const body = { status };
  if (finalPrice !== undefined) body.finalPrice = finalPrice;
  const r = await api('PATCH', '/admin/bookings/' + encodeURIComponent(id), body);
  if (r.error) return toast(errText(r.error), 'is-error');
  toast(`Статус: ${STATUS[status]}`);
  loadBookings();
}

function priceModal(b, status) {
  openModal(`<h2 class="panel__title">Фінальна сума<small>${esc(b.serviceName)} · ${esc(b.clientName)}. У прайсі: ${b.from ? 'від ' : ''}${uah(b.price)}</small></h2>
    <form class="form" id="price-form">
      <label class="field"><span>Сума, ₴</span><input class="input" name="price" type="number" min="0" max="100000" step="10" value="${b.finalPrice ?? b.price}" required></label>
      <button class="btn btn--gold">${status === 'done' ? 'Позначити виконаним' : 'Зберегти'}</button>
    </form>`);
  $('#price-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = Number(e.target.price.value);
    closeModal();
    if (status === 'done') setStatus(b.id, 'done', v);
    else api('PATCH', '/admin/bookings/' + encodeURIComponent(b.id), { finalPrice: v }).then((r) => { if (r.error) toast(errText(r.error), 'is-error'); else { toast('Суму збережено'); loadBookings(); } });
  });
}

$('#blist').addEventListener('click', (e) => {
  const s = e.target.closest('[data-status]');
  if (s) {
    const b = BOOKINGS.find((x) => x.id === s.dataset.id);
    // Для «від»-послуг одразу просимо фінальну суму
    if (s.dataset.status === 'done' && b.from) return priceModal(b, 'done');
    if (['cancelled', 'noshow'].includes(s.dataset.status) && s.dataset.sure !== '1') {
      s.dataset.sure = '1';
      s.textContent = 'Точно?';
      return;
    }
    return setStatus(b.id, s.dataset.status);
  }
  const p = e.target.closest('[data-price]');
  if (p) priceModal(BOOKINGS.find((x) => x.id === p.dataset.price), 'edit');
});

/* ---------- Запис вручну (по телефону) ---------- */
$('#new-booking').addEventListener('click', () => {
  const masters = isAdmin() ? MASTERS.filter((m) => m.active) : MASTERS.filter((m) => m.id === ME.masterId);
  openModal(`<h2 class="panel__title">Новий запис<small>Для клієнтів, які дзвонять або прийшли без запису</small></h2>
    <form class="form" id="nb-form" novalidate>
      <div class="grid-2">
        <label class="field"><span>Імʼя клієнта</span><input class="input" name="clientName" maxlength="40" required></label>
        <label class="field"><span>Телефон</span><input class="input" name="clientPhone" type="tel" placeholder="067 123 45 67" required></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Майстер</span><select class="input" name="masterId" ${isAdmin() ? '' : 'disabled'}>${masters.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} · ${TIER[m.tier]}</option>`).join('')}</select></label>
        <label class="field"><span>Послуга</span><select class="input" name="serviceId"></select></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Дата</span><input class="input" type="date" name="date" value="${kyivToday()}" min="${kyivToday()}"></label>
        <label class="field"><span>Час</span><select class="input" name="start"></select></label>
      </div>
      <label class="field"><span>Коментар</span><input class="input" name="comment" maxlength="300"></label>
      <p class="field__err" data-err></p>
      <button class="btn btn--gold">Створити запис</button>
    </form>`);
  const f = $('#nb-form');
  const fillServices = () => {
    const m = masters.find((x) => x.id === f.masterId.value);
    f.serviceId.innerHTML = SERVICES.filter((s) => s.active && m && s[m.tier])
      .map((s) => `<option value="${esc(s._id)}">${esc(s.name)} · ${uah(s[m.tier].price)}</option>`).join('');
  };
  const fillTimes = async () => {
    f.start.innerHTML = '<option>…</option>';
    const r = await api('GET', `/slots?master=${encodeURIComponent(f.masterId.value)}&service=${encodeURIComponent(f.serviceId.value)}&date=${f.date.value}`);
    f.start.innerHTML = r.slots?.length ? r.slots.map((t) => `<option value="${t}">${hhmm(t)}</option>`).join('') : '<option value="">Немає вільного часу</option>';
  };
  fillServices(); fillTimes();
  f.masterId.addEventListener('change', () => { fillServices(); fillTimes(); });
  f.serviceId.addEventListener('change', fillTimes);
  f.date.addEventListener('change', fillTimes);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.start.value) { $('[data-err]', f).textContent = 'Оберіть час'; return; }
    const r = await api('POST', '/admin/bookings', {
      clientName: f.clientName.value, clientPhone: f.clientPhone.value, masterId: f.masterId.value,
      serviceId: f.serviceId.value, date: f.date.value, start: Number(f.start.value), comment: f.comment.value,
    });
    if (r.error) { $('[data-err]', f).textContent = errText(r.error); if (r.error === 'slot_taken') fillTimes(); return; }
    closeModal();
    toast(`Запис № ${r.booking.number} створено`);
    $('#pick-date').value = r.booking.date;
    $('#pick-date').dispatchEvent(new Event('change'));
  });
});

/* =========================================================
   Заробіток
   ========================================================= */
let earnDays = '30';
$('#earn-chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-days]');
  if (!b) return;
  earnDays = b.dataset.days;
  $$('#earn-chips button').forEach((x) => x.classList.toggle('is-active', x === b));
  loadEarnings();
});

async function loadEarnings() {
  const to = kyivToday();
  const from = earnDays === 'month' ? to.slice(0, 8) + '01' : addDays(to, -(Number(earnDays) - 1));
  const r = await api('GET', `/admin/earnings?from=${from}&to=${to}`);
  if (r.error) return toast(errText(r.error), 'is-error');
  $('#kpis').innerHTML = [
    ['Сьогодні', uah(r.today), ''],
    ['Цей тиждень', uah(r.week), 'з понеділка'],
    ['Цей місяць', uah(r.month), ''],
    ['Середній чек', uah(r.range.avg), `${r.range.count} ${plural(r.range.count, 'візит', 'візити', 'візитів')} за період`],
  ].map(([k, v, s]) => `<div class="kpi"><span>${k}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`).join('');

  const max = Math.max(1, ...r.series.map((d) => d.total));
  $('#chart').innerHTML = r.series.map((d, i) => `<div class="chart__bar ${d.total ? '' : 'is-zero'}" style="height:${(d.total / max) * 100}%;animation-delay:${i * 12}ms"
    data-tip="${fmtDate(d.date, false)}: ${uah(d.total)} · ${d.count}"></div>`).join('');
  $('#chart-axis').innerHTML = `<span>${fmtDate(r.range.from, false)}</span><span>${fmtDate(r.range.to, false)}</span>`;
  $('#chart-sub').textContent = `Разом ${uah(r.range.total)} · не прийшли: ${r.noshow} · скасовано: ${r.cancelled}`;

  const mMax = Math.max(1, ...r.byMaster.map((m) => m.total));
  $('#by-master').innerHTML = r.byMaster.length ? r.byMaster.map((m) => `<div>
      <div class="hbar__top"><span style="color:var(--ink);font-size:14px">${esc(m.name)} <span>· ${m.count}</span></span><b>${uah(m.total)}</b></div>
      <div class="hbar__track"><div class="hbar__fill" style="width:${(m.total / mMax) * 100}%"></div></div></div>`).join('')
    : '<div class="empty">Поки немає виконаних записів</div>';
  $('#by-service').innerHTML = `<thead><tr><th>Послуга</th><th>Візитів</th><th>Сума</th><th>Частка</th></tr></thead><tbody>${
    r.byService.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.count}</td><td class="num">${uah(s.total)}</td><td>${r.range.total ? Math.round((s.total / r.range.total) * 100) : 0}%</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">Немає даних</td></tr>'}</tbody>`;
}
loaders.earnings = loadEarnings;

/* =========================================================
   Клієнти
   ========================================================= */
let CLIENTS = [];
let qTimer;
$('#client-q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(loadClients, 250); });

async function loadClients() {
  const r = await api('GET', '/admin/clients?q=' + encodeURIComponent($('#client-q').value));
  if (r.error) return toast(errText(r.error), 'is-error');
  CLIENTS = r.clients;
  const rows = CLIENTS.filter((c) => c.role === 'client');
  $('#clients').innerHTML = `<thead><tr><th>Клієнт</th><th>Телефон</th><th>Візитів</th><th>Витратив</th><th>Останній візит</th><th>Не прийшов</th><th></th></tr></thead><tbody>${
    rows.map((c) => `<tr class="${c.blocked ? 'is-off' : ''}"><td>${esc(c.name)}</td><td><a class="textlink" href="tel:${esc(c.phone)}">${esc(fmtPhone(c.phone))}</a></td>
      <td>${c.visits}</td><td class="num">${uah(c.spent)}</td><td>${c.lastVisit ? fmtDate(c.lastVisit, false) : '—'}</td><td>${c.noshow || '—'}</td>
      <td><button class="icon-btn ${c.blocked ? '' : 'icon-btn--bad'}" data-block="${esc(c.id)}" data-val="${!c.blocked}">${c.blocked ? 'Розблокувати' : 'Заблокувати'}</button></td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">Нікого не знайдено</td></tr>'}</tbody>`;
  renderStaff();
}
loaders.clients = loadClients;

$('#clients').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-block]');
  if (!b) return;
  const r = await api('PATCH', '/admin/clients/' + encodeURIComponent(b.dataset.block), { blocked: b.dataset.val === 'true' });
  if (r.error) return toast(errText(r.error), 'is-error');
  toast(b.dataset.val === 'true' ? 'Клієнта заблоковано' : 'Клієнта розблоковано');
  loadClients();
});

/* =========================================================
   Послуги
   ========================================================= */
async function loadServices() {
  const r = await api('GET', '/admin/services');
  if (r.error) return;
  SERVICES = r.services;
  const p = (o) => (o ? `${o.from ? 'від ' : ''}${uah(o.price)} · ${o.duration} хв` : '—');
  $('#services').innerHTML = `<thead><tr><th>Послуга</th><th>Категорія</th><th>Top barber</th><th>Prime barber</th><th></th></tr></thead><tbody>${
    SERVICES.map((s) => `<tr class="${s.active ? '' : 'is-off'}"><td>${esc(s.name)}${s.active ? '' : ' (прихована)'}</td><td>${CATS[s.cat]}</td><td>${p(s.top)}</td><td>${p(s.prime)}</td>
      <td><button class="icon-btn" data-edit-service="${esc(s._id)}">Змінити</button></td></tr>`).join('')}</tbody>`;
}
loaders.services = loadServices;

function serviceModal(s = {}) {
  const tierFields = (t) => `<fieldset class="panel" style="padding:18px"><legend class="label" style="padding:0 8px">${TIER[t]}</legend>
    <label class="check" style="margin-bottom:12px"><input type="checkbox" name="${t}On" ${s[t] || !s._id ? 'checked' : ''}> <span>Доступно на цьому рівні</span></label>
    <div class="grid-2"><label class="field"><span>Ціна, ₴</span><input class="input" type="number" name="${t}Price" min="0" step="10" value="${s[t]?.price ?? ''}"></label>
    <label class="field"><span>Хвилин</span><input class="input" type="number" name="${t}Dur" min="5" step="5" value="${s[t]?.duration ?? 60}"></label></div>
    <label class="check" style="margin-top:12px"><input type="checkbox" name="${t}From" ${s[t]?.from ? 'checked' : ''}> <span>Ціна «від» (уточнюється у майстра)</span></label></fieldset>`;
  openModal(`<h2 class="panel__title">${s._id ? 'Змінити послугу' : 'Нова послуга'}</h2>
    <form class="form" id="svc-form" novalidate>
      <label class="field"><span>Назва</span><input class="input" name="name" maxlength="80" value="${esc(s.name || '')}"></label>
      <div class="grid-2">
        <label class="field"><span>Категорія</span><select class="input" name="cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${s.cat === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Порядок у прайсі</span><input class="input" type="number" name="order" value="${s.order ?? 99}"></label>
      </div>
      ${tierFields('top')}${tierFields('prime')}
      <label class="field"><span>Примітка</span><input class="input" name="note" maxlength="120" value="${esc(s.note || '')}"></label>
      <label class="field"><span>Примітка для Prime</span><input class="input" name="primeNote" maxlength="120" value="${esc(s.primeNote || '')}"></label>
      <label class="check"><input type="checkbox" name="active" ${s.active === false ? '' : 'checked'}> <span>Показувати на сайті</span></label>
      <p class="field__err" data-err></p>
      <button class="btn btn--gold">Зберегти</button>
    </form>`);
  $('#svc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const o = (t) => (f[t + 'On'].checked ? { price: Number(f[t + 'Price'].value), duration: Number(f[t + 'Dur'].value), from: f[t + 'From'].checked } : null);
    const body = { name: f.name.value, cat: f.cat.value, order: Number(f.order.value), top: o('top'), prime: o('prime'), note: f.note.value, primeNote: f.primeNote.value, active: f.active.checked };
    const r = s._id ? await api('PUT', '/admin/services/' + encodeURIComponent(s._id), body) : await api('POST', '/admin/services', body);
    if (r.error) { $('[data-err]', f).textContent = errText(r.error); return; }
    closeModal(); toast('Послугу збережено'); loadServices();
  });
}
$('#add-service').addEventListener('click', () => serviceModal());
$('#services').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit-service]');
  if (b) serviceModal(SERVICES.find((s) => s._id === b.dataset.editService));
});

/* =========================================================
   Майстри й акаунти персоналу
   ========================================================= */
async function loadMasters() {
  const r = await api('GET', '/admin/masters');
  if (r.error) return;
  MASTERS = r.masters.map((m) => ({ ...m, id: m._id }));
  $('#masters').innerHTML = `<thead><tr><th>Майстер</th><th>Рівень</th><th>Навички</th><th></th></tr></thead><tbody>${
    MASTERS.map((m) => `<tr class="${m.active ? '' : 'is-off'}"><td>${esc(m.name)}${m.active ? '' : ' (прихований)'}</td><td>${TIER[m.tier]}</td><td>${esc(m.skills.join(', '))}</td>
      <td><button class="icon-btn" data-edit-master="${esc(m.id)}">Змінити</button></td></tr>`).join('')}</tbody>`;
  fillMasterFilter();
  if (CLIENTS.length) renderStaff(); else if (isAdmin()) loadClients();
}
loaders.masters = loadMasters;

function renderStaff() {
  const staff = CLIENTS.filter((c) => c.role !== 'client');
  $('#staff').innerHTML = `<thead><tr><th>Імʼя</th><th>Телефон</th><th>Роль</th><th></th></tr></thead><tbody>${
    staff.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(fmtPhone(c.phone))}</td><td>${c.role === 'admin' ? 'Адмін' : 'Майстер: ' + esc(MASTERS.find((m) => m.id === c.masterId)?.name || '?')}</td>
      <td>${c.id === ME.id ? '<span class="field__hint">це ви</span>' : `<button class="icon-btn icon-btn--bad" data-demote="${esc(c.id)}">Забрати доступ</button>`}</td></tr>`).join('')}</tbody>`;
}

$('#staff').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-demote]');
  if (!b) return;
  if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Точно?'; return; }
  const r = await api('PATCH', '/admin/clients/' + encodeURIComponent(b.dataset.demote), { role: 'client' });
  if (r.error) return toast(errText(r.error), 'is-error');
  toast('Доступ до панелі забрано');
  loadClients();
});

function masterModal(m = {}) {
  openModal(`<h2 class="panel__title">${m.id ? 'Змінити майстра' : 'Новий майстер'}</h2>
    <form class="form" id="m-form" novalidate>
      <div class="grid-2">
        <label class="field"><span>Імʼя</span><input class="input" name="name" maxlength="40" value="${esc(m.name || '')}"></label>
        <label class="field"><span>Рівень</span><select class="input" name="tier"><option value="top" ${m.tier === 'top' ? 'selected' : ''}>Top barber</option><option value="prime" ${m.tier === 'prime' ? 'selected' : ''}>Prime barber</option></select></label>
      </div>
      <label class="field"><span>Фото (посилання https://)</span><input class="input" name="photo" value="${esc(m.photo || '')}"></label>
      <label class="field"><span>Навички через кому</span><input class="input" name="skills" value="${esc((m.skills || []).join(', '))}"></label>
      <div class="grid-2"><label class="field"><span>Порядок</span><input class="input" type="number" name="order" value="${m.order ?? 99}"></label></div>
      <label class="check"><input type="checkbox" name="active" ${m.active === false ? '' : 'checked'}> <span>Показувати на сайті й у записі</span></label>
      <p class="field__err" data-err></p>
      <button class="btn btn--gold">Зберегти</button>
    </form>`);
  $('#m-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { name: f.name.value, tier: f.tier.value, photo: f.photo.value, skills: f.skills.value.split(',').map((x) => x.trim()).filter(Boolean), order: Number(f.order.value), active: f.active.checked };
    const r = m.id ? await api('PUT', '/admin/masters/' + encodeURIComponent(m.id), body) : await api('POST', '/admin/masters', body);
    if (r.error) { $('[data-err]', f).textContent = errText(r.error); return; }
    closeModal(); toast('Майстра збережено'); loadMasters();
  });
}
$('#add-master').addEventListener('click', () => masterModal());
$('#masters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit-master]');
  if (b) masterModal(MASTERS.find((m) => m.id === b.dataset.editMaster));
});

$('#add-staff').addEventListener('click', () => {
  openModal(`<h2 class="panel__title">Акаунт для майстра<small>Майстер входить зі своїм телефоном і цим паролем, потім може змінити пароль у кабінеті</small></h2>
    <form class="form" id="st-form" novalidate>
      <label class="field"><span>Майстер</span><select class="input" name="masterId">${MASTERS.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label>
      <div class="grid-2">
        <label class="field"><span>Імʼя</span><input class="input" name="name" maxlength="40" value="${esc(MASTERS[0]?.name || '')}"></label>
        <label class="field"><span>Телефон майстра</span><input class="input" name="phone" type="tel" placeholder="067 123 45 67"></label>
      </div>
      <label class="field"><span>Тимчасовий пароль</span><input class="input" name="password" type="password" minlength="8" autocomplete="new-password"></label>
      <p class="field__err" data-err></p>
      <button class="btn btn--gold">Створити акаунт</button>
    </form>`);
  const f = $('#st-form');
  f.masterId.addEventListener('change', () => { f.name.value = MASTERS.find((m) => m.id === f.masterId.value)?.name || ''; });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('POST', '/admin/staff', { masterId: f.masterId.value, name: f.name.value, phone: f.phone.value, password: f.password.value });
    if (r.error) { $('[data-err]', f).textContent = errText(r.error); return; }
    closeModal(); toast('Акаунт майстра створено'); loadClients();
  });
});

function fillMasterFilter() {
  const sel = $('#f-master');
  if (!sel) return;
  const v = sel.value;
  sel.innerHTML = '<option value="">Усі майстри</option>' + MASTERS.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
  sel.value = v;
}

/* =========================================================
   Графік: кожен майстер — свої дні та години, перерва, відпустка
   ========================================================= */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAYFULL = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
let schedMaster = null;
let M_CLOSED = [];
let CLOSED = [];

function renderChips(box, list, attr) {
  box.innerHTML = list.length
    ? list.map((d) => `<button type="button" ${attr}="${d}">${fmtDate(d)} ×</button>`).join('')
    : '<span class="field__hint">Немає</span>';
}

async function loadSchedule() {
  if (isAdmin()) {
    if (!schedMaster) schedMaster = MASTERS[0]?.id;
    $('#sched-masters').innerHTML = MASTERS.map((m) => `<button type="button" data-sm="${esc(m.id)}" class="${m.id === schedMaster ? 'is-active' : ''}">${esc(m.name)}</button>`).join('');
    loadSalon();
  } else {
    schedMaster = ME.masterId;
  }
  if (!schedMaster) { $('#sched-form').innerHTML = '<div class="empty">Акаунт не привʼязаний до майстра</div>'; return; }
  const r = await api('GET', '/admin/schedule/' + encodeURIComponent(schedMaster));
  if (r.error) return toast(errText(r.error), 'is-error');
  const sc = r.schedule;
  $('#sched-title').innerHTML = `Графік · ${esc(sc.name)}<small>Онлайн-запис показує лише ці дні й години</small>`;
  $('#week').innerHTML = WEEK_ORDER.map((d) => {
    const x = sc.week[d] || { on: false, open: 600, close: 1200 };
    return `<div class="week__row ${x.on ? '' : 'is-off'}" data-day="${d}">
      <label class="switch"><input type="checkbox" ${x.on ? 'checked' : ''} data-on><span></span></label>
      <b class="week__day">${DAYFULL[d]}</b>
      <input class="input" type="time" step="300" value="${hhmm(x.open)}" data-open aria-label="${DAYFULL[d]}: початок">
      <span class="week__dash">—</span>
      <input class="input" type="time" step="300" value="${hhmm(x.close)}" data-close aria-label="${DAYFULL[d]}: кінець">
      <span class="week__off">Вихідний</span>
    </div>`;
  }).join('');
  $('#buffer').innerHTML = r.buffers.map((b) => `<option value="${b}" ${b === sc.buffer ? 'selected' : ''}>${b ? b + ' хв' : 'без перерви'}</option>`).join('');
  M_CLOSED = [...sc.closedDates];
  renderChips($('#m-closed-list'), M_CLOSED, 'data-m-unclose');
  $('#sched-conflicts').innerHTML = '';
  $('[data-err]', $('#sched-form')).textContent = '';
}
loaders.hours = loadSchedule;

document.addEventListener('click', (e) => {
  const sm = e.target.closest('[data-sm]');
  if (sm) { schedMaster = sm.dataset.sm; loadSchedule(); }
  const u = e.target.closest('[data-m-unclose]');
  if (u) { M_CLOSED = M_CLOSED.filter((d) => d !== u.dataset.mUnclose); renderChips($('#m-closed-list'), M_CLOSED, 'data-m-unclose'); }
  const c = e.target.closest('[data-unclose]');
  if (c) { CLOSED = CLOSED.filter((d) => d !== c.dataset.unclose); renderChips($('#closed-list'), CLOSED, 'data-unclose'); }
});
$('#week').addEventListener('change', (e) => {
  const row = e.target.closest('.week__row');
  if (e.target.matches('[data-on]')) row.classList.toggle('is-off', !e.target.checked);
});
$('#m-add-closed').addEventListener('click', () => {
  const v = $('#m-closed-date').value;
  if (v && !M_CLOSED.includes(v)) { M_CLOSED.push(v); M_CLOSED.sort(); renderChips($('#m-closed-list'), M_CLOSED, 'data-m-unclose'); }
});

$('#sched-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('[data-err]', f);
  const week = {};
  for (const row of $$('.week__row', f)) {
    const on = $('[data-on]', row).checked;
    const open = toMin($('[data-open]', row).value || '00:00');
    const close = toMin($('[data-close]', row).value || '00:00');
    if (on && open >= close) { err.textContent = `${DAYFULL[row.dataset.day]}: кінець має бути пізніше за початок`; return; }
    week[row.dataset.day] = { on, open, close };
  }
  const r = await api('PUT', '/admin/schedule/' + encodeURIComponent(schedMaster), { week, buffer: Number(f.buffer.value), closedDates: M_CLOSED });
  if (r.error) { err.textContent = errText(r.error); return; }
  err.textContent = '';
  toast('Графік збережено');
  // Записи, які тепер поза графіком — щоб ніхто з клієнтів не загубився
  $('#sched-conflicts').innerHTML = r.conflicts.length ? `<div class="notice">
      <b>Увага: ${r.conflicts.length} ${plural(r.conflicts.length, 'запис', 'записи', 'записів')} тепер поза графіком</b>
      <p>Вони не скасовані автоматично. Звʼяжіться з клієнтами, щоб перенести або скасувати.</p>
      <ul>${r.conflicts.map((b) => `<li>${fmtDate(b.date)}, ${b.time} — ${esc(b.clientName)}, <a class="textlink" href="tel:${esc(b.clientPhone)}">${esc(fmtPhone(b.clientPhone))}</a> · ${esc(b.serviceName)}</li>`).join('')}</ul>
    </div>` : '';
});

/* ---------- Загальне для барбершопу ---------- */
async function loadSalon() {
  const r = await api('GET', '/admin/salon');
  if (r.error) return;
  $('#salon-form').step.value = String(r.salon.step);
  CLOSED = [...r.salon.closedDates];
  renderChips($('#closed-list'), CLOSED, 'data-unclose');
}
$('#add-closed').addEventListener('click', () => {
  const v = $('#closed-date').value;
  if (v && !CLOSED.includes(v)) { CLOSED.push(v); CLOSED.sort(); renderChips($('#closed-list'), CLOSED, 'data-unclose'); }
});
$('#salon-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api('PUT', '/admin/salon', { step: Number(e.target.step.value), closedDates: CLOSED });
  if (r.error) { $('[data-err]', e.target).textContent = errText(r.error); return; }
  toast('Збережено');
});

/* ---------- Старт ---------- */
(async () => {
  const me = await initHeader();
  if (!me) { location.replace('/login?next=/admin'); return; }
  if (!['admin', 'master'].includes(me.role)) { location.replace('/account'); return; }
  ROLE = me.role;
  $('#role-label').textContent = isAdmin() ? 'Панель адміністратора' : `Панель майстра · ${me.name}`;
  if (!isAdmin()) {
    $$('[data-admin]').forEach((el) => el.remove());
    $('#hours-tab').textContent = 'Мій графік';
    TITLES.hours = 'Мій графік';
  }

  // Майстри й послуги для форм (публічні дані; адміну — повні)
  if (isAdmin()) {
    await Promise.all([loadMasters(), loadServices()]);
  } else {
    const meta = await api('GET', '/meta');
    MASTERS = meta.masters || [];
    SERVICES = (meta.services || []).map((s) => ({ ...s, _id: s.id, active: true }));
  }
  const tab = location.hash.slice(1);
  showTab(TITLES[tab] && (isAdmin() || ['bookings', 'hours'].includes(tab)) ? tab : 'bookings');
})();
