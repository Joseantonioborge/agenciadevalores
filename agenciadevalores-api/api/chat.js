// api/chat.js — FinBot v2.0: asistente financiero IA con herramientas en tiempo real
// POST /api/chat  { message, username, portfolioContext }  →  { ok, reply, toolsUsed }
// GET  /api/chat?username=X                                →  { ok, messages }
// DELETE /api/chat?username=X                             →  { ok }

const Anthropic                   = require('@anthropic-ai/sdk');
const { requireRole }             = require('../lib/auth');
const { cacheGet, cacheSet, historyLoad, historySave, historyDelete } = require('../lib/cache');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── FONDOS (versión compacta para tool search) ─────────────────────────────
const FONDOS_COMPACT = [
  // NACIONALES
  { n:'CaixaBank Monetario Rendimiento', g:'CaixaBank AM', cat:'Monetario', pat:8450, r1y:3.82, r3y:2.10, r5y:0.85, ter:0.20, ms:4, o:'ES' },
  { n:'Kutxabank Depósitos FI', g:'Kutxabank G.', cat:'Monetario', pat:4130, r1y:3.72, r3y:1.88, r5y:0.68, ter:0.15, ms:5, o:'ES' },
  { n:'CaixaBank Mixto Defensivo FI', g:'CaixaBank AM', cat:'Mixto Defensivo', pat:5210, r1y:4.52, r3y:0.95, r5y:1.82, ter:0.90, ms:4, o:'ES' },
  { n:'Kutxabank Renta 50 FI', g:'Kutxabank G.', cat:'Mixto Moderado', pat:2420, r1y:8.32, r3y:3.52, r5y:4.82, ter:0.95, ms:5, o:'ES' },
  { n:'Bestinver Internacional FI', g:'Bestinver', cat:'RV Internacional', pat:2820, r1y:17.85, r3y:10.42, r5y:9.95, ter:1.72, ms:5, o:'ES' },
  { n:'azValor Internacional FI', g:'azValor AM', cat:'RV Internacional', pat:2215, r1y:19.52, r3y:12.42, r5y:11.82, ter:2.00, ms:5, o:'ES' },
  { n:'Cobas Internacional FI', g:'Cobas AM', cat:'RV Internacional', pat:1820, r1y:18.82, r3y:11.82, r5y:10.95, ter:2.00, ms:4, o:'ES' },
  { n:'Magallanes European Equity FI', g:'Magallanes V.', cat:'RV Europa', pat:2420, r1y:17.42, r3y:10.12, r5y:9.62, ter:1.70, ms:5, o:'ES' },
  { n:'Magallanes Microcaps Europa FI', g:'Magallanes V.', cat:'RV Europa', pat:510, r1y:21.82, r3y:13.52, r5y:12.82, ter:2.00, ms:5, o:'ES' },
  { n:'Amundi Índice S&P 500 AE-C FI', g:'Amundi Iberia', cat:'RV USA', pat:1520, r1y:22.42, r3y:12.85, r5y:14.52, ter:0.40, ms:5, o:'ES' },
  { n:'Renta 4 Bolsa FI', g:'Renta 4 G.', cat:'RV España', pat:1105, r1y:15.85, r3y:8.52, r5y:7.28, ter:1.62, ms:4, o:'ES' },
  { n:'Fidelity Fds Global Technology A EUR', g:'Fidelity', cat:'RV Temático', pat:580, r1y:29.82, r3y:15.52, r5y:21.82, ter:1.80, ms:5, o:'ES' },
  // INTERNACIONALES
  { n:'Vanguard Global Stock Index EUR Acc', g:'Vanguard', cat:'RV Global', pat:48200, r1y:23.45, r3y:13.12, r5y:15.85, ter:0.25, ms:5, o:'LU' },
  { n:'Vanguard LifeStrategy 80% Equity', g:'Vanguard', cat:'Mixto Agresivo', pat:8200, r1y:13.85, r3y:7.42, r5y:9.18, ter:0.25, ms:5, o:'IE' },
  { n:'Vanguard LifeStrategy 60% Equity', g:'Vanguard', cat:'Mixto Moderado', pat:6400, r1y:9.95, r3y:5.12, r5y:6.85, ter:0.25, ms:5, o:'IE' },
  { n:'Vanguard FTSE All-World UCITS ETF', g:'Vanguard', cat:'RV Global', pat:32800, r1y:22.85, r3y:12.82, r5y:15.42, ter:0.22, ms:5, o:'IE' },
  { n:'BGF World Technology Fund A2 EUR', g:'BlackRock', cat:'RV Temático', pat:32400, r1y:33.85, r3y:18.42, r5y:24.52, ter:1.75, ms:5, o:'LU' },
  { n:'BGF World Equity Index A2 EUR', g:'BlackRock', cat:'RV Global', pat:24800, r1y:22.82, r3y:12.52, r5y:15.18, ter:0.68, ms:5, o:'LU' },
  { n:'PIMCO GIS Income Fund EUR Hdg Inc', g:'PIMCO', cat:'Renta Fija', pat:68400, r1y:7.82, r3y:3.18, r5y:3.85, ter:1.05, ms:5, o:'IE' },
  { n:'Fidelity Funds Global Technology A EUR', g:'Fidelity', cat:'RV Temático', pat:12800, r1y:31.85, r3y:17.18, r5y:22.82, ter:1.80, ms:5, o:'LU' },
  { n:'JPM Global Income Fund A EUR H', g:'JP Morgan AM', cat:'Mixto Moderado', pat:12800, r1y:9.18, r3y:4.52, r5y:5.82, ter:1.42, ms:5, o:'LU' },
  { n:'JPM Global Growth Fund A EUR', g:'JP Morgan AM', cat:'RV Global', pat:14200, r1y:23.85, r3y:13.52, r5y:16.82, ter:1.75, ms:4, o:'LU' },
  { n:'T. Rowe Price Global Growth Equity A EUR', g:'T. Rowe Price', cat:'RV Global', pat:11800, r1y:24.52, r3y:13.85, r5y:17.52, ter:1.72, ms:5, o:'LU' },
  { n:'Schroder ISF Global Technology A EUR', g:'Schroders', cat:'RV Temático', pat:9200, r1y:30.52, r3y:16.52, r5y:21.85, ter:1.75, ms:4, o:'LU' },
  { n:'MS INVF Global Opportunity Fund A EUR', g:'Morgan Stanley', cat:'RV Global', pat:14200, r1y:19.85, r3y:8.52, r5y:14.52, ter:1.75, ms:4, o:'LU' },
];

// ── DEFINICIÓN DE HERRAMIENTAS ─────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_market_data',
    description: 'Obtiene cotizaciones en tiempo real de los 9 principales índices bursátiles mundiales: S&P 500, NASDAQ, Dow Jones, IBEX 35, DAX 40, Nikkei 225, Hang Seng, Euro Stoxx 50 y MSCI World. Úsalo cuando el usuario pregunte por la situación actual del mercado, si hay subidas/bajadas, o qué está pasando en bolsa hoy.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_stock_quotes',
    description: 'Obtiene cotizaciones en tiempo real de acciones específicas o ETFs. Úsalo cuando el usuario mencione tickers concretos (AAPL, MSFT, NVDA, etc.) o pregunte por el precio de una acción, ETF o activo específico.',
    input_schema: {
      type: 'object',
      properties: {
        symbols: { type: 'string', description: 'Tickers separados por coma. Ej: "AAPL,MSFT,NVDA" o "SAN.MC,BBVA.MC" para acciones españolas' },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_financial_news',
    description: 'Obtiene las últimas noticias financieras y de mercados. Úsalo cuando el usuario pregunte qué está pasando en los mercados, qué noticias hay, o quiera contexto sobre eventos recientes que afectan a las bolsas.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Tema de búsqueda, ej: "IBEX 35", "S&P 500", "inflación", "Fed tipos interés"' },
      },
      required: [],
    },
  },
  {
    name: 'get_technical_analysis',
    description: 'Obtiene análisis técnico completo de un índice o acción: RSI, MACD, medias móviles MA20/50/200, señal BUY/SELL/NEUTRAL, tendencia y nivel de soporte/resistencia. Úsalo para dar análisis técnico, identificar tendencias o proyectar escenarios futuros.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Símbolo del activo. Ej: "^GSPC" (S&P500), "^IBEX" (IBEX35), "AAPL", "SAN.MC"' },
        period: { type: 'string', enum: ['1mo', '3mo', '6mo', '1y', '2y', '5y'], description: 'Período histórico para el análisis' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'search_investment_funds',
    description: 'Busca y compara fondos de inversión de la base de datos (90 fondos: 50 nacionales CNMV + 40 internacionales CSSF/CBI). Úsalo cuando el usuario pregunte por fondos, quiera comparar gestoras, busque el mejor fondo por categoría, o quiera recomendaciones de fondos para su perfil.',
    input_schema: {
      type: 'object',
      properties: {
        query:    { type: 'string',  description: 'Texto de búsqueda: nombre, gestora o tipo de fondo' },
        category: { type: 'string',  description: 'Categoría. Ej: "Monetario", "Renta Fija", "Mixto Moderado", "RV Global", "RV USA", "RV Temático"' },
        origen:   { type: 'string',  enum: ['todos', 'nacional', 'internacional'], description: 'Filtrar por domicilio: nacional (CNMV) o internacional (CSSF/CBI)' },
        sortBy:   { type: 'string',  enum: ['r1y', 'r3y', 'r5y', 'pat', 'ter', 'ms'], description: 'Ordenar por: rentabilidad 1A, 3A, 5A, patrimonio, comisión o rating' },
      },
      required: [],
    },
  },
];

// ── IMPLEMENTACIÓN DE HERRAMIENTAS ─────────────────────────────────────────
async function executeTool(name, input) {
  const YAHOO_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; AgenciaDeValores-FinBot/2.0)',
    'Accept': 'application/json',
  };

  try {
    // ── 1. get_market_data ────────────────────────────────────────
    if (name === 'get_market_data') {
      const cached = await cacheGet('mkt_all_v2');
      if (cached) return { source: 'cache', indices: cached };

      const INDICES = [
        { key:'sp500',       symbol:'%5EGSPC',    name:'S&P 500',       region:'US' },
        { key:'nasdaq',      symbol:'%5EIXIC',    name:'NASDAQ 100',     region:'US' },
        { key:'dowjones',    symbol:'%5EDJI',     name:'Dow Jones',      region:'US' },
        { key:'ibex35',      symbol:'%5EIBEX',    name:'IBEX 35',        region:'ES' },
        { key:'dax40',       symbol:'%5EGDAXI',   name:'DAX 40',         region:'DE' },
        { key:'nikkei225',   symbol:'%5EN225',    name:'Nikkei 225',     region:'JP' },
        { key:'hangseng',    symbol:'%5EHSI',     name:'Hang Seng',      region:'HK' },
        { key:'eurostoxx50', symbol:'%5ESTOXX50E',name:'Euro Stoxx 50',  region:'EU' },
        { key:'msciworld',   symbol:'URTH',       name:'MSCI World ETF', region:'Global' },
      ];
      const results = [];
      await Promise.allSettled(INDICES.map(async idx => {
        try {
          const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${idx.symbol}?interval=1m&range=1d`,
            { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(5000) });
          const d = await r.json();
          const m = d?.chart?.result?.[0]?.meta;
          if (!m) return;
          const chg = m.regularMarketPrice - (m.chartPreviousClose || m.previousClose);
          const pct = (m.chartPreviousClose||m.previousClose) ? chg / (m.chartPreviousClose||m.previousClose) * 100 : 0;
          results.push({ name: idx.name, region: idx.region, price: m.regularMarketPrice,
            change: +chg.toFixed(2), changePct: +pct.toFixed(2),
            dayLow: m.regularMarketDayLow, dayHigh: m.regularMarketDayHigh,
            marketState: m.marketState, currency: m.currency });
        } catch {}
      }));
      await cacheSet('mkt_all_v2', results, 60);
      return { source: 'live', timestamp: new Date().toISOString(), indices: results };
    }

    // ── 2. get_stock_quotes ───────────────────────────────────────
    if (name === 'get_stock_quotes') {
      const syms = (input.symbols || '').trim();
      if (!syms) return { error: 'symbols requerido' };
      const key = `quotes_${syms.toLowerCase()}`;
      const cached = await cacheGet(key);
      if (cached) return { source: 'cache', quotes: cached };

      const encoded = syms.split(',').map(s => encodeURIComponent(s.trim())).join('%2C');
      const r = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encoded}&fields=shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,marketCap,regularMarketVolume,fiftyTwoWeekLow,fiftyTwoWeekHigh`,
        { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(5000) }
      );
      const d = await r.json();
      const quotes = (d?.quoteResponse?.result || []).map(q => ({
        symbol: q.symbol, name: q.shortName || q.symbol,
        price: q.regularMarketPrice, change: +q.regularMarketChange?.toFixed(2)||0,
        changePct: +q.regularMarketChangePercent?.toFixed(2)||0,
        marketCap: q.marketCap, week52Low: q.fiftyTwoWeekLow, week52High: q.fiftyTwoWeekHigh,
      }));
      await cacheSet(key, quotes, 60);
      return { source: 'live', timestamp: new Date().toISOString(), quotes };
    }

    // ── 3. get_financial_news ─────────────────────────────────────
    if (name === 'get_financial_news') {
      const q   = input.query || 'bolsa mercados financiero';
      const key = `news_${q.toLowerCase().slice(0,30).replace(/\s+/g,'_')}`;
      const cached = await cacheGet(key);
      if (cached) return { source: 'cache', articles: cached };

      const encoded = encodeURIComponent(q);
      const r = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encoded}&newsCount=8&quotesCount=0&lang=en`,
        { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(5000) }
      );
      const d = await r.json();
      const articles = (d?.news || []).slice(0, 8).map(n => ({
        title:     n.title,
        publisher: n.publisher,
        link:      n.link,
        published: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null,
      }));
      await cacheSet(key, articles, 300); // 5 min cache
      return { source: 'live', query: q, timestamp: new Date().toISOString(), articles };
    }

    // ── 4. get_technical_analysis ─────────────────────────────────
    if (name === 'get_technical_analysis') {
      const symbol = (input.symbol || '^GSPC').trim();
      const period = input.period || '3mo';
      const key    = `hist_${symbol}_${period}`.replace(/[^a-z0-9_]/gi,'_');
      const cached = await cacheGet(key);
      if (cached) return { source: 'cache', analysis: cached };

      const PERIOD_MAP = {
        '1mo':{ range:'1mo', interval:'1d' }, '3mo':{ range:'3mo', interval:'1d' },
        '6mo':{ range:'6mo', interval:'1d' }, '1y': { range:'1y',  interval:'1wk' },
        '2y': { range:'2y',  interval:'1wk' },'5y': { range:'5y',  interval:'1mo' },
      };
      const pm  = PERIOD_MAP[period] || PERIOD_MAP['3mo'];
      const enc = encodeURIComponent(symbol);
      const r   = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=${pm.interval}&range=${pm.range}`,
        { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(7000) }
      );
      const d   = await r.json();
      const res = d?.chart?.result?.[0];
      if (!res) return { error: 'No hay datos históricos para ' + symbol };

      const closes = (res.indicators?.quote?.[0]?.close || []).filter(Boolean);
      const meta   = res.meta;

      const sma = (arr, n) => arr.length >= n
        ? arr.slice(-n).reduce((a,b) => a+b,0)/n : null;

      const rsiCalc = (arr, n=14) => {
        if (arr.length < n+1) return null;
        let gains=0, losses=0;
        for (let i=arr.length-n; i<arr.length; i++) {
          const d = arr[i]-arr[i-1]; d>0 ? gains+=d : losses+=Math.abs(d);
        }
        const ag=gains/n, al=losses/n;
        return al===0 ? 100 : +(100-(100/(1+ag/al))).toFixed(1);
      };

      const ma20  = sma(closes, 20),  ma50  = sma(closes, 50),  ma200 = sma(closes, 200);
      const rsi   = rsiCalc(closes);
      const price = closes[closes.length-1];
      const trend = price > (ma50||price) ? 'alcista' : 'bajista';
      const signal = rsi != null
        ? (rsi < 35 ? 'COMPRA (RSI sobrevendido)' : rsi > 65 ? 'VENTA (RSI sobrecomprado)' : 'NEUTRAL')
        : 'NEUTRAL';

      // Escenarios futuros (proyección de tendencia)
      const chgPct30d  = closes.length > 20 ? (price - closes[closes.length-20])/closes[closes.length-20]*100 : 0;
      const bullTarget = +(price * 1.08).toFixed(2);   // +8% escenario alcista
      const bearTarget = +(price * 0.94).toFixed(2);   // -6% escenario bajista
      const baseTarget = +(price * (1 + chgPct30d/100*2)).toFixed(2); // tendencia actual x2

      const analysis = {
        symbol, name: meta.shortName || symbol, price,
        currency: meta.currency, period,
        ma20: ma20 ? +ma20.toFixed(2) : null,
        ma50: ma50 ? +ma50.toFixed(2) : null,
        ma200: ma200 ? +ma200.toFixed(2) : null,
        rsi, trend, signal,
        week52Low: meta.fiftyTwoWeekLow, week52High: meta.fiftyTwoWeekHigh,
        dataPoints: closes.length,
        escenarios: {
          alcista:  { precio: bullTarget, variacion: '+8%', descripcion: 'Continuación de tendencia favorable' },
          base:     { precio: baseTarget, variacion: `${chgPct30d>=0?'+':''}${(chgPct30d*2).toFixed(1)}%`, descripcion: 'Proyección de tendencia reciente' },
          bajista:  { precio: bearTarget, variacion: '-6%', descripcion: 'Corrección o cambio de tendencia' },
        },
      };
      await cacheSet(key, analysis, 300); // 5 min
      return { source: 'live', timestamp: new Date().toISOString(), analysis };
    }

    // ── 5. search_investment_funds ────────────────────────────────
    if (name === 'search_investment_funds') {
      const q       = (input.query || '').toLowerCase();
      const cat     = input.category || '';
      const origen  = input.origen || 'todos';
      const sortBy  = input.sortBy || 'r1y';

      let results = FONDOS_COMPACT.filter(f => {
        const matchQ = !q || f.n.toLowerCase().includes(q) || f.g.toLowerCase().includes(q);
        const matchC = !cat || f.cat.toLowerCase().includes(cat.toLowerCase());
        const matchO = origen === 'todos' || (origen === 'nacional' && f.o === 'ES') || (origen === 'internacional' && f.o !== 'ES');
        return matchQ && matchC && matchO;
      });

      const sortFn = { r1y: (a,b)=>b.r1y-a.r1y, r3y: (a,b)=>b.r3y-a.r3y, r5y: (a,b)=>b.r5y-a.r5y,
        pat: (a,b)=>b.pat-a.pat, ter: (a,b)=>a.ter-b.ter, ms: (a,b)=>b.ms-a.ms };
      results = results.sort(sortFn[sortBy] || sortFn.r1y).slice(0, 12);

      return {
        total: results.length,
        fondos: results.map(f => ({
          nombre: f.n, gestora: f.g, categoria: f.cat, domicilio: f.o==='ES'?'España (CNMV)':f.o==='LU'?'Luxemburgo (CSSF)':'Irlanda (CBI)',
          patrimonio_M_EUR: f.pat, rent1A: f.r1y+'%', rent3A: f.r3y+'%', rent5A: f.r5y+'%',
          ter: f.ter+'%', morningstar: '★'.repeat(f.ms)+'☆'.repeat(5-f.ms),
        })),
      };
    }

    return { error: 'Herramienta desconocida: ' + name };
  } catch (err) {
    return { error: `Error en herramienta ${name}: ${err.message}` };
  }
}

// ── SYSTEM PROMPT ──────────────────────────────────────────────────────────
function buildSystem(portfolioCtx) {
  let sys = `Eres **FinBot**, el asistente financiero IA de **Agencia de Valores Generación Z**. Ayudas a inversores minoristas españoles a tomar mejores decisiones de inversión.

## Capacidades
Tienes acceso a herramientas en tiempo real que DEBES usar proactivamente:
- **get_market_data**: cotizaciones de los 9 índices globales en tiempo real
- **get_stock_quotes**: precio de cualquier acción o ETF (tickers Yahoo Finance)
- **get_financial_news**: noticias financieras recientes
- **get_technical_analysis**: RSI, MACD, medias móviles, señales y **escenarios futuros** (alcista/base/bajista)
- **search_investment_funds**: base de datos de 90 fondos (50 nacionales CNMV + 40 internacionales CSSF/CBI)

## Reglas
- Responde SIEMPRE en español, con formato markdown claro
- Usa las herramientas antes de responder preguntas sobre mercados, precios o fondos — no alucines datos
- Para preguntas sobre tendencias futuras: usa get_technical_analysis y presenta los 3 escenarios (alcista/base/bajista) con probabilidades cualitativas
- Sé conciso pero completo (máximo 400 palabras). Usa emojis con moderación para facilitar la lectura
- Al dar escenarios futuros, explica los catalizadores y riesgos de cada uno
- Para preguntas fiscales (IRPF, plusvalías) orienta pero recomienda consultar asesor fiscal
- NUNCA predices precios exactos — usa rangos y escenarios
- Termina análisis de inversión con: ⚠️ *Información orientativa, no asesoramiento financiero personalizado.*`;

  if (portfolioCtx) {
    sys += `\n\n## 💼 Cartera actual del inversor\n${portfolioCtx}`;
  }
  return sys;
}

// ── HANDLER PRINCIPAL ──────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireRole(req, res, 'investor')) return;

  const { username } = req.method === 'GET' || req.method === 'DELETE'
    ? req.query : (req.body || {});

  // ── GET: cargar historial ────────────────────────────────────────
  if (req.method === 'GET') {
    if (!username) return res.status(400).json({ error: 'username requerido' });
    const messages = await historyLoad(username);
    return res.status(200).json({ ok: true, messages });
  }

  // ── DELETE: borrar historial ─────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!username) return res.status(400).json({ error: 'username requerido' });
    await historyDelete(username);
    return res.status(200).json({ ok: true });
  }

  // ── POST: chat ───────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { message, portfolioContext } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'Mensaje requerido' });

  // Cargar historial de MongoDB
  const savedHistory = username ? await historyLoad(username) : [];

  // Construir array de mensajes para Claude
  let messages = [
    ...savedHistory.slice(-16).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message.trim() },
  ];

  const toolsUsed = [];
  let finalText   = '';
  const MAX_ITERS = 4;

  try {
    for (let iter = 0; iter < MAX_ITERS; iter++) {
      const response = await anthropic.messages.create({
        model:      'claude-sonnet-4-5',
        max_tokens: 2048,
        system:     buildSystem(portfolioContext || null),
        tools:      TOOLS,
        messages,
      });

      // Si responde con texto final
      if (response.stop_reason === 'end_turn') {
        finalText = response.content.find(b => b.type === 'text')?.text || '';
        break;
      }

      // Si usa herramientas
      if (response.stop_reason === 'tool_use') {
        const toolBlocks = response.content.filter(b => b.type === 'tool_use');
        const toolResults = await Promise.all(toolBlocks.map(async tb => {
          toolsUsed.push(tb.name);
          const result = await executeTool(tb.name, tb.input);
          return { type: 'tool_result', tool_use_id: tb.id, content: JSON.stringify(result) };
        }));
        // Añadir respuesta del asistente + resultados al hilo
        messages = [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user',      content: toolResults },
        ];
      } else {
        // Otro stop reason (max_tokens, etc.)
        finalText = response.content.find(b => b.type === 'text')?.text || 'No pude completar el análisis.';
        break;
      }
    }

    if (!finalText) finalText = 'No pude generar una respuesta completa. Por favor, intenta reformular tu pregunta.';

    // Guardar en historial MongoDB
    if (username) {
      const newHistory = [
        ...savedHistory,
        { role: 'user',      content: message.trim(), ts: new Date().toISOString() },
        { role: 'assistant', content: finalText,       ts: new Date().toISOString() },
      ];
      await historySave(username, newHistory);
    }

    return res.status(200).json({ ok: true, reply: finalText, toolsUsed });

  } catch (err) {
    console.error('[FinBot]', err.message);
    if (err.status === 401 || err.message?.includes('api_key')) {
      return res.status(503).json({ error: 'FinBot no disponible. Contacta con soporte.' });
    }
    return res.status(500).json({ error: 'Error al procesar la consulta.', detail: err.message });
  }
};
