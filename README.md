# Agencia de Valores — Dashboard & Portal de Inversores

Portal profesional de seguimiento de mercados financieros globales con análisis técnico y portal privado para inversores.

## Características

- **Dashboard en tiempo real** — 9 índices bursátiles (IBEX 35, DAX 40, NASDAQ, S&P 500, Dow Jones, Nikkei 225, Hang Seng, Euro Stoxx 50, MSCI World)
- **Análisis técnico** — MA20/50/200, RSI, MACD, Bandas de Bollinger, señales BUY/SELL/NEUTRAL
- **Gráficos interactivos** — TradingView Lightweight Charts (open source)
- **Portal de inversores** — Login seguro, watchlist personalizable, historial de sesiones
- **Panel de administración** — CRUD de inversores, registros de acceso, valoraciones
- **Backend serverless** — Vercel + MongoDB Atlas

## Estructura

```
agenciadevalores/
├── index.html                    # SPA principal (frontend completo)
├── agenciadevalores-api/         # Backend Vercel (serverless)
│   ├── api/
│   │   ├── health.js
│   │   ├── market.js             # Proxy datos tiempo real (Yahoo Finance)
│   │   ├── historical.js         # Histórico + análisis técnico
│   │   ├── auth.js               # Autenticación inversores
│   │   ├── investors.js          # CRUD inversores
│   │   ├── access_logs.js
│   │   └── ratings.js
│   ├── lib/
│   │   ├── mongo.js
│   │   └── auth.js
│   ├── scripts/seed.js           # Seed inicial de usuarios
│   ├── package.json
│   └── vercel.json
└── README.md
```

## Deploy

### 1. MongoDB Atlas
1. Crear cluster gratuito M0 en [mongodb.com](https://mongodb.com)
2. Crear base de datos `agenciadevalores`
3. Obtener connection string: `mongodb+srv://user:pass@cluster.mongodb.net/`
4. Ejecutar seed: `MONGODB_URI="tu-uri" node agenciadevalores-api/scripts/seed.js`

### 2. Vercel API
1. Conectar carpeta `agenciadevalores-api/` como nuevo proyecto en [vercel.com](https://vercel.com)
2. Añadir variables de entorno:
   - `MONGODB_URI` — connection string de MongoDB
   - `API_KEY_ADMIN` — clave aleatoria para admin (ej: `openssl rand -hex 32`)
   - `API_KEY_INVESTOR` — clave aleatoria para inversores
3. Desplegar → obtendrás URL tipo `https://agenciadevalores-api.vercel.app`

### 3. Frontend
1. En `index.html`, actualizar:
   ```js
   const API_BASE         = 'https://agenciadevalores-api.vercel.app/api';
   const API_KEY_INVESTOR = 'tu-investor-key';
   const API_KEY_ADMIN    = 'tu-admin-key';  // ⚠️ Solo si el portal es privado
   ```
2. Desplegar `index.html` en Vercel como sitio estático

### Credenciales iniciales (después del seed)
- Admin: `admin` / `Admin2024!`
- Inversor 1: `inversor1` / `Inversor2024!`
- Inversor 2: `inversor2` / `Inversor2024!`

## Fuentes de datos
- **Datos de mercado**: Yahoo Finance v8 API (proxy via backend Vercel)
- **Indicadores técnicos**: Calculados en backend (JS puro, sin librerías externas)
- **Gráficos**: [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) (MIT)
