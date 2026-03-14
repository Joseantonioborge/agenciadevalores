/**
 * GET /api/news?symbols=sp500,nasdaq,ibex35
 * Fetches market news from Yahoo Finance RSS for the requested index symbols.
 * Returns up to 20 articles, deduplicated and categorized.
 * Cache: 5 minutes in-memory.
 */

// ── Symbol mapping (key → Yahoo Finance ticker) ──────────────────────────────
const KEY_TO_YF = {
  sp500:      '%5EGSPC',
  nasdaq:     '%5EIXIC',
  dowjones:   '%5EDJI',
  ibex35:     '%5EIBEX',
  dax40:      '%5EGDAXI',
  nikkei225:  '%5EN225',
  hangseng:   '%5EHSI',
  eurostoxx50:'%5ESTOXX50E',
  msciworld:  'URTH',
};

// ── Keyword categorization ───────────────────────────────────────────────────
const RISK_WORDS = [
  'fall','drop','decline','slump','crash','recession','downturn','correction',
  'loss','loses','losing','bearish','bear','sell-off','selloff','tumble',
  'plunge','plunges','warning','risk','fear','fears','concern','concerns',
  'volatile','volatility','uncertainty','slowdown','inflation','default',
  'bankrupt','collapse','crisi','debt','crisis','lower','drops',
];

const OPP_WORDS = [
  'rise','rises','rising','rally','gain','gains','growth','surge','surges',
  'bullish','bull','record','high','all-time','recovery','rebound',
  'outperform','upgrade','buy','opportunity','opportunities','profit','profits',
  'strong','strength','beat','beats','exceed','exceeds','positive','upside',
  'boost','boosts','climb','climbs','jumps','advance','advances',
];

function categorize(title, summary) {
  const text = (title + ' ' + (summary || '')).toLowerCase();
  const riskScore = RISK_WORDS.filter(w => text.includes(w)).length;
  const oppScore  = OPP_WORDS.filter(w => text.includes(w)).length;
  if (riskScore > oppScore) return 'riesgo';
  if (oppScore  > riskScore) return 'oportunidad';
  return 'tendencia';
}

// ── XML helpers ──────────────────────────────────────────────────────────────
function extractCDATA(xml, tag) {
  // Matches both <tag>content</tag> and <tag><![CDATA[content]]></tag>
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 'si');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function parseItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title   = extractCDATA(block, 'title');
    const summary = extractCDATA(block, 'description');
    const pubDate = extractCDATA(block, 'pubDate');
    const source  = extractCDATA(block, 'source') || extractCDATA(block, 'creator') || 'Yahoo Finance';
    if (title) {
      items.push({ title, summary, pubDate, source });
    }
  }
  return items;
}

// ── In-memory cache ──────────────────────────────────────────────────────────
const _cache = new Map(); // key → { ts, articles }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchNewsForSymbol(yfSymbol) {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yfSymbol}&region=US&lang=en-US`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseItems(xml);
}

// ── Handler ──────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  // Parse requested symbols (comma-separated keys)
  const rawSymbols = (req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean);
  const symbols = rawSymbols.length > 0
    ? rawSymbols.filter(k => KEY_TO_YF[k])
    : Object.keys(KEY_TO_YF); // fallback: all

  if (symbols.length === 0) {
    return res.status(400).json({ error: 'Ningún símbolo válido. Usa claves como sp500,nasdaq,ibex35' });
  }

  const cacheKey = symbols.sort().join(',');
  const cached   = _cache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return res.status(200).json({ articles: cached.articles, cached: true });
  }

  try {
    // Fetch all feeds in parallel
    const results = await Promise.allSettled(
      symbols.map(key => fetchNewsForSymbol(KEY_TO_YF[key]).then(items =>
        items.map(a => ({ ...a, indexKey: key }))
      ))
    );

    // Merge and deduplicate by title
    const seen    = new Set();
    const articles = [];

    results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)) // newest first
      .forEach(a => {
        const key = a.title.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!seen.has(key)) {
          seen.add(key);
          articles.push({
            title:     a.title,
            summary:   a.summary
              ? a.summary.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim()
              : '',
            pubDate:   a.pubDate,
            source:    a.source,
            indexKey:  a.indexKey,
            category:  categorize(a.title, a.summary),
          });
        }
      });

    const top20 = articles.slice(0, 20);
    _cache.set(cacheKey, { ts: Date.now(), articles: top20 });

    return res.status(200).json({ articles: top20, cached: false });
  } catch (err) {
    // Return stale cache on error if available
    if (cached) return res.status(200).json({ articles: cached.articles, cached: true, stale: true });
    return res.status(500).json({ error: err.message });
  }
};
