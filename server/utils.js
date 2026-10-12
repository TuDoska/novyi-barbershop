// Допоміжні функції
const TZ = 'Europe/Kyiv';

// Чистий текст: без керівних символів і тегів, обрізаний до max
function cleanText(v, max = 200) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Поточні дата й хвилини від півночі за Києвом
function kyivNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const weekday = (date) => new Date(date + 'T00:00:00Z').getUTCDay(); // 0 = неділя

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const DAY = 24 * 60 * 60 * 1000;

module.exports = { TZ, cleanText, kyivNow, isDate, addDays, daysBetween, weekday, ah, DAY };
