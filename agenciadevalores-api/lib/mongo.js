const { MongoClient, ServerApiVersion } = require('mongodb');

const URI = process.env.MONGODB_URI;
const DB  = 'agenciadevalores';

// Opciones recomendadas por MongoDB Atlas para entornos serverless.
// Resuelven los errores intermitentes de certificado TLS que aparecen en
// cold starts de Vercel (handshake SSL contra el cluster Atlas):
//   - serverApi v1 → estabiliza la negociación de protocolo
//   - tls explícito + retry → driver toma su propio CA bundle, evita
//     conflictos con el bundle del runtime Node 20.x del sandbox
//   - retryWrites/retryReads → si el primer intento falla por TLS reset,
//     el driver reintenta automáticamente sin propagar el error
function buildClient() {
  return new MongoClient(URI, {
    maxPoolSize: 5,
    minPoolSize: 0,
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    tls: true,
    retryWrites: true,
    retryReads: true,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
  });
}

// Cacheamos la PROMESA de conexión (no el cliente) para que múltiples
// invocaciones concurrentes durante un cold start compartan la misma
// negociación TLS en lugar de abrir varias en paralelo (que es la causa
// raíz del error intermitente de certificado).
let clientPromise = null;

function _connect() {
  clientPromise = buildClient().connect().catch(err => {
    // Si la conexión inicial falla, descarta la promesa para que la
    // próxima invocación reintente desde cero en vez de heredar el rechazo.
    clientPromise = null;
    throw err;
  });
  return clientPromise;
}

async function getDb() {
  if (!clientPromise) await _connect();
  let client;
  try {
    client = await clientPromise;
    // Smoke test ligero: detecta "Topology closed" o sockets caídos.
    await client.db('admin').command({ ping: 1 });
  } catch (err) {
    // Reset y reintenta UNA vez con cliente nuevo. Si vuelve a fallar
    // propagamos el error original (la siguiente invocación lo intentará
    // de cero al estar `clientPromise` ya en null).
    try { (await clientPromise)?.close().catch(() => {}); } catch {}
    clientPromise = null;
    await _connect();
    client = await clientPromise;
  }
  return client.db(DB);
}

module.exports = { getDb };
