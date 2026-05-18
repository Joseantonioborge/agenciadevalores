// GET /api/quotes?symbols=AAPL,MSFT,Airbus,...
// Devuelve cotizaciones en tiempo real para una lista de tickers o NOMBRES de empresa.
// Si un término no es un ticker válido, se resuelve vía búsqueda de Yahoo Finance.

const CACHE = {};
const CACHE_TTL = 60 * 1000; // 60 segundos
const RESOLVE_CACHE = {};
const RESOLVE_TTL = 24 * 60 * 60 * 1000; // 24 h (mapa nombre→ticker es estable)

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; AgenciaDeValores/1.0)', 'Accept': 'application/json' };

async function fetchQuote(symbol) {
  const now = Date.now();
  if (CACHE[symbol] && (now - CACHE[symbol].ts) < CACHE_TTL) {
    return { ...CACHE[symbol].data, cached: true };
  }

  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`;
  const resp = await fetch(url, { headers: UA, signal: AbortSignal.timeout(7000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Sin datos');

  const meta = result.meta;
  const price     = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose || price;
  const change    = price - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  const data = {
    symbol,
    name:      meta.longName || meta.shortName || undefined,
    price:     parseFloat(price?.toFixed(2)),
    prevClose: parseFloat(prevClose?.toFixed(2)),
    change:    parseFloat(change?.toFixed(2)),
    changePct: parseFloat(changePct?.toFixed(2)),
    currency:  meta.currency,
    marketState: meta.marketState,
  };
  CACHE[symbol] = { data, ts: now };
  return data;
}

// Resuelve un nombre de empresa (o ticker parcial) al ticker real de Yahoo Finance
async function resolveSymbol(query) {
  const key = query.toUpperCase();
  const now = Date.now();
  if (RESOLVE_CACHE[key] && (now - RESOLVE_CACHE[key].ts) < RESOLVE_TTL) {
    return RESOLVE_CACHE[key].data;
  }

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0&listsCount=0`;
  const resp = await fetch(url, { headers: UA, signal: AbortSignal.timeout(7000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();

  const candidates = (json?.quotes || []).filter(q =>
    q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'INDEX' || q.quoteType === 'MUTUALFUND')
  );
  if (!candidates.length) return null;

  // Prioriza acción/ETF sobre otros tipos
  const best = candidates.find(q => q.quoteType === 'EQUITY')
            || candidates.find(q => q.quoteType === 'ETF')
            || candidates[0];

  const resolved = {
    symbol: best.symbol,
    name:   best.shortname || best.longname || best.symbol,
  };
  RESOLVE_CACHE[key] = { data: resolved, ts: now };
  return resolved;
}

// Obtiene la cotización de un término: prueba ticker directo y, si falla, resuelve por nombre
async function quoteForTerm(term) {
  // 1) Intento directo como ticker
  try {
    return await fetchQuote(term);
  } catch (_) { /* sigue al paso 2 */ }

  // 2) Resolución nombre → ticker vía búsqueda de Yahoo
  const resolved = await resolveSymbol(term);
  if (!resolved) throw new Error('No encontrado');
  const q = await fetchQuote(resolved.symbol);
  // El nombre del buscador suele ser más legible que el del chart meta
  return { ...q, name: q.name || resolved.name, query: term };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'Parámetro symbols requerido (ej: AAPL,MSFT o "Airbus")' });

  // Separa SOLO por coma/punto y coma para no romper nombres de varias palabras
  const list = symbols.split(/[,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 30);

  const results = [];
  const errors  = [];

  await Promise.allSettled(list.map(async (term, idx) => {
    try {
      const q = await quoteForTerm(term);
      results.push({ ...q, _idx: idx });
    } catch (e) {
      errors.push({ symbol: term, error: e.message });
    }
  }));

  // Mantiene el orden de entrada
  results.sort((a, b) => a._idx - b._idx);
  results.forEach(r => { delete r._idx; });

  return res.status(200).json({
    quotes: results,
    errors: errors.length ? errors : undefined,
    fetchedAt: new Date().toISOString(),
  });
};
