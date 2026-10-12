// Авторизація: JWT у httpOnly cookie + ролі client / master / admin
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const COOKIE = 'novyi_token';

function getSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'change-me') return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET має бути заданий у продакшені');
  const file = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), '.secret');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'));
  return fs.readFileSync(file, 'utf8');
}
const SECRET = getSecret();

// Номер у форматі +380XXXXXXXXX; приймає «067 123 45 67», «+38 (067)…», «380…»
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let d = raw.replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('0')) d = '38' + d;
  if (d.length === 9) d = '380' + d;
  if (!/^380\d{9}$/.test(d)) return null;
  return '+' + d;
}

function setAuthCookie(res, user) {
  const token = jwt.sign({ uid: user._id, v: user.tokenVersion || 0 }, SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

const clearAuthCookie = (res) => res.clearCookie(COOKIE);

async function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { uid, v } = jwt.verify(token, SECRET);
      const u = await db.users.findOne({ _id: uid });
      // Після зміни пароля старі сесії стають недійсними
      if (u && (u.tokenVersion || 0) === v && !u.blocked) req.user = u;
    } catch { /* недійсний токен */ }
  }
  next();
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u._id, name: u.name, phone: u.phone, role: u.role, masterId: u.masterId || null,
    interval: u.interval || 28, createdAt: u.createdAt,
    nameChangedAt: u.nameChangedAt || null, phoneChangedAt: u.phoneChangedAt || null,
  };
}

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'auth_required' }));
const requireStaff = (req, res, next) =>
  (['admin', 'master'].includes(req.user?.role) ? next() : res.status(403).json({ error: 'forbidden' }));
const requireAdmin = (req, res, next) =>
  (req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'forbidden' }));

module.exports = {
  COOKIE, normalizePhone, setAuthCookie, clearAuthCookie, loadUser, publicUser,
  requireAuth, requireStaff, requireAdmin,
};
