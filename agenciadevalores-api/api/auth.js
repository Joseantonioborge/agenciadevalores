// api/auth.js — Login + Registro en un solo endpoint
// POST /api/auth  { username, password }             → login
// POST /api/auth  { action:'register', email, password, name } → registro

const { getDb } = require('../lib/mongo');
const crypto    = require('crypto');

function sha256(str)  { return crypto.createHash('sha256').update(str).digest('hex'); }
function slugify(str) { return str.toLowerCase().trim().replace(/[^a-z0-9]/g, ''); }

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const body = req.body || {};

  // ── REGISTRO ──────────────────────────────────────────────────────
  if (body.action === 'register') {
    const { email, password, name, riskProfile } = body;
    if (!email || !password) return res.status(400).json({ error: 'email y password son requeridos' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    const emailClean = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean))
      return res.status(400).json({ error: 'Email no válido' });

    try {
      const db  = await getDb();
      const col = db.collection('inversores');
      if (await col.findOne({ email: emailClean }))
        return res.status(409).json({ error: 'Este email ya está registrado' });

      let baseUsername = slugify(emailClean.split('@')[0]) || 'inversor';
      let username = baseUsername, suffix = 1;
      while (await col.findOne({ username })) { username = baseUsername + suffix++; }

      const displayName = (name && name.trim()) ? name.trim() : username;
      await col.insertOne({
        username, password: sha256(password), name: displayName, email: emailClean,
        role: 'investor', watchlist: ['^IBEX', '^GSPC', '^IXIC'],
        riskProfile: riskProfile || null,
        createdAt: new Date(),
      });
      return res.status(201).json({ ok: true, username });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── LOGIN ─────────────────────────────────────────────────────────
  const { username, password } = body;
  if (!username || !password) return res.status(400).json({ error: 'username y password requeridos' });

  try {
    const db     = await getDb();
    const lookup = username.toLowerCase().trim();
    const user   = await db.collection('inversores').findOne(
      { $or: [{ username: lookup }, { email: lookup }] },
      { projection: { password:1, username:1, name:1, email:1, role:1, watchlist:1, lang:1, riskProfile:1 } }
    );
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (user.password !== sha256(password)) return res.status(401).json({ error: 'Contraseña incorrecta' });

    return res.status(200).json({
      ok: true, username: user.username || username,
      name: user.name, email: user.email, role: user.role,
      watchlist: user.watchlist || [], lang: user.lang || 'es',
      riskProfile: user.riskProfile || null,
    });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
