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
      return res.status(200).json({
        symbols:   doc?.symbols   || [],
        chartType: doc?.chartType || null,
      });
    }

    // POST /api/favorites  body: { username, symbols: [...] }  → guarda favoritos
    if (req.method === 'POST') {
      if (!requireRole(req, res, 'investor')) return;
      const { username, symbols, chartType } = req.body || {};
      if (!username) return res.status(400).json({ error: 'username requerido' });

      const update = { updatedAt: new Date() };
      if (Array.isArray(symbols))                         update.symbols   = symbols;
      if (chartType === 'line' || chartType === 'candle') update.chartType = chartType;

      if (Object.keys(update).length === 1) {
        return res.status(400).json({ error: 'Nada que actualizar' });
      }

      await col.updateOne({ username }, { $set: update }, { upsert: true });
      return res.status(200).json({ ok: true, saved: update.symbols?.length ?? 0 });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
