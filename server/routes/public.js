// Публічне API: дані для сайту, вільні слоти, запис клієнта, кабінет
const express = require('express');
const { db } = require('../db');
const { requireAuth, publicUser } = require('../auth');
const { cleanText, kyivNow, addDays, daysBetween, ah } = require('../utils');
const B = require('../booking');

const router = express.Router();

const publicMaster = (m) => ({ id: m._id, name: m.name, tier: m.tier, photo: m.photo || '', skills: m.skills || [] });
const publicService = (s) => ({
  id: s._id, cat: s.cat, name: s.name, note: s.note || '', primeNote: s.primeNote || '', top: s.top || null, prime: s.prime || null,
});

router.get('/meta', ah(async (req, res) => {
  const [masters, services, h] = await Promise.all([
    db.masters.find({ active: true }, { sort: { order: 1 } }),
    db.services.find({ active: true }, { sort: { order: 1 } }),
    B.hours(),
  ]);
  const today = kyivNow().date;
  const days = Array.from({ length: B.MAX_DAYS_AHEAD + 1 }, (_, i) => addDays(today, i))
    .map((date) => ({ date, open: B.isOpen(h, date) }));
  res.json({
    masters: masters.map(publicMaster),
    services: services.map(publicService),
    hours: { open: h.open, close: h.close, days: h.days },
    days,
  });
}));

router.get('/slots', ah(async (req, res) => {
  const master = await db.masters.findOne({ _id: String(req.query.master || ''), active: true });
  const service = await db.services.findOne({ _id: String(req.query.service || '') });
  const o = offer(service, master);
  if (!o) return res.status(400).json({ error: 'bad_choice' });
  res.json({ slots: await B.freeSlots(master._id, String(req.query.date || ''), o.duration) });
}));

function offer(service, master) {
  return master && service ? B.offer(service, master.tier) : null;
}

// Простий замок, щоб два запити одночасно не зайняли один слот
let chain = Promise.resolve();
const locked = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

router.post('/bookings', requireAuth, ah(async (req, res) => {
  if (req.body?.agree !== true) return res.status(400).json({ error: 'agree_required' });
  const master = await db.masters.findOne({ _id: String(req.body?.masterId || ''), active: true });
  const service = await db.services.findOne({ _id: String(req.body?.serviceId || '') });
  const o = offer(service, master);
  if (!o) return res.status(400).json({ error: 'bad_choice' });
  const date = String(req.body?.date || '');
  const start = Number(req.body?.start);
  const comment = cleanText(req.body?.comment, 300);

  const result = await locked(async () => {
    const mine = await db.bookings.find({ userId: req.user._id });
    const today = kyivNow().date;
    if (mine.filter((b) => B.ACTIVE.includes(b.status) && b.date >= today).length >= B.MAX_ACTIVE_PER_CLIENT) {
      return { status: 409, body: { error: 'too_many_active', max: B.MAX_ACTIVE_PER_CLIENT } };
    }
    const slots = await B.freeSlots(master._id, date, o.duration);
    if (!slots.includes(start)) return { status: 409, body: { error: 'slot_taken' } };
    const booking = await db.bookings.insert({
      number: await B.nextNumber(),
      userId: req.user._id, clientName: req.user.name, clientPhone: req.user.phone,
      masterId: master._id, masterName: master.name, tier: master.tier,
      serviceId: service._id, serviceName: service.name,
      price: o.price, from: !!o.from, finalPrice: null, duration: o.duration,
      date, start, end: start + o.duration, comment,
      status: 'pending', source: 'site', createdAt: new Date().toISOString(),
    });
    return { status: 201, body: { booking: clientBooking(booking) } };
  });
  res.status(result.status).json(result.body);
}));

const clientBooking = (b) => ({
  id: b._id, number: b.number, masterName: b.masterName, tier: b.tier, serviceName: b.serviceName,
  price: b.finalPrice ?? b.price, from: b.finalPrice == null && b.from, duration: b.duration,
  date: b.date, start: b.start, time: B.fmtTime(b.start), status: b.status, comment: b.comment || '',
});

// Кабінет: записи, кількість візитів, таймер до наступної стрижки
router.get('/my', requireAuth, ah(async (req, res) => {
  const all = await db.bookings.find({ userId: req.user._id }, { sort: { date: -1, start: -1 } });
  const now = kyivNow();
  const done = all.filter((b) => b.status === 'done');
  const upcoming = all
    .filter((b) => B.ACTIVE.includes(b.status) && (b.date > now.date || (b.date === now.date && b.end > now.minutes)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  const last = done[0] || null;
  const interval = req.user.interval || 28;
  let timer = null;
  if (last) {
    const due = addDays(last.date, interval);
    timer = { lastVisit: last.date, nextDue: due, daysLeft: daysBetween(now.date, due), interval };
  }
  res.json({
    user: publicUser(req.user),
    visits: done.length,
    spent: done.reduce((s, b) => s + (b.finalPrice ?? b.price), 0),
    timer,
    upcoming: upcoming.map(clientBooking),
    history: all.filter((b) => !upcoming.includes(b)).map(clientBooking),
  });
}));

router.post('/my/bookings/:id/cancel', requireAuth, ah(async (req, res) => {
  const b = await db.bookings.findOne({ _id: String(req.params.id), userId: req.user._id });
  if (!b) return res.status(404).json({ error: 'not_found' });
  if (!B.ACTIVE.includes(b.status)) return res.status(400).json({ error: 'not_active' });
  const now = kyivNow();
  if (b.date < now.date || (b.date === now.date && b.start <= now.minutes)) return res.status(400).json({ error: 'already_started' });
  await db.bookings.update({ _id: b._id }, { status: 'cancelled', cancelledBy: 'client', updatedAt: new Date().toISOString() });
  res.json({ ok: true });
}));

module.exports = router;
