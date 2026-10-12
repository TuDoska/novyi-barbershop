// Логіка запису: графік кожного майстра, перерва між клієнтами, вільні слоти (усе рахує сервер)
const { db } = require('./db');
const { kyivNow, isDate, addDays, weekday } = require('./utils');

const ACTIVE = ['pending', 'confirmed'];
const STATUSES = ['pending', 'confirmed', 'done', 'noshow', 'cancelled'];
const MAX_DAYS_AHEAD = 30;
const LEAD_MINUTES = 30; // не раніше ніж за 30 хв від зараз
const MAX_ACTIVE_PER_CLIENT = 2;
const BUFFERS = [0, 5, 10, 15, 20, 30];
const DEFAULT_BUFFER = 10;

// Загальні налаштування салону: крок сітки запису + дні, коли зачинено весь барбершоп
const salon = async () => db.settings.findOne({ _id: 'hours' });

// Тижневий графік за замовчуванням: щодня 10:00–20:00 (ключ — день тижня, 0 = неділя)
const defaultSchedule = () => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { on: true, open: 600, close: 1200 }]));

// Майстер з графіком (старі записи в базі без графіка отримують типовий)
function withSchedule(m) {
  if (!m) return null;
  return {
    ...m,
    schedule: m.schedule || defaultSchedule(),
    closedDates: m.closedDates || [],
    buffer: BUFFERS.includes(m.buffer) ? m.buffer : DEFAULT_BUFFER,
  };
}

function offer(service, tier) {
  const o = service?.[tier];
  return o && service.active ? o : null;
}

// Години майстра на конкретну дату або null, якщо вихідний
function dayHours(master, s, date) {
  if ((s.closedDates || []).includes(date)) return null;
  const m = withSchedule(master);
  if (m.closedDates.includes(date)) return null;
  const d = m.schedule[weekday(date)];
  return d && d.on && d.close > d.open ? d : null;
}

// Дні на 30 днів уперед: працює майстер чи ні
function masterDays(master, s) {
  const today = kyivNow().date;
  return Array.from({ length: MAX_DAYS_AHEAD + 1 }, (_, i) => addDays(today, i))
    .map((date) => ({ date, open: !!dayHours(master, s, date) }));
}

// Вільні початки (у хвилинах). Кожен запис займає [початок, кінець + перерва майстра).
async function freeSlots(masterId, date, duration, ignoreBookingId = null) {
  const [master, s] = await Promise.all([db.masters.findOne({ _id: masterId }), salon()]);
  const now = kyivNow();
  if (!master || !isDate(date) || date < now.date || date > addDays(now.date, MAX_DAYS_AHEAD)) return [];
  const h = dayHours(master, s, date);
  if (!h) return [];
  const buffer = withSchedule(master).buffer;
  const busy = (await db.bookings.find({ masterId, date }))
    .filter((b) => ACTIVE.includes(b.status) && b._id !== ignoreBookingId);
  const slots = [];
  for (let t = h.open; t + duration <= h.close; t += s.step) {
    if (date === now.date && t < now.minutes + LEAD_MINUTES) continue;
    if (busy.some((b) => t < b.end + buffer && b.start < t + duration + buffer)) continue;
    slots.push(t);
  }
  return slots;
}

const fmtTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

async function nextNumber() {
  await db.counters.inc({ _id: 'booking' }, { seq: 1 });
  return (await db.counters.findOne({ _id: 'booking' })).seq;
}

module.exports = {
  ACTIVE, STATUSES, MAX_DAYS_AHEAD, MAX_ACTIVE_PER_CLIENT, BUFFERS, DEFAULT_BUFFER,
  salon, defaultSchedule, withSchedule, offer, dayHours, masterDays, freeSlots, fmtTime, nextNumber,
};
