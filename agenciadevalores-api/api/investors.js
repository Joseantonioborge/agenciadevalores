const { getDb } = require('../lib/mongo');
const { requireRole, getRole } = require('../lib/auth');
const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const role = getRole(req);
  if (!role) return res.status(401).json({ error: 'API key inválida o ausente' });

  try {
    const db = await getDb();
    const col = db.collection('inversores');

    // GET — listar inversores (solo admin)
    if (req.method === 'GET') {
      if (!requireRole(req, res, 'admin')) return;
      const investors = await col.find({}, { projection: { password: 0 } }).toArray();
      return res.status(200).json({ investors });
    }

    // POST — crear inversor (solo admin)
    if (req.method === 'POST') {
      if (!requireRole(req, res, 'admin')) return;
      const { username, password, name, email, watchlist } = req.body || {};
      if (!username || !password || !name || !email) {
        return res.status(400).json({ error: 'username, password, name y email son requeridos' });
      }
      const exists = await col.findOne({ username: username.toLowerCase().trim() });
      if (exists) return res.status(409).json({ error: 'Username ya existe' });

      await col.insertOne({
        username: username.toLowerCase().trim(),
        password: sha256(password),
        name,
        email: email.toLowerCase().trim(),
        role: 'investor',
        watchlist: watchlist || ['^IBEX', '^GSPC', '^IXIC'],
        createdAt: new Date(),
      });
      return res.status(201).json({ ok: true, username: username.toLowerCase().trim() });
    }

    // PUT — actualizar (investor puede cambiar su contraseña, watchlist e idioma; admin puede editar todo)
    if (req.method === 'PUT') {
      const { username, password, newPassword, name, email, watchlist, lang } = req.body || {};
      if (!username) return res.status(400).json({ error: 'username requerido' });

      const user = await col.findOne({ username: username.toLowerCase().trim() });
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

      const update = { updatedAt: new Date() };

      if (role === 'admin') {
        // Admin puede cambiar todo
        if (newPassword) update.password = sha256(newPassword);
        if (name) update.name = name;
        if (email) update.email = email.toLowerCase().trim();
        if (watchlist) update.watchlist = watchlist;
        if (lang && ['es', 'en'].includes(lang)) update.lang = lang;
      } else {
        // Investor puede actualizar idioma sin contraseña
        if (lang && ['es', 'en'].includes(lang)) update.lang = lang;
        // Investor puede actualizar watchlist sin contraseña
        if (watchlist) update.watchlist = watchlist;
        // Para cambiar contraseña sí requiere la actual
        if (newPassword) {
          if (!password) return res.status(400).json({ error: 'password actual requerida para cambiar contraseña' });
          if (user.password !== sha256(password)) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
          update.password = sha256(newPassword);
        }
        // Si no hay nada que actualizar, rechazar
        if (Object.keys(update).length === 1) {
          return res.status(400).json({ error: 'Nada que actualizar' });
        }
      }

      await col.updateOne({ username: username.toLowerCase().trim() }, { $set: update });
      return res.status(200).json({ ok: true });
    }

    // DELETE — eliminar inversor (solo admin)
    if (req.method === 'DELETE') {
      if (!requireRole(req, res, 'admin')) return;
      const { username } = req.query;
      if (!username) return res.status(400).json({ error: 'username requerido en query' });
      const result = await col.deleteOne({ username: username.toLowerCase().trim(), role: { $ne: 'admin' } });
      if (result.deletedCount === 0) return res.status(404).json({ error: 'Inversor no encontrado o no eliminable' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
