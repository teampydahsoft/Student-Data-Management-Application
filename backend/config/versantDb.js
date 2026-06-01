const { MongoClient } = require('mongodb');
require('dotenv').config();

const DB_NAME = process.env.MONGODB_DB_NAME || 'crt';

let client = null;
let db = null;
let connectPromise = null;

/**
 * Read-only AI-VERSANT MongoDB (crt database).
 * Set MONGODB_URI in .env (copy from AI-VERSANT project).
 */
async function getVersantDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  if (db) return db;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    client = new MongoClient(uri, {
      readPreference: 'secondaryPreferred',
      maxPoolSize: 10,
    });
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`✅ AI-VERSANT MongoDB connected (database: ${DB_NAME})`);
    return db;
  })();

  try {
    return await connectPromise;
  } catch (err) {
    connectPromise = null;
    throw err;
  }
}

async function closeVersantDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

function isVersantConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

module.exports = { getVersantDb, closeVersantDb, isVersantConfigured, DB_NAME };
