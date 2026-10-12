// Реєстрація, вхід, профіль
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const {
  normalizePhone, setAuthCookie, clearAuthCookie, publicUser, requireAuth,
} = require('../auth');
const { cleanText, ah, DAY } = require('../utils');

const router = express.Router();
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const validName = (n) => n.length >= 2 && n.length <= 40;
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 72;

router.post('/register', ah(async (req, res) => {
  const name = cleanText(req.body?.name, 40);
  const phone = normalizePhone(req.body?.phone);
  const { password, agree } = req.body || {};
  if (!validName(name)) return res.status(400).json({ error: 'bad_name' });
  if (!phone) return res.status(400).json({ error: 'bad_phone' });
  if (!validPassword(password)) return res.status(400).json({ error: 'bad_password' });
  if (agree !== true) return res.status(400).json({ error: 'agree_required' });
  if (await db.users.findOne({ phone })) return res.status(409).json({ error: 'phone_taken' });

  const adminPhone = normalizePhone(process.env.ADMIN_PHONE || '');
  const role = adminPhone && adminPhone === phone ? 'admin' : 'client';
  let user;
  try {
    user = await db.users.insert({
      name, phone, role, passHash: await bcrypt.hash(password, 12), tokenVersion: 0,
      interval: 28, createdAt: new Date().toISOString(),
    });
  } catch {
    return res.status(409).json({ error: 'phone_taken' });
  }
  // Записи, які адмін створив раніше на цей номер, тепер належать акаунту
  await db.bookings.update({ clientPhone: phone, userId: null }, { userId: user._id }, { multi: true });
  setAuthCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
}));

router.post('/login', ah(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const password = req.body?.password;
  if (!phone || typeof password !== 'string') return res.status(400).json({ error: 'bad_credentials' });
  const user = await db.users.findOne({ phone });
  if (user?.lockUntil && Date.parse(user.lockUntil) > Date.now()) {
    return res.status(429).json({ error: 'locked', until: user.lockUntil });
  }
  const ok = user && !user.blocked && (await bcrypt.compare(password.slice(0, 72), user.passHash));
  if (!ok) {
    if (user) {
      const fails = (user.failCount || 0) + 1;
      await db.users.update({ _id: user._id }, fails >= MAX_FAILS
        ? { failCount: 0, lockUntil: new Date(Date.now() + LOCK_MS).toISOString() }
        : { failCount: fails });
    }
    return res.status(401).json({ error: 'bad_credentials' });
  }
  await db.users.update({ _id: user._id }, { failCount: 0, lockUntil: null });
  setAuthCookie(res, user);
  res.json({ user: publicUser(user) });
}));

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => res.json({ user: publicUser(req.user) }));

// Скільки мс лишилось до наступної зміни (раз на добу)
const waitLeft = (iso) => (iso ? Math.max(0, Date.parse(iso) + DAY - Date.now()) : 0);

router.patch('/name', requireAuth, ah(async (req, res) => {
  const name = cleanText(req.body?.name, 40);
  if (!validName(name)) return res.status(400).json({ error: 'bad_name' });
  const left = waitLeft(req.user.nameChangedAt);
  if (left) return res.status(429).json({ error: 'too_soon', retryInMs: left });
  if (name === req.user.name) return res.status(400).json({ error: 'same_value' });
  const nameChangedAt = new Date().toISOString();
  await db.users.update({ _id: req.user._id }, { name, nameChangedAt });
  res.json({ user: publicUser({ ...req.user, name, nameChangedAt }) });
}));

router.patch('/phone', requireAuth, ah(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: 'bad_phone' });
  const pass = req.body?.password;
  if (typeof pass !== 'string' || !(await bcrypt.compare(pass.slice(0, 72), req.user.passHash))) {
    return res.status(401).json({ error: 'bad_password' });
  }
  const left = waitLeft(req.user.phoneChangedAt);
  if (left) return res.status(429).json({ error: 'too_soon', retryInMs: left });
  if (phone === req.user.phone) return res.status(400).json({ error: 'same_value' });
  if (await db.users.findOne({ phone })) return res.status(409).json({ error: 'phone_taken' });
  const phoneChangedAt = new Date().toISOString();
  try {
    await db.users.update({ _id: req.user._id }, { phone, phoneChangedAt });
  } catch {
    return res.status(409).json({ error: 'phone_taken' });
  }
  res.json({ user: publicUser({ ...req.user, phone, phoneChangedAt }) });
}));

// Зміна пароля в кабінеті: новий + повтор. Інші сесії виходять.
router.patch('/password', requireAuth, ah(async (req, res) => {
  const { password, repeat } = req.body || {};
  if (!validPassword(password)) return res.status(400).json({ error: 'bad_password' });
  if (password !== repeat) return res.status(400).json({ error: 'mismatch' });
  const tokenVersion = (req.user.tokenVersion || 0) + 1;
  await db.users.update({ _id: req.user._id }, { passHash: await bcrypt.hash(password, 12), tokenVersion });
  setAuthCookie(res, { ...req.user, tokenVersion });
  res.json({ ok: true });
}));

router.patch('/interval', requireAuth, ah(async (req, res) => {
  const days = Number(req.body?.days);
  if (!Number.isInteger(days) || days < 7 || days > 90) return res.status(400).json({ error: 'bad_interval' });
  await db.users.update({ _id: req.user._id }, { interval: days });
  res.json({ user: publicUser({ ...req.user, interval: days }) });
}));

module.exports = router;
