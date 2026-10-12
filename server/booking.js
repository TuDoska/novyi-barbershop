// Логіка запису: вільні слоти, перевірки, ціна (усе рахує сервер)
const { db } = require('./db');
const { kyivNow, isDate, addDays, weekday } = require('./utils');

const ACTIVE = ['pending', 'confirmed'];
const STATUSES = ['pending', 'confirmed', 'done', 'noshow', 'cancelled'];
const MAX_DAYS_AHEAD = 30;
const LEAD_MINUTES = 30; // не раніше ніж за 30 хв від зараз
const MAX_ACTIVE_PER_CLIENT = 2;

const hours = async () => db.settings.findOne({ _id: 'hours' });

// Ціна й тривалість послуги для рівня майстра
function offer(service, tier) {
  const o = service?.[tier];
  return o && service.active ? o : null;
}

function isOpen(h, date) {
  return h.days.includes(weekday(date)) && !(h.closedDates || []).includes(date);
}

// Вільні початки (у хвилинах) для майстра, дати й тривалості
async function freeSlots(masterId, date, duration, ignoreBookingId = null) {
  const h = await hours();
  const now = kyivNow();
  if (!isDate(date) || date < now.date || date > addDays(now.date, MAX_DAYS_AHEAD)) return [];
  if (!isOpen(h, date)) return [];
  const busy = (await db.bookings.find({ masterId, date }))
    .filter((b) => ACTIVE.includes(b.status) && b._id !== ignoreBookingId);
  const slots = [];
  for (let t = h.open; t + duration <= h.close; t += h.step) {
    if (date === now.date && t < now.minutes + LEAD_MINUTES) continue;
    if (busy.some((b) => t < b.end && b.start < t + duration)) continue;
    slots.push(t);
  }
  return slots;
}

const fmtTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

async function nextNumber() {
  await db.counters.inc({ _id: 'booking' }, { seq: 1 });
  return (await db.counters.findOne({ _id: 'booking' })).seq;
}

module.exports = { ACTIVE, STATUSES, MAX_DAYS_AHEAD, MAX_ACTIVE_PER_CLIENT, hours, offer, isOpen, freeSlots, fmtTime, nextNumber };
