// lib/cache.js — MongoDB-backed cache for FinBot and API responses
// Collections: api_cache  { key, data, expiresAt, updatedAt }

const { getDb } = require('./mongo');

async function cacheGet(key) {
  try {
    const db  = await getDb();
    const doc = await db.collection('api_cache').findOne({ key, expiresAt: { $gt: new Date() } });
    return doc ? doc.data : null;
  } catch { return null; }
}

async function cacheSet(key, data, ttlSeconds = 60) {
  try {
    const db = await getDb();
    await db.collection('api_cache').updateOne(
      { key },
      { $set: { key, data, expiresAt: new Date(Date.now() + ttlSeconds * 1000), updatedAt: new Date() } },
      { upsert: true }
    );
  } catch { /* cache is optional — fail silently */ }
}

// Chat history: save/load per user (last 40 messages)
async function historyLoad(username) {
  try {
    const db  = await getDb();
    const doc = await db.collection('chat_history').findOne({ username });
    return doc?.messages || [];
  } catch { return []; }
}

async function historySave(username, messages) {
  try {
    const db = await getDb();
    const keep = messages.slice(-40); // keep last 40 turns
    await db.collection('chat_history').updateOne(
      { username },
      { $set: { username, messages: keep, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch { /* silent */ }
}

async function historyDelete(username) {
  try {
    const db = await getDb();
    await db.collection('chat_history').deleteOne({ username });
  } catch { /* silent */ }
}

module.exports = { cacheGet, cacheSet, historyLoad, historySave, historyDelete };
