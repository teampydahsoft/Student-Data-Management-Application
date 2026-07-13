class SimpleCache {
  constructor(defaultTtlMs = 60000) {
    this.defaultTtlMs = defaultTtlMs;
    this.store = new Map();
  }

  get(key) {
    if (!this.store.has(key)) {
      return null;
    }

    const entry = this.store.get(key);

    if (!entry || entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttlMs) {
    const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  has(key) {
    return this.get(key) !== null;
  }

  size() {
    return this.store.size;
  }
}

const createCache = (defaultTtlMs) => new SimpleCache(defaultTtlMs);

// Optimized cache TTLs for better performance
const studentsCache = createCache(5 * 60 * 1000); // 5 minutes default TTL (increased from 1 minute)
const filterOptionsCache = createCache(10 * 60 * 1000); // 10 minutes for filter options (rarely change)
const statsCache = createCache(2 * 60 * 1000); // 2 minutes for dashboard stats
const registrationAbstractCache = createCache(3 * 60 * 1000); // 3 minutes — abstract recomputes optional-stage totals
const registrationStatsCache = createCache(2 * 60 * 1000); // 2 minutes — overall stats independent of pagination

module.exports = {
  SimpleCache,
  createCache,
  studentsCache,
  filterOptionsCache,
  statsCache,
  registrationAbstractCache,
  registrationStatsCache,
  otpCache: createCache(5 * 60 * 1000) // 5 minutes TTL for OTPs
};

