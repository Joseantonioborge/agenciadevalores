const { getDb } = require('../lib/mongo');
const { requireRole } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Validar método y autenticación ANTES de tocar MongoDB para diferenciar
  // claramente errores de auth (401/403) vs errores de DB (500/503).
  if (req.method === 'GET') {
    if (!(await requireRole(req, res, 'admin'))) return;
  } else if (req.method === 'POST') {
    if (!(await requireRole(req, res, 'investor'))) return;
  } else if (req.method !== 'OPTIONS') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const db = await getDb();
    const col = db.collection('ratings');

    if (req.method === 'GET') {
      const ratings = await col.find({}).sort({ timestamp: -1 }).toArray();
      return res.status(200).json({ ratings });
    }

    if (req.method === 'POST') {
      const { username, name, email, rating, comment } = req.body || {};
      if (!username || !rating) return res.status(400).json({ error: 'username y rating requeridos' });
      if (rating < 1 || rating > 5) return res.status(400).json({ error: 'rating debe ser 1-5' });
      const doc = {
        username,
        name:    name  || '',
        email:   email || '',
        rating:  parseInt(rating, 10),
        comment: (comment || '').toString().slice(0, 1000),
        timestamp: new Date(),
      };
      const r = await col.insertOne(doc);
      return res.status(201).json({ ok: true, id: r.insertedId });
    }
  } catch (err) {
    // Log detallado a stderr de Vercel para diagnóstico (errores TLS,
    // Topology closed, MongoServerSelectionError, etc.)
    console.error('[ratings] MongoDB error:', err && err.name, '-', err && err.message);
    if (err && err.stack) console.error(err.stack);
    // Diferenciar TLS / red de errores de validación
    const msg = (err && err.message) || 'Error desconocido';
    const isTls = /TLS|SSL|certificate|self.signed|unable to verify|EPROTO/i.test(msg);
    const isNet = /MongoNetworkError|MongoServerSelectionError|Topology|ECONN/i.test(msg);
    return res.status(503).json({
      error: isTls ? 'No se pudo establecer conexión segura con la base de datos. Reintenta en unos segundos.'
           : isNet ? 'La base de datos no está disponible temporalmente. Reintenta en unos segundos.'
           : msg,
      code: isTls ? 'TLS' : isNet ? 'NET' : 'DB',
    });
  }
};
