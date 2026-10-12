// Адмінка: записи (адмін + майстри), заробіток, клієнти, послуги, майстри, графік
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireStaff, requireAdmin, normalizePhone, publicUser } = require('../auth');
const { cleanText, kyivNow, isDate, addDays, ah } = require('../utils');
const B = require('../booking');

const router = express.Router();
router.use(requireStaff);

const isAdmin = (req) => req.user.role === 'admin';
// Майстер бачить і змінює лише свої записи
const scope = (req) => (isAdmin(req) ? {} : { masterId: req.user.masterId || '__none__' });

const staffBooking = (b) => ({
  id: b._id, number: b.number, clientName: b.clientName, clientPhone: b.clientPhone, userId: b.userId || null,
  masterId: b.masterId, masterName: b.masterName, tier: b.tier, serviceId: b.serviceId, serviceName: b.serviceName,
  price: b.price, from: !!b.from, finalPrice: b.finalPrice ?? null, duration: b.duration,
  date: b.date, start: b.start, end: b.end, time: B.fmtTime(b.start), status: b.status,
  comment: b.comment || '', source: b.source, createdAt: b.createdAt,
});

router.get('/bookings', ah(async (req, res) => {
  const today = kyivNow().date;
  const from = isDate(req.query.from) ? req.query.from : today;
  const to = isDate(req.query.to) ? req.query.to : from;
  const q = { ...scope(req) };
  if (req.query.master && isAdmin(req)) q.masterId = String(req.query.master);
  const list = (await db.bookings.find(q))
    .filter((b) => b.date >= from && b.date <= to)
    .filter((b) => !req.query.status || b.status === req.query.status)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  const pending = (await db.bookings.find({ ...scope(req), status: 'pending' })).filter((b) => b.date >= today).length;
  res.json({ bookings: list.map(staffBooking), pending, today });
}));

router.patch('/bookings/:id', ah(async (req, res) => {
  const b = await db.bookings.findOne({ _id: String(req.params.id), ...scope(req) });
  if (!b) return res.status(404).json({ error: 'not_found' });
  const set = { updatedAt: new Date().toISOString() };
  if (req.body?.status !== undefined) {
    if (!B.STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'bad_status' });
    set.status = req.body.status;
    // «Виконано» / «Не прийшов» — лише для записів, день яких уже настав
    if (['done', 'noshow'].includes(set.status) && b.date > kyivNow().date) return res.status(400).json({ error: 'future_booking' });
    if (set.status === 'done') set.doneAt = new Date().toISOString();
    if (set.status === 'cancelled') set.cancelledBy = req.user.role;
    // Повернути скасований запис можна, лише якщо час досі вільний
    if (B.ACTIVE.includes(set.status) && !B.ACTIVE.includes(b.status)) {
      const free = await B.freeSlots(b.masterId, b.date, b.duration, b._id);
      if (!free.includes(b.start)) return res.status(409).json({ error: 'slot_taken' });
    }
  }
  if (req.body?.finalPrice !== undefined) {
    const fp = req.body.finalPrice === null ? null : Number(req.body.finalPrice);
    if (fp !== null && (!Number.isFinite(fp) || fp < 0 || fp > 100000)) return res.status(400).json({ error: 'bad_price' });
    set.finalPrice = fp === null ? null : Math.round(fp);
  }
  await db.bookings.update({ _id: b._id }, set);
  res.json({ booking: staffBooking({ ...b, ...set }) });
}));

// Запис по телефону / «з вулиці» — створює адмін або майстер
router.post('/bookings', ah(async (req, res) => {
  const masterId = isAdmin(req) ? String(req.body?.masterId || '') : req.user.masterId;
  const master = await db.masters.findOne({ _id: masterId || '__none__', active: true });
  const service = await db.services.findOne({ _id: String(req.body?.serviceId || '') });
  const o = master && service ? B.offer(service, master.tier) : null;
  if (!o) return res.status(400).json({ error: 'bad_choice' });
  const clientName = cleanText(req.body?.clientName, 40);
  const clientPhone = normalizePhone(req.body?.clientPhone);
  if (clientName.length < 2) return res.status(400).json({ error: 'bad_name' });
  if (!clientPhone) return res.status(400).json({ error: 'bad_phone' });
  const date = String(req.body?.date || '');
  const start = Number(req.body?.start);
  const slots = await B.freeSlots(master._id, date, o.duration);
  if (!slots.includes(start)) return res.status(409).json({ error: 'slot_taken' });
  const user = await db.users.findOne({ phone: clientPhone });
  const booking = await db.bookings.insert({
    number: await B.nextNumber(), userId: user?._id || null, clientName, clientPhone,
    masterId: master._id, masterName: master.name, tier: master.tier,
    serviceId: service._id, serviceName: service.name,
    price: o.price, from: !!o.from, finalPrice: null, duration: o.duration,
    date, start, end: start + o.duration, comment: cleanText(req.body?.comment, 300),
    status: 'confirmed', source: req.user.role, createdAt: new Date().toISOString(),
  });
  res.status(201).json({ booking: staffBooking(booking) });
}));

/* ---------- Далі — лише адмін ---------- */
router.use(requireAdmin);

const sumOf = (list) => list.reduce((s, b) => s + (b.finalPrice ?? b.price), 0);

router.get('/earnings', ah(async (req, res) => {
  const today = kyivNow().date;
  const done = await db.bookings.find({ status: 'done' });
  const inRange = (from, to) => done.filter((b) => b.date >= from && b.date <= to);
  const monthStart = today.slice(0, 8) + '01';
  const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7; // пн = 0
  const weekStart = addDays(today, -dow);

  const from = isDate(req.query.from) ? req.query.from : addDays(today, -29);
  const to = isDate(req.query.to) ? req.query.to : today;
  const range = inRange(from, to);

  const series = [];
  for (let d = from; d <= to && series.length < 370; d = addDays(d, 1)) {
    const day = range.filter((b) => b.date === d);
    series.push({ date: d, total: sumOf(day), count: day.length });
  }
  const group = (key, label) => Object.values(range.reduce((acc, b) => {
    const k = b[key];
    acc[k] ||= { id: k, name: b[label], total: 0, count: 0 };
    acc[k].total += b.finalPrice ?? b.price;
    acc[k].count += 1;
    return acc;
  }, {})).sort((a, b) => b.total - a.total);

  const all = await db.bookings.find({});
  const rangeAll = all.filter((b) => b.date >= from && b.date <= to && b.date <= today);
  res.json({
    today: sumOf(inRange(today, today)),
    week: sumOf(inRange(weekStart, today)),
    month: sumOf(inRange(monthStart, today)),
    range: { from, to, total: sumOf(range), count: range.length, avg: range.length ? Math.round(sumOf(range) / range.length) : 0 },
    noshow: rangeAll.filter((b) => b.status === 'noshow').length,
    cancelled: rangeAll.filter((b) => b.status === 'cancelled').length,
    series,
    byMaster: group('masterId', 'masterName'),
    byService: group('serviceId', 'serviceName'),
  });
}));

router.get('/clients', ah(async (req, res) => {
  const q = cleanText(req.query.q, 40).toLowerCase();
  const [users, bookings] = await Promise.all([db.users.find({}), db.bookings.find({})]);
  const list = users
    .filter((u) => !q || u.name.toLowerCase().includes(q) || u.phone.includes(q.replace(/\D/g, '') || '¤'))
    .map((u) => {
      const mine = bookings.filter((b) => b.userId === u._id);
      const done = mine.filter((b) => b.status === 'done').sort((a, b) => b.date.localeCompare(a.date));
      return {
        ...publicUser(u), blocked: !!u.blocked, visits: done.length, spent: sumOf(done),
        lastVisit: done[0]?.date || null, noshow: mine.filter((b) => b.status === 'noshow').length,
      };
    })
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
  res.json({ clients: list });
}));

router.patch('/clients/:id', ah(async (req, res) => {
  const u = await db.users.findOne({ _id: String(req.params.id) });
  if (!u) return res.status(404).json({ error: 'not_found' });
  if (u._id === req.user._id) return res.status(400).json({ error: 'self' });
  const set = {};
  if (typeof req.body?.blocked === 'boolean') set.blocked = req.body.blocked;
  if (req.body?.role !== undefined) {
    const { role, masterId } = req.body;
    if (!['client', 'master', 'admin'].includes(role)) return res.status(400).json({ error: 'bad_role' });
    if (role === 'master' && !(await db.masters.findOne({ _id: String(masterId || '') }))) return res.status(400).json({ error: 'bad_master' });
    set.role = role;
    set.masterId = role === 'master' ? String(masterId) : null;
  }
  await db.users.update({ _id: u._id }, set);
  res.json({ ok: true });
}));

// Акаунт для майстра (адмін задає тимчасовий пароль)
router.post('/staff', ah(async (req, res) => {
  const name = cleanText(req.body?.name, 40);
  const phone = normalizePhone(req.body?.phone);
  const { password } = req.body || {};
  const master = await db.masters.findOne({ _id: String(req.body?.masterId || '') });
  if (name.length < 2) return res.status(400).json({ error: 'bad_name' });
  if (!phone) return res.status(400).json({ error: 'bad_phone' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) return res.status(400).json({ error: 'bad_password' });
  if (!master) return res.status(400).json({ error: 'bad_master' });
  if (await db.users.findOne({ phone })) return res.status(409).json({ error: 'phone_taken' });
  const user = await db.users.insert({
    name, phone, role: 'master', masterId: master._id, passHash: await bcrypt.hash(password, 12),
    tokenVersion: 0, interval: 28, createdAt: new Date().toISOString(),
  });
  res.status(201).json({ user: publicUser(user) });
}));

/* ---------- Послуги ---------- */
const CATS = ['hair', 'combo', 'beard', 'camo', 'art', 'care'];

function parseOffer(o) {
  if (o === null || o === undefined || o === false) return null;
  const price = Math.round(Number(o.price));
  const duration = Math.round(Number(o.duration));
  if (!Number.isFinite(price) || price < 0 || price > 100000) throw new Error('bad_price');
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) throw new Error('bad_duration');
  return { price, duration, from: !!o.from };
}

function serviceFields(body) {
  const name = cleanText(body?.name, 80);
  if (name.length < 2) throw new Error('bad_name');
  if (!CATS.includes(body?.cat)) throw new Error('bad_cat');
  const top = parseOffer(body.top);
  const prime = parseOffer(body.prime);
  if (!top && !prime) throw new Error('no_price');
  return {
    name, cat: body.cat, top, prime, note: cleanText(body.note, 120), primeNote: cleanText(body.primeNote, 120),
    active: body.active !== false, order: Number.isFinite(Number(body.order)) ? Number(body.order) : 99,
  };
}

const sendErr = (res, e) => res.status(400).json({ error: e.message });

router.get('/services', ah(async (req, res) => res.json({ services: await db.services.find({}, { sort: { order: 1 } }) })));
router.post('/services', ah(async (req, res) => {
  let f; try { f = serviceFields(req.body); } catch (e) { return sendErr(res, e); }
  res.status(201).json({ service: await db.services.insert(f) });
}));
router.put('/services/:id', ah(async (req, res) => {
  const s = await db.services.findOne({ _id: String(req.params.id) });
  if (!s) return res.status(404).json({ error: 'not_found' });
  let f; try { f = serviceFields(req.body); } catch (e) { return sendErr(res, e); }
  await db.services.update({ _id: s._id }, f);
  res.json({ service: { ...s, ...f } });
}));

/* ---------- Майстри ---------- */
function masterFields(body) {
  const name = cleanText(body?.name, 40);
  if (name.length < 2) throw new Error('bad_name');
  if (!['top', 'prime'].includes(body?.tier)) throw new Error('bad_tier');
  const photo = typeof body.photo === 'string' ? body.photo.trim().slice(0, 600) : '';
  if (photo && !/^https:\/\/[^\s"'<>]+$/.test(photo)) throw new Error('bad_photo');
  const skills = Array.isArray(body.skills) ? body.skills.map((x) => cleanText(x, 40)).filter(Boolean).slice(0, 6) : [];
  return { name, tier: body.tier, photo, skills, active: body.active !== false, order: Number(body.order) || 99 };
}

router.get('/masters', ah(async (req, res) => res.json({ masters: await db.masters.find({}, { sort: { order: 1 } }) })));
router.post('/masters', ah(async (req, res) => {
  let f; try { f = masterFields(req.body); } catch (e) { return sendErr(res, e); }
  res.status(201).json({ master: await db.masters.insert(f) });
}));
router.put('/masters/:id', ah(async (req, res) => {
  const m = await db.masters.findOne({ _id: String(req.params.id) });
  if (!m) return res.status(404).json({ error: 'not_found' });
  let f; try { f = masterFields(req.body); } catch (e) { return sendErr(res, e); }
  await db.masters.update({ _id: m._id }, f);
  res.json({ master: { ...m, ...f } });
}));

/* ---------- Графік ---------- */
router.get('/hours', ah(async (req, res) => res.json({ hours: await B.hours() })));
router.put('/hours', ah(async (req, res) => {
  const open = Number(req.body?.open);
  const close = Number(req.body?.close);
  const step = Number(req.body?.step);
  const days = Array.isArray(req.body?.days) ? [...new Set(req.body.days.map(Number))].filter((d) => d >= 0 && d <= 6) : null;
  const closedDates = Array.isArray(req.body?.closedDates) ? [...new Set(req.body.closedDates.filter(isDate))].slice(0, 100) : [];
  if (!Number.isInteger(open) || !Number.isInteger(close) || open < 0 || close > 1440 || open >= close) return res.status(400).json({ error: 'bad_hours' });
  if (![15, 20, 30, 60].includes(step)) return res.status(400).json({ error: 'bad_step' });
  if (!days) return res.status(400).json({ error: 'bad_days' });
  const hours = { open, close, step, days, closedDates };
  await db.settings.update({ _id: 'hours' }, hours);
  res.json({ hours });
}));

module.exports = router;
