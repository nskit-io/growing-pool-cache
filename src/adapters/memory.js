'use strict';

/**
 * In-memory adapter for GrowingPoolCache.
 * Fully functional — suitable for testing, prototyping, and single-process apps.
 */
class MemoryAdapter {
  constructor() {
    /** @type {Map<string, object>} */
    this._store = new Map();
    /** @type {Map<string, Array<object>>} */
    this._pool = new Map();
    this._nextId = 1;
  }

  async get(key) {
    return this._store.get(key) || null;
  }

  async set(key, data) {
    const existing = this._store.get(key);

    if (existing && data.incrementPoolSize) {
      // Pool growth — update metadata
      existing.poolSize = (existing.poolSize || 0) + 1;
      existing.isGrowing = false;
      existing.poolTarget = data.poolTarget;
      if (data.expiresAt !== null) existing.expiresAt = data.expiresAt;
    } else if (existing && data.poolTarget !== null && data.incrementPoolSize) {
      existing.poolSize = (existing.poolSize || 0) + 1;
      existing.isGrowing = false;
    } else {
      this._store.set(key, {
        response: data.response,
        hitCount: 0,
        poolTarget: data.poolTarget,
        poolSize: data.incrementPoolSize ? 1 : 0,
        isGrowing: false,
        createdAt: Date.now(),
        expiresAt: data.expiresAt,
      });
    }
  }

  async increment(key) {
    const entry = this._store.get(key);
    if (entry) entry.hitCount++;
  }

  async setGrowing(key, value) {
    const entry = this._store.get(key);
    if (entry) entry.isGrowing = !!value;
  }

  async getNewest(key) {
    const entries = this._pool.get(key);
    if (!entries || entries.length === 0) return null;
    return entries[entries.length - 1];
  }

  async getRandom(key) {
    const entries = this._pool.get(key);
    if (!entries || entries.length === 0) return null;
    return entries[Math.floor(Math.random() * entries.length)];
  }

  async addToPool(key, response) {
    if (!this._pool.has(key)) this._pool.set(key, []);
    this._pool.get(key).push({
      id: this._nextId++,
      response,
      hitCount: 0,
      createdAt: Date.now(),
    });
  }

  async incrementPoolEntry(key, entryId) {
    const entries = this._pool.get(key);
    if (!entries) return;
    const entry = entries.find((e) => e.id === entryId);
    if (entry) entry.hitCount++;
  }

  async getPoolEntries(key) {
    return this._pool.get(key) || [];
  }

  async delete(key) {
    this._store.delete(key);
    this._pool.delete(key);
  }

  async purgeExpired() {
    const now = Date.now();
    let count = 0;
    for (const [key, meta] of this._store) {
      if (meta.expiresAt && now > meta.expiresAt) {
        this._store.delete(key);
        this._pool.delete(key);
        count++;
      }
    }
    return count;
  }

  async getStats() {
    let totalHits = 0;
    let poolKeys = 0;
    let simpleKeys = 0;
    let totalPoolResponses = 0;
    let expired = 0;
    const now = Date.now();

    for (const [, meta] of this._store) {
      totalHits += meta.hitCount;
      if (meta.poolTarget !== null && meta.poolTarget !== undefined) {
        poolKeys++;
        totalPoolResponses += meta.poolSize || 0;
      } else {
        simpleKeys++;
      }
      if (meta.expiresAt && now > meta.expiresAt) expired++;
    }

    return {
      totalKeys: this._store.size,
      totalHits,
      poolKeys,
      simpleKeys,
      totalPoolResponses,
      expired,
    };
  }

  /** Clear all data (useful in tests). */
  async clear() {
    this._store.clear();
    this._pool.clear();
  }
}

module.exports = { MemoryAdapter };
