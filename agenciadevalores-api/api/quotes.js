// GET /api/quotes?symbols=AAPL,MSFT,NVDA,...
// Devuelve cotizaciones en tiempo real para una lista de tickers

const CACHE = {};
const CACHE_TTL = 60 * 1000; // 60 segundos

async function fetchQuote(symbol) {
  const now = Date.now();
  if (CACHE[symbol] && (now - CACHE[symbol].ts) < CACHE_TTL) {
    return { ...CACHE[symbol].data, cached: true };
  }

  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgenciaDeValores/1.0)', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
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

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'Parámetro symbols requerido (ej: AAPL,MSFT,NVDA)' });

  const list = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 50);

  const results = [];
  const errors  = [];

  await Promise.allSettled(list.map(async sym => {
    try {
      results.push(await fetchQuote(sym));
    } catch (e) {
      errors.push({ symbol: sym, error: e.message });
    }
  }));

  results.sort((a, b) => list.indexOf(a.symbol) - list.indexOf(b.symbol));

  return res.status(200).json({
    quotes: results,
    errors: errors.length ? errors : undefined,
    fetchedAt: new Date().toISOString(),
  });
};
