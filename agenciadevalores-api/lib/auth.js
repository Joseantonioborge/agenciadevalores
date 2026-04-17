// lib/auth.js — Role resolution from session token (preferred) or API key (legacy)

const { findSession } = require('./sessions');

const ADMIN_KEY    = process.env.API_KEY_ADMIN;
const INVESTOR_KEY = process.env.API_KEY_INVESTOR;

async function getRole(req) {
  // 1) Session token (frontend path — no secrets in the browser)
  const sessionToken = (req.headers['x-session-token'] || '').trim();
  if (sessionToken) {
    const sess = await findSession(sessionToken);
    if (sess) return sess.role;
  }

  // 2) API key fallback (server-to-server / bootstrap only)
  const key = (req.headers['x-api-key'] || '').trim();
  if (key && ADMIN_KEY    && key === ADMIN_KEY)    return 'admin';
  if (key && INVESTOR_KEY && key === INVESTOR_KEY) return 'investor';

  return null;
}

async function requireRole(req, res, needed) {
  const role = await getRole(req);
  if (!role) {
    res.status(401).json({ error: 'Sesión inválida o ausente' });
    return false;
  }
  if (needed === 'admin' && role !== 'admin') {
    res.status(403).json({ error: 'Se requiere rol de administrador' });
    return false;
  }
  return true;
}

module.exports = { getRole, requireRole };
