// Головна сторінка: прайс і майстри підтягуються з сервера (адмін змінює їх в адмінці)
const CATS = { all: 'Усе', hair: 'Стрижки', combo: 'Комплекси', beard: 'Борода', camo: 'Камуфлювання', art: 'Завивка й колір', care: 'Догляд' };
const TIER = { top: 'Top barber', prime: 'Prime barber' };
let SERVICES = [];
let MASTERS = [];
let tier = 'top';
let cat = 'all';

initHeader();

// Підсвічування пункту меню
const navObserver = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) $$('.nav a').forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
$$('main section[id]').forEach((s) => navObserver.observe(s));

/* ---------- Прайс ---------- */
const priceEl = $('#price');
const catsEl = $('#cats');
const tierEl = $('.tier');

function renderCats() {
  const available = new Set(SERVICES.filter((s) => s[tier]).map((s) => s.cat));
  if (cat !== 'all' && !available.has(cat)) cat = 'all';
  catsEl.innerHTML = Object.entries(CATS)
    .filter(([id]) => id === 'all' || available.has(id))
    .map(([id, label]) => `<button role="tab" data-cat="${id}" class="${id === cat ? 'is-active' : ''}" aria-selected="${id === cat}">${label}</button>`)
    .join('');
}

const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} год${m % 60 ? ' ' + (m % 60) + ' хв' : ''}` : `${m} хв`);

function renderPrice() {
  const list = SERVICES.filter((s) => s[tier] && (cat === 'all' || s.cat === cat));
  priceEl.innerHTML = list.map((s, i) => {
    const o = s[tier];
    const note = (tier === 'prime' && s.primeNote) || s.note || '';
    return `
      <li class="price__row" style="--i:${i}">
        <div class="price__name">
          <span class="price__idx">${String(i + 1).padStart(2, '0')}</span>
          <div><h3>${esc(s.name)}</h3>${note ? `<p>${esc(note)}</p>` : ''}</div>
        </div>
        <span class="price__dots" aria-hidden="true"></span>
        <span class="price__time">${dur(o.duration)}</span>
        <span class="price__val">${o.from ? '<small>від</small> ' : ''}${uah(o.price)}</span>
        <a class="price__book" href="/booking?service=${encodeURIComponent(s.id)}&tier=${tier}" aria-label="Записатися: ${esc(s.name)}">→</a>
      </li>`;
  }).join('');
}

function moveGlider() {
  const active = $('.tier__btn.is-active', tierEl);
  const g = $('.tier__glider', tierEl);
  g.style.width = active.offsetWidth + 'px';
  g.style.transform = `translateX(${active.offsetLeft - 6}px)`;
}

tierEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tier]');
  if (!btn || btn.dataset.tier === tier) return;
  tier = btn.dataset.tier;
  $$('.tier__btn', tierEl).forEach((b) => {
    const on = b === btn;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', on);
  });
  moveGlider();
  renderCats();
  renderPrice();
});

catsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cat]');
  if (!btn) return;
  cat = btn.dataset.cat;
  renderCats();
  renderPrice();
});
addEventListener('resize', moveGlider);
document.fonts?.ready.then(moveGlider);
moveGlider();

/* ---------- Майстри ---------- */
function renderMasters() {
  // Підписи під рівнями — імена майстрів з бази
  ['top', 'prime'].forEach((t) => {
    const names = MASTERS.filter((m) => m.tier === t).map((m) => m.name).join(' · ');
    const small = $(`.tier__btn[data-tier="${t}"] small`);
    if (small) small.textContent = names || '—';
  });
  const grid = $('#masters-grid');
  grid.innerHTML = MASTERS.map((m, i) => `
    <article class="master reveal" style="--d:${i * 120}ms">
      <div class="master__photo">
        ${m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}, ${TIER[m.tier]}" loading="lazy" width="800" height="1000">` : ''}
        <span class="master__initial" aria-hidden="true">${esc(m.name[0])}</span>
        <span class="master__tier">${TIER[m.tier]}</span>
      </div>
      <div class="master__body">
        <div class="master__top"><h3>${esc(m.name)}</h3></div>
        <ul>${m.skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="master__actions">
          <a class="link-arrow" href="/booking?master=${encodeURIComponent(m.id)}">Записатися <span aria-hidden="true">→</span></a>
          <button class="master__prices" data-show-tier="${m.tier}">Ціни ${TIER[m.tier].split(' ')[0]}</button>
        </div>
      </div>
    </article>`).join('');
  // Якщо фото не завантажилось — лишається золота літера
  $$('img', grid).forEach((img) => img.addEventListener('error', () => img.remove()));
  $$('.master', grid).forEach((el) => reveal.observe(el));
  moveGlider();
}

$('#masters-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-show-tier]');
  if (!b) return;
  $(`.tier__btn[data-tier="${b.dataset.showTier}"]`).click();
  $('#services').scrollIntoView({ behavior: 'smooth' });
});

// Графік салону з графіків майстрів: «Щодня 10:00–20:00» або «Пн–Пт 10:00–20:00 · Сб 12:00–18:00»
function hoursText(week) {
  const names = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const order = [1, 2, 3, 4, 5, 6, 0].map((d) => week.find((w) => w.day === d));
  const groups = [];
  order.forEach((w) => {
    const key = w.off ? 'off' : `${hhmm(w.open)}–${hhmm(w.close)}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.days.push(w.day); else groups.push({ key, days: [w.day] });
  });
  const work = groups.filter((g) => g.key !== 'off');
  if (!work.length) return 'За попереднім записом';
  if (work.length === 1 && work[0].days.length === 7) return `Щодня ${work[0].key}`;
  const label = (d) => (d.length > 2 ? `${names[d[0]]}–${names[d[d.length - 1]]}` : d.map((x) => names[x]).join(', '));
  return work.map((g) => `${label(g.days)} ${g.key}`).join(' · ');
}

/* ---------- Поява при скролі ---------- */
const reveal = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); reveal.unobserve(e.target); }
  });
}, { threshold: 0.15 });
$$('.section__head, .about__text, .about__art, .steps li, .quote, .contact__info, .contact__map').forEach((el) => {
  el.classList.add('reveal');
  reveal.observe(el);
});

/* ---------- Плаваюча кнопка запису ---------- */
const sticky = $('.sticky-book');
new IntersectionObserver(([e]) => sticky.classList.toggle('is-shown', !e.isIntersecting)).observe($('.hero'));

setTimeout(() => document.body.classList.add('is-loaded'), 30);

(async () => {
  const meta = await api('GET', '/meta');
  if (meta.error) {
    priceEl.innerHTML = '<li class="price__empty">Не вдалося завантажити прайс. Оновіть сторінку.</li>';
    return;
  }
  SERVICES = meta.services;
  MASTERS = meta.masters;
  $('#hours-text').textContent = hoursText(meta.week);
  const mc = $('#masters-count');
  if (mc) mc.textContent = MASTERS.length;
  renderCats();
  renderPrice();
  renderMasters();
})();
