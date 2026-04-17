const { getDb } = require('../lib/mongo');
const { requireRole } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db = await getDb();
    const col = db.collection('ratings');

    if (req.method === 'GET') {
      if (!(await requireRole(req, res, 'admin'))) return;
      const ratings = await col.find({}).sort({ timestamp: -1 }).toArray();
      return res.status(200).json({ ratings });
    }

    if (req.method === 'POST') {
      if (!(await requireRole(req, res, 'investor'))) return;
      const { username, name, email, rating, comment } = req.body || {};
      if (!username || !rating) return res.status(400).json({ error: 'username y rating requeridos' });
      if (rating < 1 || rating > 5) return res.status(400).json({ error: 'rating debe ser 1-5' });
      await col.insertOne({ username, name, email, rating: parseInt(rating), comment: comment || '', timestamp: new Date() });
      return res.status(201).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
