// lib/sessions.js — Session tokens backed by MongoDB
// Collection: sessions { token, username, role, expiresAt, createdAt }

const crypto = require('crypto');
const { getDb } = require('./mongo');

const TTL_SECONDS = 60 * 60 * 12; // 12 horas

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(username, role) {
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000);
  const db = await getDb();
  await db.collection('sessions').insertOne({
    token, username, role, createdAt: now, expiresAt,
  });
  return { token, expiresAt };
}

async function findSession(token) {
  if (!token) return null;
  try {
    const db = await getDb();
    return await db.collection('sessions').findOne({
      token,
      expiresAt: { $gt: new Date() },
    });
  } catch {
    return null;
  }
}

async function revokeSession(token) {
  if (!token) return;
  try {
    const db = await getDb();
    await db.collection('sessions').deleteOne({ token });
  } catch { /* silent */ }
}

async function ensureIndexes() {
  try {
    const db = await getDb();
    await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
    await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch { /* silent */ }
}

module.exports = { createSession, findSession, revokeSession, ensureIndexes, TTL_SECONDS };
