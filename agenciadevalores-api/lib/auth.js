const ADMIN_KEY    = process.env.API_KEY_ADMIN;
const INVESTOR_KEY = process.env.API_KEY_INVESTOR;

function getRole(req) {
  const key = (req.headers['x-api-key'] || '').trim();
  if (key && key === ADMIN_KEY)    return 'admin';
  if (key && key === INVESTOR_KEY) return 'investor';
  return null;
}

function requireRole(req, res, needed) {
  const role = getRole(req);
  if (!role) {
    res.status(401).json({ error: 'API key inválida o ausente' });
    return false;
  }
  if (needed === 'admin' && role !== 'admin') {
    res.status(403).json({ error: 'Se requiere API key de administrador' });
    return false;
  }
  return true;
}

module.exports = { getRole, requireRole };
