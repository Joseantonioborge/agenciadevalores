const { MongoClient } = require('mongodb');

const URI = process.env.MONGODB_URI;
const DB  = 'agenciadevalores';

let client = null;

async function getDb() {
  if (!client) {
    client = new MongoClient(URI, {
      maxPoolSize: 5,
      connectTimeoutMS: 8000,
      serverSelectionTimeoutMS: 8000,
    });
    await client.connect();
  } else {
    // Reconexión resiliente en serverless (manejo de Topology closed)
    try {
      await client.db('admin').command({ ping: 1 });
    } catch {
      client = new MongoClient(URI, { maxPoolSize: 5, connectTimeoutMS: 8000, serverSelectionTimeoutMS: 8000 });
      await client.connect();
    }
  }
  return client.db(DB);
}

module.exports = { getDb };
