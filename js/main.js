// NOVYI_ BARBERSHOP — логіка сторінки
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uah = (n) => `${n.toLocaleString('uk-UA')} ₴`;

/* ---------- Шапка ---------- */
const header = $('#header');
const burger = $('.burger');
const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 30);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
burger.addEventListener('click', () => {
  const open = header.classList.toggle('is-open');
  burger.setAttribute('aria-expanded', open);
  document.body.classList.toggle('no-scroll', open);
});
$$('.nav a').forEach((a) => a.addEventListener('click', () => {
  header.classList.remove('is-open');
  burger.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('no-scroll');
}));

const navObserver = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) $$('.nav a').forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
$$('main section[id]').forEach((s) => navObserver.observe(s));

/* ---------- Прайс ---------- */
let tier = 'top';
let cat = 'all';
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

function renderPrice() {
  const list = SERVICES.filter((s) => s[tier] && (cat === 'all' || s.cat === cat));
  priceEl.innerHTML = list.map((s, i) => {
    const [price, time, from] = s[tier];
    const note = (tier === 'prime' && s.primeNote) || s.note || '';
    return `
      <li class="price__row" style="--i:${i}">
        <div class="price__name">
          <span class="price__idx">${String(i + 1).padStart(2, '0')}</span>
          <div><h3>${s.name}</h3>${note ? `<p>${note}</p>` : ''}</div>
        </div>
        <span class="price__dots" aria-hidden="true"></span>
        <span class="price__time">${time}</span>
        <span class="price__val">${from ? '<small>від</small> ' : ''}${uah(price)}</span>
        <a class="price__book" href="#book" data-book data-hint="${s.name} · ${tier === 'top' ? 'Top barber' : 'Prime barber'}" aria-label="Записатися: ${s.name}">→</a>
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

renderCats();
renderPrice();
moveGlider();
addEventListener('resize', moveGlider);
document.fonts?.ready.then(moveGlider);

/* ---------- Майстри ---------- */
$('#masters-grid').innerHTML = MASTERS.map((m, i) => `
  <article class="master" style="--d:${i * 120}ms">
    <div class="master__photo">
      <img src="${m.photo}" alt="${m.name}, ${m.tier}" loading="lazy" width="800" height="1000"
        onerror="this.remove()">
      <span class="master__initial" aria-hidden="true">${m.name[0]}</span>
      <span class="master__tier">${m.tier}</span>
    </div>
    <div class="master__body">
      <div class="master__top">
        <h3>${m.name}</h3>
        ${m.rating ? `<span class="master__rating">★ ${m.rating}</span>` : ''}
      </div>
      <ul>${m.skills.map((s) => `<li>${s}</li>`).join('')}</ul>
      <div class="master__actions">
        <a class="link-arrow" href="#book" data-book data-hint="Майстер: ${m.name} (${m.tier})">Записатися <span aria-hidden="true">→</span></a>
        <button class="master__prices" data-show-tier="${m.tierId}">Ціни ${m.tier.split(' ')[0]}</button>
      </div>
    </div>
  </article>`).join('');

$('#masters-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-show-tier]');
  if (!b) return;
  $(`.tier__btn[data-tier="${b.dataset.showTier}"]`).click();
  $('#services').scrollIntoView({ behavior: 'smooth' });
});

/* ---------- Поява при скролі ---------- */
const reveal = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); reveal.unobserve(e.target); }
  });
}, { threshold: 0.15 });
$$('.section__head, .about__text, .about__art, .master, .steps li, .quote, .contact__info, .contact__map').forEach((el) => {
  el.classList.add('reveal');
  reveal.observe(el);
});

/* ---------- Плаваюча кнопка запису ---------- */
const sticky = $('.sticky-book');
const heroObs = new IntersectionObserver(([e]) => sticky.classList.toggle('is-shown', !e.isIntersecting), { threshold: 0 });
heroObs.observe($('.hero'));

/* ---------- Вікно запису ---------- */
const book = $('#book');
const frame = $('#book-iframe');
let lastFocus = null;

function openBook(hint) {
  lastFocus = document.activeElement;
  if (!frame.src) {
    frame.addEventListener('load', () => book.classList.add('is-ready'), { once: true });
    frame.src = BOOK_URL;
  }
  $('#book-hint').textContent = hint ? `Ви обрали: ${hint}. Позначте її у списку нижче й оберіть зручний час.` : 'Позначте послугу, оберіть майстра та вільний час — і запис одразу потрапить до барбершопу.';
  book.hidden = false;
  document.body.classList.add('no-scroll');
  setTimeout(() => book.classList.add('is-open'), 20);
  $('.book__close', book).focus();
}

function closeBook() {
  book.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => { book.hidden = true; }, 500);
  lastFocus?.focus();
}

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-book]');
  if (trigger) {
    e.preventDefault();
    header.classList.remove('is-open');
    openBook(trigger.dataset.hint);
    return;
  }
  if (e.target.closest('[data-close]')) closeBook();
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !book.hidden) closeBook(); });
if (location.hash === '#book') openBook();

setTimeout(() => document.body.classList.add('is-loaded'), 30);
$('#year').textContent = new Date().getFullYear();
