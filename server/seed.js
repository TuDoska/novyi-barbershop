// Початкові дані: майстри, послуги та графік з офіційної сторінки барбершопу
const { db } = require('./db');

const IMG = 'https://imprx.easyweek.io/_/rs:fill:800:1000:1:0/dpr:1/';

const MASTERS = [
  { _id: 'zoriana', name: 'Зоряна', tier: 'prime', order: 1, skills: ['Стрижки й борода', 'Камуфлювання', 'Біозавивка та колір'],
    photo: IMG + 'aHR0cHM6Ly9zdG9yYWdlMi5lYXN5d2Vlay5pby9wcm9jZXNzZWQvaW1hZ2VzLzIwMjYtMDktMjgvMzliOTAwY2JhZjlhMjEzMGFmYmZlMGU4ZTgzYjIyZTJiNGU0ODkzYzliYmM1ODBhN2EzZmMzOWM4MTk4ZDYyNl84MDB4ODAwLnBuZw.webp' },
  { _id: 'solomiia', name: 'Соломія', tier: 'prime', order: 2, skills: ['Стрижки й борода', 'Камуфлювання', 'Біозавивка та колір'],
    photo: IMG + 'aHR0cHM6Ly9zdG9yYWdlMi5lYXN5d2Vlay5pby9wcm9jZXNzZWQvaW1hZ2VzLzIwMjYtMDktMjgvZjc4YTFkOTE5ZTdjMTdmY2I4ZjQ5Yzg3ZGU0MjY1YTgxMzI0ZDVmZTViZjI0YzZmNzE2ZjZmODYxMjZiYjIwN184MDB4ODAwLnBuZw.webp' },
  { _id: 'veronika', name: 'Вероніка', tier: 'top', order: 3, skills: ['Стрижки й борода', 'Камуфлювання', 'Укладка'],
    photo: IMG + 'aHR0cHM6Ly9zdG9yYWdlMi5lYXN5d2Vlay5pby9wcm9jZXNzZWQvaW1hZ2VzLzIwMjYtMDktMzAvZWRkYjdlOWFkOWNmOTkzZTAyM2ExYzE0ZDVlZmM0ODQzNmI0YjMxYjAyYzdkMDMyNzEyMjJjOWJjYzRiNmZhOV84MDB4ODAwLnBuZw.webp' },
];

// top / prime: { price, duration (хв), from: ціна «від» }
const S = (cat, name, top, prime, extra = {}) => ({ cat, name, top, prime, ...extra });
const p = (price, duration, from = false) => ({ price, duration, from });

const SERVICES = [
  S('hair', 'Чоловіча стрижка', p(550, 60), p(600, 60)),
  S('hair', 'Подовжена стрижка', p(600, 60), p(650, 60)),
  S('hair', 'Дитяча стрижка', p(500, 60), p(550, 60), { note: 'до 6 років' }),
  S('combo', 'Комплекс: стрижка + борода', p(800, 90), p(900, 90), { primeNote: '850–900 ₴ залежно від довжини бороди' }),
  S('combo', 'Комплекс: стрижка + борода + камуфлювання', p(1100, 120), p(1200, 120)),
  S('beard', 'Стрижка бороди та вус', p(300, 30), p(350, 35)),
  S('camo', 'Камуфлювання голови', p(400, 30), p(450, 40)),
  S('camo', 'Камуфлювання бороди', p(250, 30), p(300, 30), { primeNote: '300–350 ₴' }),
  S('art', 'Біозавивка Sensus', null, p(2500, 120, true), { primeNote: '2500 / 2700 / 3000 ₴ залежно від густини й довжини' }),
  S('art', 'Біозавивка + стрижка', null, p(3100, 180, true), { primeNote: '3100 / 3300 / 3500 ₴ залежно від довжини й густини' }),
  S('art', 'Бразильське фарбування', null, p(2000, 120, true), { primeNote: 'залежить від довжини' }),
  S('art', 'Бразильське фарбування + стрижка', null, p(2600, 180, true), { primeNote: 'ціну уточнюйте у майстра' }),
  S('care', 'Укладка', p(200, 15), p(250, 15)),
  S('care', 'Воскова депіляція', p(100, 20), p(150, 20)),
];

const DEFAULT_HOURS = { open: 600, close: 1200, days: [0, 1, 2, 3, 4, 5, 6], step: 30 };

async function seed() {
  if (!(await db.masters.count())) {
    for (const m of MASTERS) await db.masters.insert({ active: true, ...m });
  }
  if (!(await db.services.count())) {
    let order = 1;
    for (const s of SERVICES) await db.services.insert({ active: true, order: order++, ...s });
  }
  if (!(await db.settings.findOne({ _id: 'hours' }))) {
    await db.settings.insert({ _id: 'hours', ...DEFAULT_HOURS, closedDates: [] });
  }
  if (!(await db.counters.findOne({ _id: 'booking' }))) await db.counters.insert({ _id: 'booking', seq: 1000 });
}

module.exports = { seed, DEFAULT_HOURS };
