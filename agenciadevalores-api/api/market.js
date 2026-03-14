// Proxy de datos de mercado en tiempo real via Yahoo Finance v8
// Caché en memoria de 60 segundos para evitar rate limiting

const INDICES = [
  { key: 'sp500',      symbol: '%5EGSPC',   name: 'S&P 500',      region: 'US' },
  { key: 'nasdaq',     symbol: '%5EIXIC',   name: 'NASDAQ',        region: 'US' },
  { key: 'dowjones',   symbol: '%5EDJI',    name: 'Dow Jones',     region: 'US' },
  { key: 'ibex35',     symbol: '%5EIBEX',   name: 'IBEX 35',       region: 'ES' },
  { key: 'dax40',      symbol: '%5EGDAXI',  name: 'DAX 40',        region: 'DE' },
  { key: 'nikkei225',  symbol: '%5EN225',   name: 'Nikkei 225',    region: 'JP' },
  { key: 'hangseng',   symbol: '%5EHSI',    name: 'Hang Seng',     region: 'HK' },
  { key: 'eurostoxx50',symbol: '%5ESTOXX50E',name: 'Euro Stoxx 50',region: 'EU' },
  { key: 'msciworld',  symbol: 'URTH',      name: 'MSCI World',    region: 'Global' },
];

// Caché global
let cache = null;
let cacheTs = 0;
const CACHE_TTL = 60 * 1000; // 60 segundos

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AgenciaDeValores/1.0)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Yahoo HTTP ${resp.status} for ${symbol}`);
  const data = await resp.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const meta = result.meta;
  return {
    price: meta.regularMarketPrice,
    prevClose: meta.chartPreviousClose || meta.previousClose,
    open: meta.regularMarketOpen,
    dayLow: meta.regularMarketDayLow,
    dayHigh: meta.regularMarketDayHigh,
    volume: meta.regularMarketVolume,
    currency: meta.currency,
    exchangeName: meta.exchangeName,
    marketState: meta.marketState, // REGULAR, PRE, POST, CLOSED
    timestamp: meta.regularMarketTime,
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const now = Date.now();
  if (cache && (now - cacheTs) < CACHE_TTL) {
    return res.status(200).json({ data: cache, cached: true, age: Math.round((now - cacheTs) / 1000) });
  }

  const results = [];
  const errors = [];

  await Promise.allSettled(
    INDICES.map(async (idx) => {
      try {
        const q = await fetchYahoo(idx.symbol);
        const change = q.price - q.prevClose;
        const changePct = q.prevClose ? (change / q.prevClose) * 100 : 0;
        results.push({
          key: idx.key,
          symbol: decodeURIComponent(idx.symbol),
          name: idx.name,
          region: idx.region,
          price: q.price,
          prevClose: q.prevClose,
          change: parseFloat(change.toFixed(4)),
          changePct: parseFloat(changePct.toFixed(2)),
          open: q.open,
          dayLow: q.dayLow,
          dayHigh: q.dayHigh,
          volume: q.volume,
          currency: q.currency,
          exchange: q.exchangeName,
          marketState: q.marketState,
          updatedAt: new Date(q.timestamp * 1000).toISOString(),
        });
      } catch (err) {
        errors.push({ key: idx.key, error: err.message });
      }
    })
  );

  // Ordenar por orden original
  results.sort((a, b) => INDICES.findIndex(i => i.key === a.key) - INDICES.findIndex(i => i.key === b.key));

  if (results.length > 0) {
    cache = results;
    cacheTs = now;
  }

  return res.status(200).json({
    data: results,
    errors: errors.length ? errors : undefined,
    cached: false,
    fetchedAt: new Date().toISOString(),
  });
};
