// Шар бази даних.
// Якщо задано MONGODB_URI — працюємо з MongoDB (Atlas у продакшені).
// Інакше — вбудована файлова база NeDB у папці data/ (для локальної розробки).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const COLLECTIONS = ['users', 'masters', 'services', 'bookings', 'settings', 'counters'];
const db = {};

const newId = () => crypto.randomUUID();

function mongoWrap(col) {
  return {
    findOne: (q) => col.findOne(q),
    find: (q = {}, { sort, skip, limit } = {}) => {
      let cur = col.find(q);
      if (sort) cur = cur.sort(sort);
      if (skip) cur = cur.skip(skip);
      if (limit) cur = cur.limit(limit);
      return cur.toArray();
    },
    insert: async (doc) => {
      const full = { _id: newId(), ...doc };
      await col.insertOne(full);
      return full;
    },
    update: (q, set, { multi = false } = {}) =>
      (multi ? col.updateMany(q, { $set: set }) : col.updateOne(q, { $set: set })),
    inc: (q, inc) => col.updateOne(q, { $inc: inc }),
    remove: (q) => col.deleteMany(q),
    count: (q = {}) => col.countDocuments(q),
    createIndex: (spec, opts) => col.createIndex(spec, opts),
  };
}

function nedbWrap(store) {
  return {
    findOne: (q) => store.findOneAsync(q),
    find: (q = {}, { sort, skip, limit } = {}) => {
      let cur = store.findAsync(q);
      if (sort) cur = cur.sort(sort);
      if (skip) cur = cur.skip(skip);
      if (limit) cur = cur.limit(limit);
      return cur;
    },
    insert: (doc) => store.insertAsync({ _id: newId(), ...doc }),
    update: (q, set, { multi = false } = {}) => store.updateAsync(q, { $set: set }, { multi }),
    inc: (q, inc) => store.updateAsync(q, { $inc: inc }, {}),
    remove: (q) => store.removeAsync(q, { multi: true }),
    count: (q = {}) => store.countAsync(q),
    createIndex: (spec, opts = {}) =>
      store.ensureIndexAsync({ fieldName: Object.keys(spec), unique: !!opts.unique }),
  };
}

async function connect() {
  if (process.env.MONGODB_URI) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const mdb = client.db(process.env.MONGODB_DB || 'novyi');
    for (const name of COLLECTIONS) db[name] = mongoWrap(mdb.collection(name));
    console.log('✂ MongoDB підключено');
  } else {
    const Datastore = require('@seald-io/nedb');
    const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
    for (const name of COLLECTIONS) {
      const store = new Datastore({ filename: path.join(dir, `${name}.db`), autoload: true });
      store.setAutocompactionInterval?.(10 * 60 * 1000);
      db[name] = nedbWrap(store);
    }
    console.log('✂ Локальна файлова база: ' + dir);
  }

  await db.users.createIndex({ phone: 1 }, { unique: true });
  await db.bookings.createIndex({ masterId: 1 });
  await db.bookings.createIndex({ userId: 1 });
  await db.bookings.createIndex({ date: 1 });
  return db;
}

module.exports = { db, connect, newId };
