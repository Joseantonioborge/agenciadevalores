const { getDb } = require('../lib/mongo');
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return res.status(200).json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
  }
};
