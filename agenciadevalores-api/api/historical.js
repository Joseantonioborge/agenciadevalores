// Datos históricos + análisis técnico
// GET /api/historical?symbol=^GSPC&period=3mo&interval=1d

const PERIOD_MAP = {
  '1d':  { range: '1d',  interval: '5m'  },
  '5d':  { range: '5d',  interval: '15m' },
  '1mo': { range: '1mo', interval: '1d'  },
  '3mo': { range: '3mo', interval: '1d'  },
  '6mo': { range: '6mo', interval: '1d'  },
  '1y':  { range: '1y',  interval: '1wk' },
  '5y':  { range: '5y',  interval: '1mo' },
};

// === FUNCIONES DE ANÁLISIS TÉCNICO ===

function sma(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function smaArray(prices, period) {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const slice = prices.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function ema(prices, period) {
  const k = 2 / (period + 1);
  const result = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function rsi(prices, period = 14) {
  if (prices.length <= period) return null;
  const gains = [], losses = [];
  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;
  const rsiArr = [];
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiArr.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
  }
  return rsiArr[rsiArr.length - 1];
}

function macd(prices) {
  if (prices.length < 35) return null;
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine.slice(26), 9);
  const last = macdLine.length - 1;
  const macdVal = parseFloat(macdLine[last].toFixed(4));
  const signalVal = parseFloat(signalLine[signalLine.length - 1].toFixed(4));
  return { macd: macdVal, signal: signalVal, histogram: parseFloat((macdVal - signalVal).toFixed(4)) };
}

function bollingerBands(prices, period = 20, stdDevMult = 2) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: parseFloat((mean + stdDevMult * stdDev).toFixed(4)),
    middle: parseFloat(mean.toFixed(4)),
    lower: parseFloat((mean - stdDevMult * stdDev).toFixed(4)),
  };
}

function generateSignal(closes, ma20, ma50, rsiVal) {
  const last = closes[closes.length - 1];
  let score = 0;

  // Precio sobre MAs
  if (ma20 && last > ma20) score++;
  if (ma50 && last > ma50) score++;

  // MA20 sobre MA50 (golden cross)
  if (ma20 && ma50 && ma20 > ma50) score++;

  // RSI
  if (rsiVal) {
    if (rsiVal < 35) score += 2;       // Sobrevendido → buy
    else if (rsiVal > 65) score -= 2;  // Sobrecomprado → sell
    else if (rsiVal > 50) score++;
  }

  if (score >= 3) return 'BUY';
  if (score <= -1) return 'SELL';
  return 'NEUTRAL';
}

// ===================================

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol, period = '3mo' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Parámetro symbol requerido' });

  const { range, interval } = PERIOD_MAP[period] || PERIOD_MAP['3mo'];
  const encodedSymbol = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?range=${range}&interval=${interval}`;

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgenciaDeValores/1.0)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`Yahoo HTTP ${resp.status}`);
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No hay datos disponibles');

    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const closes  = (quotes.close  || []).map(v => v ?? null);
    const opens   = (quotes.open   || []).map(v => v ?? null);
    const highs   = (quotes.high   || []).map(v => v ?? null);
    const lows    = (quotes.low    || []).map(v => v ?? null);
    const volumes = (quotes.volume || []).map(v => v ?? null);

    // Filtrar nulls para análisis técnico
    const cleanCloses = closes.filter(v => v !== null);

    // OHLCV para el gráfico
    const ohlcv = timestamps.map((ts, i) => ({
      time: ts,
      open:   opens[i],
      high:   highs[i],
      low:    lows[i],
      close:  closes[i],
      volume: volumes[i],
    })).filter(c => c.close !== null);

    // MAs
    const ma20Val  = sma(cleanCloses, 20);
    const ma50Val  = sma(cleanCloses, 50);
    const ma200Val = sma(cleanCloses, 200);
    const rsiVal   = rsi(cleanCloses, 14);
    const macdVal  = macd(cleanCloses);
    const bbVal    = bollingerBands(cleanCloses, 20, 2);

    // MA arrays (para overlay en chart)
    const ma20Arr  = smaArray(cleanCloses, 20);
    const ma50Arr  = smaArray(cleanCloses, 50);

    const signal = generateSignal(cleanCloses, ma20Val, ma50Val, rsiVal);

    const currentPrice = result.meta.regularMarketPrice;
    const prevClose    = result.meta.chartPreviousClose || result.meta.previousClose;
    const changePct    = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    return res.status(200).json({
      symbol,
      period,
      meta: {
        name: result.meta.instrumentType,
        currency: result.meta.currency,
        exchange: result.meta.exchangeName,
        currentPrice,
        prevClose,
        changePct: parseFloat(changePct.toFixed(2)),
        marketState: result.meta.marketState,
      },
      ohlcv,
      indicators: {
        ma20:   ma20Val  ? parseFloat(ma20Val.toFixed(4))  : null,
        ma50:   ma50Val  ? parseFloat(ma50Val.toFixed(4))  : null,
        ma200:  ma200Val ? parseFloat(ma200Val.toFixed(4)) : null,
        rsi:    rsiVal,
        macd:   macdVal,
        bollinger: bbVal,
        ma20Series:  ma20Arr.map(v => v ? parseFloat(v.toFixed(4)) : null),
        ma50Series:  ma50Arr.map(v => v ? parseFloat(v.toFixed(4)) : null),
      },
      signal,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
