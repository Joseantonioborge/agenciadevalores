const { getDb }       = require('../lib/mongo');
const { requireRole } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db  = await getDb();
    const col = db.collection('favoritos');

    // GET /api/favorites?username=xxx  → devuelve símbolos favoritos del usuario
    if (req.method === 'GET') {
      if (!requireRole(req, res, 'investor')) return;
      const { username } = req.query;
      if (!username) return res.status(400).json({ error: 'username requerido' });
      const doc = await col.findOne({ username });
      return res.status(200).json({ symbols: doc?.symbols || [] });
    }

    // POST /api/favorites  body: { username, symbols: [...] }  → guarda favoritos
    if (req.method === 'POST') {
      if (!requireRole(req, res, 'investor')) return;
      const { username, symbols } = req.body || {};
      if (!username) return res.status(400).json({ error: 'username requerido' });
      if (!Array.isArray(symbols)) return res.status(400).json({ error: 'symbols debe ser un array' });

      await col.updateOne(
        { username },
        { $set: { symbols, updatedAt: new Date() } },
        { upsert: true }
      );
      return res.status(200).json({ ok: true, saved: symbols.length });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
