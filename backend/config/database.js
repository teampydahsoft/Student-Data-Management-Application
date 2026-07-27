const mysql = require('mysql2');
require('dotenv').config();

const RETRYABLE_DB_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
]);

/**
 * Wrap promise pool query/execute with automatic retry for stale/dropped connections.
 * MySQL servers (esp. remote/cloud) close idle sockets; the pool may hand out a dead one.
 */
const wrapPoolWithRetry = (pool, maxRetries = 3) => {
  const retry = (methodName) => async (...args) => {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await pool[methodName](...args);
      } catch (error) {
        lastError = error;
        const retryable = RETRYABLE_DB_CODES.has(error.code);
        if (!retryable || attempt === maxRetries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 80 * attempt));
      }
    }
    throw lastError;
  };

  return {
    query: retry('query'),
    execute: retry('execute'),
    getConnection: (...args) => pool.getConnection(...args),
    end: (...args) => pool.end(...args),
    on: (...args) => pool.on(...args),
    pool,
  };
};

const sharedPoolOptions = {
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000, // TCP keepalive after 10s idle
  idleTimeout: 30000, // Drop idle pool connections before server wait_timeout
  maxIdle: 5,
  multipleStatements: false,
  timezone: '+05:30',
};

// Master DB connection pool with enhanced configuration for performance
const masterPoolRaw = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'student_database',
  port: process.env.DB_PORT || 3306,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 20,
  ...sharedPoolOptions,
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false,
  } : false,
});

// Enforce IST on every connection establishment
masterPoolRaw.on('connection', (connection) => {
  connection.query('SET time_zone = "+05:30"');
});

// Staging DB connection pool (for pending/unapproved submissions)
const stagingPoolRaw = mysql.createPool({
  host: process.env.STAGING_DB_HOST || process.env.DB_HOST || 'localhost',
  user: process.env.STAGING_DB_USER || process.env.DB_USER || 'root',
  password: process.env.STAGING_DB_PASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.STAGING_DB_NAME || 'student_staging',
  port: process.env.STAGING_DB_PORT || process.env.DB_PORT || 3306,
  connectionLimit: 10,
  ...sharedPoolOptions,
});

// Enforce IST on every connection establishment
stagingPoolRaw.on('connection', (connection) => {
  connection.query('SET time_zone = "+05:30"');
});

// Promise-based pools with connection-lost retry
const masterPool = wrapPoolWithRetry(masterPoolRaw.promise());
const stagingPool = wrapPoolWithRetry(stagingPoolRaw.promise());

// Test connections with retry logic
const testConnection = async (retries = 3) => {
  let dbConnected = false;

  for (let i = 0; i < retries; i++) {
    try {
      const conn = await masterPool.getConnection();
      conn.release();
      dbConnected = true;
      break;
    } catch (error) {
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  return dbConnected;
};

module.exports = {
  masterPool,
  stagingPool,
  // Backward compat: default pool points to master
  pool: masterPool,
  testConnection
};
