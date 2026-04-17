// api/carteras.js — v1.0
// GET    /api/carteras?username=  → { carteras: [...] }
// POST   /api/carteras            → upsert una cartera { username, cartera }
// DELETE /api/carteras?username=&carteraId= → elimina una cartera

const { getDb }       = require('../lib/mongo');
const { requireRole } = require('../lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-session-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ──────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!(await requireRole(req, res, 'investor'))) return;
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username requerido' });
    try {
      const db  = await getDb();
      const doc = await db.collection('carteras').findOne({ username });
      return res.status(200).json({ carteras: doc?.carteras || [] });
    } catch (err) {
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────
  // body: { username, cartera: { id?, nombre, color, activos: [...] } }
  if (req.method === 'POST') {
    if (!(await requireRole(req, res, 'investor'))) return;
    const { username, cartera } = req.body || {};
    if (!username || !cartera) return res.status(400).json({ error: 'username y cartera requeridos' });
    if (!cartera.nombre)       return res.status(400).json({ error: 'nombre de cartera requerido' });

    // Garantiza IDs únicos
    if (!cartera.id) cartera.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    cartera.activos = (cartera.activos || []).map(a => ({
      ...a,
      id: a.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    }));

    try {
      const db  = await getDb();
      const col = db.collection('carteras');
      const doc = await col.findOne({ username });
      let carteras = doc?.carteras || [];

      const idx = carteras.findIndex(c => c.id === cartera.id);
      if (idx >= 0) carteras[idx] = cartera;
      else          carteras.push(cartera);

      await col.updateOne(
        { username },
        { $set: { carteras, updatedAt: new Date() } },
        { upsert: true }
      );
      return res.status(200).json({ ok: true, cartera });
    } catch (err) {
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
  }

  // ── DELETE ───────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!(await requireRole(req, res, 'investor'))) return;
    const { username, carteraId } = req.query;
    if (!username || !carteraId) return res.status(400).json({ error: 'username y carteraId requeridos' });
    try {
      const db  = await getDb();
      const col = db.collection('carteras');
      const doc = await col.findOne({ username });
      if (!doc) return res.status(404).json({ error: 'No encontrado' });
      const carteras = (doc.carteras || []).filter(c => c.id !== carteraId);
      await col.updateOne({ username }, { $set: { carteras, updatedAt: new Date() } });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
