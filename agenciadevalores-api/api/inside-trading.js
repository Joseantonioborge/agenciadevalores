/**
 * GET /api/inside-trading
 * Proxy server-side de Polymarket (gamma-api) y Kalshi (api.elections.kalshi.com)
 * para evitar problemas de CORS en el navegador.
 *
 * Devuelve un array unificado de eventos de mercados de predicción con la forma:
 *   { question, prob, volume, source }
 *
 * Cache: 2 minutos en memoria.
 */

const _cache = { ts: 0, data: null };
const CACHE_TTL = 2 * 60 * 1000; // 2 min

async function fetchPolymarket() {
  try {
    const url = 'https://gamma-api.polymarket.com/markets'
              + '?active=true&closed=false&limit=200&order=volumeNum&ascending=false';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AV-Inside-Trading-Proxy/1.0' },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const out = [];
    for (const m of data) {
      const question = m.question || '';
      if (!question) continue;
      let prob = 0.5;
      try {
        const p = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
        if (Array.isArray(p) && p.length) prob = parseFloat(p[0]) || 0.5;
      } catch (_) {}
      const last = parseFloat(m.lastTradePrice);
      if (!Number.isNaN(last) && last > 0 && last < 1) prob = last;
      prob = Math.max(0.01, Math.min(0.99, prob));
      const volume = parseFloat(m.volumeNum ?? m.volume) || 0;
      if (volume < 1000) continue;
      out.push({ question, prob, volume, source: 'Polymarket' });
    }
    return out;
  } catch (e) {
    console.warn('[inside-trading] Polymarket fetch failed:', e?.message || e);
    return [];
  }
}

async function fetchKalshi() {
  try {
    const url = 'https://api.elections.kalshi.com/trade-api/v2/events'
              + '?limit=200&status=open&with_nested_markets=true';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AV-Inside-Trading-Proxy/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const events = data.events || [];
    const out = [];
    for (const ev of events) {
      const title = ev.title || ev.sub_title || '';
      if (!title) continue;
      const markets = ev.markets || [];
      if (!markets.length) continue;
      // Tomamos el market con mayor volumen para representar el evento
      const mkt = markets.reduce(
        (a, b) => ((parseFloat(b.volume_fp || 0)) > (parseFloat(a.volume_fp || 0)) ? b : a),
        markets[0]
      );
      const yesAsk = parseFloat(mkt.yes_ask_dollars);
      const yesBid = parseFloat(mkt.yes_bid_dollars);
      const lastPx = parseFloat(mkt.last_price_dollars);
      let prob = 0.5;
      if (!Number.isNaN(yesAsk) && !Number.isNaN(yesBid) && yesAsk > 0 && yesBid > 0) prob = (yesAsk + yesBid) / 2;
      else if (!Number.isNaN(lastPx) && lastPx > 0)                                   prob = lastPx;
      else if (!Number.isNaN(yesAsk) && yesAsk > 0)                                   prob = yesAsk;
      prob = Math.max(0.01, Math.min(0.99, prob));
      const volume = parseFloat(mkt.volume_fp || mkt.volume_24h_fp || 0) || 0;
      if (volume < 100) continue;
      out.push({ question: title, prob, volume, source: 'Kalshi' });
    }
    return out;
  } catch (e) {
    console.warn('[inside-trading] Kalshi fetch failed:', e?.message || e);
    return [];
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  // Cache simple en memoria (2 min) para reducir hits a Polymarket/Kalshi
  if (_cache.data && (Date.now() - _cache.ts) < CACHE_TTL) {
    return res.status(200).json({ ...(_cache.data), cached: true });
  }

  try {
    const [poly, kalshi] = await Promise.all([fetchPolymarket(), fetchKalshi()]);
    const events = [...poly, ...kalshi];
    const payload = {
      events,
      counts: { polymarket: poly.length, kalshi: kalshi.length, total: events.length },
      fetchedAt: new Date().toISOString(),
    };
    _cache.ts = Date.now();
    _cache.data = payload;
    return res.status(200).json({ ...payload, cached: false });
  } catch (err) {
    if (_cache.data) {
      return res.status(200).json({ ...(_cache.data), cached: true, stale: true });
    }
    return res.status(500).json({ error: err.message || 'Error desconocido' });
  }
};
