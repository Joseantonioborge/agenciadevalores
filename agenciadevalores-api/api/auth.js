const { getDb } = require('../lib/mongo');
const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username y password requeridos' });

  try {
    const db = await getDb();
    const user = await db.collection('inversores').findOne(
      { username: username.toLowerCase().trim() },
      { projection: { password: 1, name: 1, email: 1, role: 1, watchlist: 1 } }
    );

    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (user.password !== sha256(password)) return res.status(401).json({ error: 'Contraseña incorrecta' });

    return res.status(200).json({
      ok: true,
      username: user.username || username,
      name: user.name,
      email: user.email,
      role: user.role,
      watchlist: user.watchlist || [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
