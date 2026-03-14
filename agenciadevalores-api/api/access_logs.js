const { getDb } = require('../lib/mongo');
const { requireRole } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db = await getDb();
    const col = db.collection('access_logs');

    if (req.method === 'GET') {
      if (!requireRole(req, res, 'admin')) return;
      const logs = await col.find({}).sort({ timestamp: -1 }).limit(500).toArray();
      return res.status(200).json({ logs });
    }

    if (req.method === 'POST') {
      if (!requireRole(req, res, 'investor')) return;
      const { username, name, email, ua } = req.body || {};
      if (!username) return res.status(400).json({ error: 'username requerido' });
      await col.insertOne({ username, name, email, ua: ua || '', timestamp: new Date() });
      return res.status(201).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
