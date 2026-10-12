// Спільне для всіх сторінок: запити до сервера, акаунт у шапці, повідомлення, око для пароля
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uah = (n) => `${Number(n).toLocaleString('uk-UA')} ₴`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtPhone = (p) => (p || '').replace(/^\+380(\d{2})(\d{3})(\d{2})(\d{2})$/, '+380 $1 $2 $3 $4');
const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const fmtDate = (iso, withDay = true) => {
  const d = new Date(iso + 'T00:00:00Z');
  return `${withDay ? WEEKDAYS[d.getUTCDay()] + ', ' : ''}${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

const ERRORS = {
  bad_name: "Вкажіть ім'я (2–40 символів)",
  bad_phone: 'Перевірте номер: наприклад 067 123 45 67',
  bad_password: 'Пароль — щонайменше 8 символів',
  bad_credentials: 'Невірний телефон або пароль',
  locked: 'Забагато спроб. Вхід заблоковано на 15 хвилин',
  phone_taken: 'Цей номер уже зареєстровано',
  agree_required: 'Потрібна згода на обробку даних',
  mismatch: 'Паролі не збігаються',
  too_soon: 'Змінювати можна раз на добу',
  same_value: 'Значення не змінилося',
  slot_taken: 'Цей час щойно зайняли — оберіть інший',
  too_many_active: 'У вас уже 2 активні записи. Скасуйте один або дочекайтеся візиту',
  bad_choice: 'Ця послуга недоступна в обраного майстра',
  auth_required: 'Увійдіть в акаунт',
  forbidden: 'Немає доступу',
  bad_origin: 'Запит відхилено',
  already_started: 'Запис уже почався',
  not_active: 'Запис уже неактивний',
  bad_interval: 'Інтервал — від 7 до 90 днів',
  bad_hours: 'Перевірте години роботи',
  bad_price: 'Перевірте ціну',
  bad_duration: 'Тривалість — від 5 до 480 хв',
  no_price: 'Вкажіть ціну хоча б для одного рівня',
  bad_photo: 'Посилання на фото має починатися з https://',
  bad_master: 'Оберіть майстра',
  self: 'Не можна змінити власний акаунт тут',
  future_booking: 'Цей запис ще не настав',
  server: 'Помилка сервера. Спробуйте ще раз',
  network: "Немає з'єднання з сервером",
};
const errText = (e) => ERRORS[e] || 'Щось пішло не так';

async function api(method, url, body) {
  try {
    const res = await fetch('/api' + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || 'server', ...data, status: res.status };
    return data;
  } catch {
    return { error: 'network' };
  }
}

function toast(text, type = '') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = 'toast is-shown ' + type;
  el.textContent = text;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('is-shown'), 3200);
}

// Кнопка-око в полях пароля
function initPasswordEyes(root = document) {
  $$('input[type="password"]', root).forEach((input) => {
    if (input.dataset.eye) return;
    input.dataset.eye = '1';
    const wrap = document.createElement('span');
    wrap.className = 'pass';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pass__eye';
    btn.setAttribute('aria-label', 'Показати пароль');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="pass__slash" d="M4 4l16 16"/></svg>';
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.classList.toggle('is-on', show);
      btn.setAttribute('aria-label', show ? 'Сховати пароль' : 'Показати пароль');
      input.focus();
    });
    wrap.appendChild(btn);
  });
}

// Шапка: бургер, тінь при скролі, посилання на акаунт
let ME = null;
async function initHeader() {
  const header = $('#header');
  if (!header) return null;
  const burger = $('.burger', header);
  const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  burger?.addEventListener('click', () => {
    const open = header.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', open);
    document.body.classList.toggle('no-scroll', open);
  });
  $$('.nav a', header).forEach((a) => a.addEventListener('click', () => {
    header.classList.remove('is-open');
    burger?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
  }));

  const r = await api('GET', '/auth/me');
  ME = r.user || null;
  const acc = $('.header__account', header);
  if (acc) {
    if (ME) {
      const staff = ME.role === 'admin' || ME.role === 'master';
      acc.href = staff ? '/admin' : '/account';
      acc.innerHTML = `<span class="avatar">${esc(ME.name[0] || '•')}</span><span class="header__account-name">${staff ? 'Панель' : 'Кабінет'}</span>`;
    } else {
      acc.href = '/login';
      acc.innerHTML = '<span class="header__account-name">Увійти</span>';
    }
  }
  return ME;
}

async function logout() {
  await api('POST', '/auth/logout', {});
  location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
  initPasswordEyes();
  const y = $('#year');
  if (y) y.textContent = new Date().getFullYear();
  $$('[data-logout]').forEach((b) => b.addEventListener('click', logout));
});
