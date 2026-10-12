// Дані з офіційної сторінки NOVYI_ BARBERSHOP (EasyWeek)
const BOOK_URL = 'https://booking.easyweek.com.ua/r-evvvo-barbershop';
const IMG = 'https://imprx.easyweek.io/_/rs:fill:800:1000:1:0/dpr:1/';

const CATS = {
  all: 'Усе',
  hair: 'Стрижки',
  combo: 'Комплекси',
  beard: 'Борода',
  camo: 'Камуфлювання',
  art: 'Завивка й колір',
  care: 'Догляд',
};

// price: { top, prime } — null, якщо послуга недоступна на цьому рівні
const SERVICES = [
  { cat: 'hair', name: 'Чоловіча стрижка', top: [550, '1 год'], prime: [600, '1 год'] },
  { cat: 'hair', name: 'Подовжена стрижка', top: [600, '1 год'], prime: [650, '1 год'] },
  { cat: 'hair', name: 'Дитяча стрижка', note: 'до 6 років', top: [500, '1 год'], prime: [550, '1 год'] },
  { cat: 'combo', name: 'Комплекс: стрижка + борода', top: [800, '1 год 30 хв'], prime: [900, '1 год 30 хв'], primeNote: '850–900 ₴ залежно від довжини бороди' },
  { cat: 'combo', name: 'Комплекс: стрижка + борода + камуфлювання', top: [1100, '2 год'], prime: [1200, '2 год'] },
  { cat: 'beard', name: 'Стрижка бороди та вус', top: [300, '30 хв'], prime: [350, '35 хв'] },
  { cat: 'camo', name: 'Камуфлювання голови', top: [400, '30 хв'], prime: [450, '40 хв'] },
  { cat: 'camo', name: 'Камуфлювання бороди', top: [250, '30 хв'], prime: [300, '30 хв'], primeNote: '300–350 ₴' },
  { cat: 'art', name: 'Біозавивка Sensus', prime: [2500, '2 год', true], primeNote: '2500 / 2700 / 3000 ₴ залежно від густини й довжини' },
  { cat: 'art', name: 'Біозавивка + стрижка', prime: [3100, '3 год', true], primeNote: '3100 / 3300 / 3500 ₴ залежно від довжини й густини' },
  { cat: 'art', name: 'Бразильське фарбування', prime: [2000, '2 год', true], primeNote: 'залежить від довжини' },
  { cat: 'art', name: 'Бразильське фарбування + стрижка', prime: [2600, '3 год', true], primeNote: 'ціну уточнюйте у майстра' },
  { cat: 'care', name: 'Укладка', top: [200, '15 хв'], prime: [250, '15 хв'] },
  { cat: 'care', name: 'Воскова депіляція', top: [100, '20 хв'], prime: [150, '20 хв'] },
];

const MASTERS = [
  {
    name: 'Зоряна', tier: 'Prime barber', tierId: 'prime',
    photo: IMG + 'aHR0cHM6Ly9zdG9yYWdlMi5lYXN5d2Vlay5pby9wcm9jZXNzZWQvaW1hZ2VzLzIwMjYtMDktMjgvMzliOTAwY2JhZjlhMjEzMGFmYmZlMGU4ZTgzYjIyZTJiNGU0ODkzYzliYmM1ODBhN2EzZmMzOWM4MTk4ZDYyNl84MDB4ODAwLnBuZw.webp',
    skills: ['Стрижки й борода', 'Камуфлювання', 'Біозавивка та колір'],
  },
  {
    name: 'Соломія', tier: 'Prime barber', tierId: 'prime', rating: '5.0',
    photo: IMG + 'aHR0cHM6Ly9zdG9yYWdlMi5lYXN5d2Vlay5pby9wcm9jZXNzZWQvaW1hZ2VzLzIwMjYtMDktMjgvZjc4YTFkOTE5ZTdjMTdmY2I4ZjQ5Yzg3ZGU0MjY1YTgxMzI0ZDVmZTViZjI0YzZmNzE2ZjZmODYxMjZiYjIwN184MDB4ODAwLnBuZw.webp',
    skills: ['Стрижки й борода', 'Камуфлювання', 'Біозавивка та колір'],
  },
  {
    name: 'Вероніка', tier: 'Top barber', tierId: 'top',
    photo: IMG + 'aHR0cHM6Ly9zdG9yYWdlMi5lYXN5d2Vlay5pby9wcm9jZXNzZWQvaW1hZ2VzLzIwMjYtMDktMzAvZWRkYjdlOWFkOWNmOTkzZTAyM2ExYzE0ZDVlZmM0ODQzNmI0YjMxYjAyYzdkMDMyNzEyMjJjOWJjYzRiNmZhOV84MDB4ODAwLnBuZw.webp',
    skills: ['Стрижки й борода', 'Камуфлювання', 'Укладка'],
  },
];
