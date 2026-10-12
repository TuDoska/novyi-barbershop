// NOVYI_ BARBERSHOP — сервер: сайт, онлайн-запис, кабінет, адмінка
const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

try { process.loadEnvFile?.(path.join(__dirname, '..', '.env')); } catch { /* немає .env */ }

const { connect } = require('./db');
const { loadUser } = require('./auth');
const { seed } = require('./seed');

async function createApp() {
  await connect();
  await seed();

  const app = express();
  const server = http.createServer(app);
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://imprx.easyweek.io', 'https:'],
        frameSrc: ['https://www.google.com', 'https://maps.google.com'],
        connectSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(loadUser);

  // Захист від CSRF: зміни лише зі свого сайту
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'bad_origin' });
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  const strict = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
    skip: (req) => req.method === 'GET' || process.env.NODE_ENV === 'test',
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', strict, require('./routes/auth'));
  app.post('/api/bookings', strict);
  app.use('/api', require('./routes/public'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: '1h' }));
  app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    console.error(err);
    res.status(500).json({ error: 'server' });
  });
  return { app, server };
}

if (require.main === module) {
  createApp().then(({ server }) => {
    const port = Number(process.env.PORT) || 3000;
    server.listen(port, () => console.log(`✂ NOVYI_: http://localhost:${port}`));
  }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { createApp };
