// Інтеграційні тести: npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'novyi-test-'));
process.env.NODE_ENV = 'test';
process.env.ADMIN_PHONE = '+380739012596';
const { createApp } = require('../server/index');
const { kyivNow, addDays } = require('../server/utils');

function client(base) {
  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return {
    get: (u) => call('GET', u), post: (u, b, h) => call('POST', u, b, h), patch: (u, b) => call('PATCH', u, b), put: (u, b) => call('PUT', u, b),
    cookie: () => cookie, setCookie: (c) => { cookie = c; },
  };
}

(async () => {
  const { server } = await createApp();
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const results = [];
  const test = async (name, fn) => { try { await fn(); results.push(['✔', name]); } catch (e) { results.push(['✘', name, e.stack.split('\n').slice(0, 2).join(' ')]); } };

  const admin = client(base);
  const ivan = client(base);
  const petro = client(base);
  const guest = client(base);
  const tomorrow = addDays(kyivNow().date, 1);
  const meta = (await guest.get('/api/meta')).body;
  const haircut = meta.services.find((s) => s.name === 'Чоловіча стрижка');
  const perm = meta.services.find((s) => s.name === 'Біозавивка Sensus');

  await test('реєстрація: валідація, адмін за ADMIN_PHONE, зайнятий номер', async () => {
    assert.strictEqual((await guest.post('/api/auth/register', { name: 'Іван', phone: '123', password: 'secret123', agree: true })).body.error, 'bad_phone');
    assert.strictEqual((await guest.post('/api/auth/register', { name: 'Іван', phone: '0671234567', password: 'short', agree: true })).body.error, 'bad_password');
    assert.strictEqual((await guest.post('/api/auth/register', { name: 'Іван', phone: '0671234567', password: 'secret123' })).body.error, 'agree_required');
    const a = await admin.post('/api/auth/register', { name: 'Власниця', phone: '073 901 25 96', password: 'adminpass1', agree: true });
    assert.strictEqual(a.body.user.role, 'admin');
    const i = await ivan.post('/api/auth/register', { name: 'Іван', phone: '+38 (067) 123-45-67', password: 'secret123', agree: true });
    assert.strictEqual(i.status, 201);
    assert.strictEqual(i.body.user.phone, '+380671234567');
    assert.strictEqual(i.body.user.role, 'client');
    assert.strictEqual((await guest.post('/api/auth/register', { name: 'Хтось', phone: '0671234567', password: 'secret123', agree: true })).status, 409);
    await petro.post('/api/auth/register', { name: 'Петро', phone: '0501112233', password: 'secret123', agree: true });
  });

  await test('дані сайту: 3 майстри, 14 послуг, Top не має біозавивки', async () => {
    assert.strictEqual(meta.masters.length, 3);
    assert.strictEqual(meta.services.length, 14);
    assert.strictEqual(perm.top, null);
    assert.ok(meta.masters.every((m) => m.days.length === 31 && m.days.every((d) => d.open)));
    assert.strictEqual(meta.week.length, 7);
  });

  let bookingId;
  await test('запис: тільки з акаунтом, ціна з сервера, слот стає зайнятим', async () => {
    const body = { masterId: 'veronika', serviceId: haircut.id, date: tomorrow, start: 600, agree: true, price: 1 };
    assert.strictEqual((await guest.post('/api/bookings', body)).status, 401);
    const r = await ivan.post('/api/bookings', body);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.booking.price, 550);
    assert.strictEqual(r.body.booking.status, 'pending');
    bookingId = r.body.booking.id;
    const slots = (await guest.get(`/api/slots?master=veronika&service=${haircut.id}&date=${tomorrow}`)).body.slots;
    assert.ok(!slots.includes(600) && !slots.includes(630));
    assert.ok(!slots.includes(660) && slots.includes(690), 'перерва 10 хв після запису');
    assert.strictEqual((await petro.post('/api/bookings', { ...body, start: 630 })).body.error, 'slot_taken');
    assert.strictEqual((await petro.post('/api/bookings', { ...body, masterId: 'zoriana' })).body.booking.price, 600);
  });

  await test('запис: недоступна послуга, минулий час, ліміт 2 активних', async () => {
    assert.strictEqual((await ivan.post('/api/bookings', { masterId: 'veronika', serviceId: perm.id, date: tomorrow, start: 720, agree: true })).body.error, 'bad_choice');
    assert.strictEqual((await ivan.post('/api/bookings', { masterId: 'veronika', serviceId: haircut.id, date: addDays(tomorrow, -2), start: 720, agree: true })).body.error, 'slot_taken');
    assert.strictEqual((await ivan.post('/api/bookings', { masterId: 'veronika', serviceId: haircut.id, date: tomorrow, start: 615, agree: true })).body.error, 'slot_taken');
    assert.strictEqual((await ivan.post('/api/bookings', { masterId: 'veronika', serviceId: haircut.id, date: tomorrow, start: 720, agree: true })).status, 201);
    assert.strictEqual((await ivan.post('/api/bookings', { masterId: 'veronika', serviceId: haircut.id, date: tomorrow, start: 840, agree: true })).body.error, 'too_many_active');
  });

  await test('ролі: клієнт не має доступу до адмінки, майстер бачить лише свої записи', async () => {
    assert.strictEqual((await ivan.get('/api/admin/bookings')).status, 403);
    assert.strictEqual((await guest.get('/api/admin/earnings')).status, 403);
    const s = await admin.post('/api/admin/staff', { name: 'Вероніка', phone: '0991234567', password: 'master123', masterId: 'veronika' });
    assert.strictEqual(s.status, 201);
    const vera = client(base);
    await vera.post('/api/auth/login', { phone: '0991234567', password: 'master123' });
    const list = (await vera.get(`/api/admin/bookings?from=${tomorrow}&to=${tomorrow}`)).body.bookings;
    assert.ok(list.length === 2 && list.every((b) => b.masterId === 'veronika'));
    assert.strictEqual((await vera.get('/api/admin/earnings')).status, 403);
    const other = (await admin.get(`/api/admin/bookings?from=${tomorrow}&to=${tomorrow}`)).body.bookings.find((b) => b.masterId === 'zoriana');
    assert.strictEqual((await vera.patch('/api/admin/bookings/' + other.id, { status: 'done' })).status, 404);
  });

  await test('виконано → візит, заробіток, таймер у кабінеті', async () => {
    assert.strictEqual((await admin.patch('/api/admin/bookings/' + bookingId, { status: 'done' })).body.error, 'future_booking');
    // Імітуємо, що день візиту настав: переносимо запис на сьогодні напряму в базі
    const { db } = require('../server/db');
    await db.bookings.update({ _id: bookingId }, { date: kyivNow().date });
    const r = await admin.patch('/api/admin/bookings/' + bookingId, { status: 'done', finalPrice: 600 });
    assert.strictEqual(r.body.booking.status, 'done');
    const my = (await ivan.get('/api/my')).body;
    assert.strictEqual(my.visits, 1);
    assert.strictEqual(my.spent, 600);
    assert.strictEqual(my.timer.daysLeft, 28);
    await ivan.patch('/api/auth/interval', { days: 21 });
    assert.strictEqual((await ivan.get('/api/my')).body.timer.daysLeft, 21);
    const e = (await admin.get('/api/admin/earnings')).body;
    assert.strictEqual(e.today, 600);
    assert.strictEqual(e.range.total, 600);
    assert.strictEqual(e.byMaster[0].name, 'Вероніка');
  });

  await test('кабінет: скасування свого запису, чужий не можна', async () => {
    const my = (await ivan.get('/api/my')).body;
    const up = my.upcoming[0];
    assert.strictEqual((await petro.post(`/api/my/bookings/${up.id}/cancel`)).status, 404);
    assert.strictEqual((await ivan.post(`/api/my/bookings/${up.id}/cancel`)).body.ok, true);
  });

  await test("ім'я та телефон — раз на добу, телефон з паролем", async () => {
    assert.strictEqual((await ivan.patch('/api/auth/name', { name: 'Іван Петрович' })).body.user.name, 'Іван Петрович');
    assert.strictEqual((await ivan.patch('/api/auth/name', { name: 'Іван П.' })).body.error, 'too_soon');
    assert.strictEqual((await ivan.patch('/api/auth/phone', { phone: '0670000000', password: 'wrong' })).body.error, 'bad_password');
    assert.strictEqual((await ivan.patch('/api/auth/phone', { phone: '0501112233', password: 'secret123' })).body.error, 'phone_taken');
    assert.strictEqual((await ivan.patch('/api/auth/phone', { phone: '0670000000', password: 'secret123' })).body.user.phone, '+380670000000');
    assert.strictEqual((await ivan.patch('/api/auth/phone', { phone: '0670000001', password: 'secret123' })).body.error, 'too_soon');
  });

  await test('зміна пароля: новий + повтор, старі сесії виходять', async () => {
    const second = client(base);
    await second.post('/api/auth/login', { phone: '0670000000', password: 'secret123' });
    assert.ok((await second.get('/api/auth/me')).body.user);
    assert.strictEqual((await ivan.patch('/api/auth/password', { password: 'newpass123', repeat: 'newpass12' })).body.error, 'mismatch');
    assert.strictEqual((await ivan.patch('/api/auth/password', { password: 'newpass123', repeat: 'newpass123' })).body.ok, true);
    assert.ok((await ivan.get('/api/auth/me')).body.user, 'поточна сесія лишається');
    assert.strictEqual((await second.get('/api/auth/me')).body.user, null);
    assert.strictEqual((await guest.post('/api/auth/login', { phone: '0670000000', password: 'secret123' })).status, 401);
  });

  await test('захист: блок після 5 невдалих входів, CSRF, ін’єкції', async () => {
    const x = client(base);
    for (let i = 0; i < 5; i++) await x.post('/api/auth/login', { phone: '0501112233', password: 'bad' });
    assert.strictEqual((await x.post('/api/auth/login', { phone: '0501112233', password: 'secret123' })).body.error, 'locked');
    assert.strictEqual((await x.post('/api/auth/login', { phone: { $ne: '' }, password: 'x' })).status, 400);
    assert.strictEqual((await ivan.post('/api/auth/logout', {}, { Origin: 'https://evil.example' })).status, 403);
    const n = await admin.patch('/api/auth/name', { name: '<script>alert(1)</script>Олена' });
    assert.ok(!n.body.user.name.includes('<'));
  });

  await test('адмін: послуги, майстри, графік, запис по телефону', async () => {
    const s = await admin.post('/api/admin/services', { name: 'Тонування бороди', cat: 'beard', top: { price: 300, duration: 30 }, prime: null });
    assert.strictEqual(s.status, 201);
    assert.strictEqual((await admin.post('/api/admin/services', { name: 'X', cat: 'beard' })).status, 400);
    // Вихідний день усього салону
    assert.strictEqual((await admin.put('/api/admin/salon', { step: 30, closedDates: [tomorrow] })).status, 200);
    assert.deepStrictEqual((await guest.get(`/api/slots?master=zoriana&service=${haircut.id}&date=${tomorrow}`)).body.slots, []);
    await admin.put('/api/admin/salon', { step: 30, closedDates: [] });
    const w = await admin.post('/api/admin/bookings', { masterId: 'solomiia', serviceId: haircut.id, date: tomorrow, start: 900, clientName: 'Андрій', clientPhone: '0631231231' });
    assert.strictEqual(w.body.booking.status, 'confirmed');
    const a = client(base);
    await a.post('/api/auth/register', { name: 'Андрій', phone: '0631231231', password: 'secret123', agree: true });
    assert.strictEqual((await a.get('/api/my')).body.upcoming.length, 1, 'запис привʼязується після реєстрації');
  });

  await test('графік майстра: свої дні й години, перерва, права, попередження', async () => {
    const vera = client(base);
    await vera.post('/api/auth/login', { phone: '0991234567', password: 'master123' });
    const cur = (await vera.get('/api/admin/schedule/veronika')).body.schedule;
    assert.strictEqual(cur.buffer, 10);
    assert.strictEqual((await vera.get('/api/admin/schedule/zoriana')).status, 403, 'чужий графік не можна');
    assert.strictEqual((await vera.put('/api/admin/schedule/zoriana', { week: cur.week, buffer: 0 })).status, 403);
    assert.strictEqual((await ivan.get('/api/admin/schedule/veronika')).status, 403);

    await admin.post('/api/admin/bookings', { masterId: 'veronika', serviceId: haircut.id, date: tomorrow, start: 600, clientName: 'Олег', clientPhone: '0631110000' });
    // Вероніка: завтра працює 12:00–16:00, перерва 30 хв
    const wd = new Date(tomorrow + 'T00:00:00Z').getUTCDay();
    const week = { ...cur.week, [wd]: { on: true, open: 720, close: 960 } };
    const r = await vera.put('/api/admin/schedule/veronika', { week, buffer: 30, closedDates: [] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.conflicts.length >= 1, 'є записи до 12:00, які тепер поза графіком');
    const slots = (await guest.get(`/api/slots?master=veronika&service=${haircut.id}&date=${tomorrow}`)).body.slots;
    assert.strictEqual(slots[0] >= 720, true);
    assert.ok(slots.every((t) => t + 60 <= 960));
    assert.strictEqual((await vera.put('/api/admin/schedule/veronika', { week: { ...week, [wd]: { on: true, open: 900, close: 800 } }, buffer: 30 })).body.error, 'bad_hours');
    assert.strictEqual((await vera.put('/api/admin/schedule/veronika', { week, buffer: 7 })).body.error, 'bad_buffer');

    // Вихідний день майстра
    const off = { ...week, [wd]: { on: false, open: 720, close: 960 } };
    await admin.put('/api/admin/schedule/veronika', { week: off, buffer: 30, closedDates: [] });
    assert.deepStrictEqual((await guest.get(`/api/slots?master=veronika&service=${haircut.id}&date=${tomorrow}`)).body.slots, []);
    const m = (await guest.get('/api/meta')).body.masters.find((x) => x.id === 'veronika');
    assert.strictEqual(m.days.find((d) => d.date === tomorrow).open, false);

    // Відпустка на конкретну дату
    const after = addDays(tomorrow, 1);
    await admin.put('/api/admin/schedule/zoriana', { week: cur.week, buffer: 10, closedDates: [after] });
    assert.deepStrictEqual((await guest.get(`/api/slots?master=zoriana&service=${haircut.id}&date=${after}`)).body.slots, []);
  });

  server.close();
  for (const r of results) console.log(r.join('  '));
  const failed = results.filter((r) => r[0] === '✘').length;
  console.log(failed ? `\n${failed} тест(ів) не пройшло` : `\nУсі ${results.length} тестів пройшли`);
  process.exit(failed ? 1 : 0);
})();
