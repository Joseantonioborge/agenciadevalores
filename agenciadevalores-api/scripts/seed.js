// Script de seed inicial para MongoDB Atlas
// Uso: MONGODB_URI="mongodb+srv://..." node scripts/seed.js
// Crea: 1 admin + 2 inversores de ejemplo

const { MongoClient } = require('mongodb');
const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('❌ Falta MONGODB_URI'); process.exit(1); }

async function seed() {
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db('agenciadevalores');

  // Índices únicos
  await db.collection('inversores').createIndex({ username: 1 }, { unique: true });

  // Usuarios iniciales
  const users = [
    {
      username: 'admin',
      password: sha256('Admin2024!'),
      name: 'Administrador',
      email: 'admin@agenciadevalores.com',
      role: 'admin',
      watchlist: ['^IBEX', '^GSPC', '^IXIC', '^GDAXI', '^DJI'],
      createdAt: new Date(),
    },
    {
      username: 'inversor1',
      password: sha256('Inversor2024!'),
      name: 'Carlos García',
      email: 'carlos@ejemplo.com',
      role: 'investor',
      watchlist: ['^IBEX', '^GSPC', '^GDAXI'],
      createdAt: new Date(),
    },
    {
      username: 'inversor2',
      password: sha256('Inversor2024!'),
      name: 'Ana Martínez',
      email: 'ana@ejemplo.com',
      role: 'investor',
      watchlist: ['^IXIC', '^N225', 'URTH'],
      createdAt: new Date(),
    },
  ];

  for (const u of users) {
    try {
      await db.collection('inversores').insertOne(u);
      console.log(`✅ Creado: ${u.username} (${u.role})`);
    } catch (e) {
      if (e.code === 11000) console.log(`⚠️  Ya existe: ${u.username}`);
      else console.error(`❌ Error ${u.username}:`, e.message);
    }
  }

  await client.close();
  console.log('\n🌱 Seed completado');
  console.log('Admin: admin / Admin2024!');
  console.log('Inversor1: inversor1 / Inversor2024!');
  console.log('Inversor2: inversor2 / Inversor2024!');
}

seed().catch(console.error);
