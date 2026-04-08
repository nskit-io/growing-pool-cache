'use strict';

/**
 * GrowingPoolCache
 *
 * A self-growing cache pool for AI-generated content.
 * Balances cost savings with response diversity.
 *
 * @author NSKit <nskit@nskit.io>
 * @license MIT
 */

class GrowingPoolCache {
  /**
   * @param {object} adapter - Storage adapter implementing the required interface
   * @param {object} [options]
   * @param {function} [options.onGrowth] - Called when pool growth is triggered: (key) => void
   * @param {function} [options.onHit] - Called on cache hit: (key, mode) => void
   * @param {function} [options.onMiss] - Called on cache miss: (key) => void
   */
  constructor(adapter, options = {}) {
    if (!adapter) throw new Error('Adapter is required');
    this._adapter = adapter;
    this._onGrowth = options.onGrowth || null;
    this._onHit = options.onHit || null;
    this._onMiss = options.onMiss || null;
  }

  /**
   * Get a cached value.
   *
   * Simple mode: returns the stored value.
   * Pool mode: returns a random value from the pool.
   *   - If the newest entry has reached poolTarget hits and pool is not
   *     already growing, triggers growth (returns null so caller generates
   *     a new response and calls set()).
   *
   * @param {string} key
   * @returns {Promise<*>} Cached value, or null on miss / growth trigger
   */
  async get(key) {
    if (!key) return null;

    const meta = await this._adapter.get(key);
    if (!meta) {
      this._onMiss && this._onMiss(key);
      return null;
    }

    // Check TTL
    if (meta.expiresAt && Date.now() > meta.expiresAt) {
      await this.del(key);
      this._onMiss && this._onMiss(key);
      return null;
    }

    // --- Simple mode ---
    if (meta.poolTarget === null || meta.poolTarget === undefined) {
      // Fire-and-forget hit count increment
      this._adapter.increment(key).catch(() => {});
      this._onHit && this._onHit(key, 'simple');
      return _deserialize(meta.response);
    }

    // --- Pool mode ---
    if (meta.poolSize === 0) {
      this._onMiss && this._onMiss(key);
      return null;
    }

    // Check if newest response needs growth
    const newest = await this._adapter.getNewest(key);
    if (newest && newest.hitCount >= meta.poolTarget && !meta.isGrowing) {
      await this._adapter.setGrowing(key, true);
      this._onGrowth && this._onGrowth(key);
      return null; // Caller should generate new content and call set()
    }

    // Pick random response from pool
    const pick = await this._adapter.getRandom(key);
    if (!pick) {
      this._onMiss && this._onMiss(key);
      return null;
    }

    // Fire-and-forget hit increments
    this._adapter.incrementPoolEntry(key, pick.id).catch(() => {});
    this._adapter.increment(key).catch(() => {});

    this._onHit && this._onHit(key, 'pool');
    return _deserialize(pick.response);
  }

  /**
   * Store a value in the cache.
   *
   * @param {string} key
   * @param {*} value - Any serializable value
   * @param {object} [options]
   * @param {number} [options.ttl] - Time-to-live in seconds
   * @param {number} [options.poolTarget] - Hit count threshold to trigger pool growth.
   *   If set, enables pool mode. If null/undefined, uses simple mode.
   * @returns {Promise<void>}
   */
  async set(key, value, options = {}) {
    if (!key) return;

    const { ttl = null, poolTarget = null } = options;
    const response = _serialize(value);
    const expiresAt = ttl ? Date.now() + ttl * 1000 : null;

    if (poolTarget !== null && poolTarget !== undefined) {
      // Pool mode
      await this._adapter.addToPool(key, response);
      await this._adapter.set(key, {
        response: '',
        poolTarget,
        expiresAt,
        isGrowing: false,
        incrementPoolSize: true,
      });
    } else {
      // Simple mode
      await this._adapter.set(key, {
        response,
        poolTarget: null,
        expiresAt,
        isGrowing: false,
        incrementPoolSize: false,
      });
    }
  }

  /**
   * Delete a cache key and all its pool entries.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async del(key) {
    if (!key) return;
    await this._adapter.delete(key);
  }

  /**
   * Get detailed info about a cache key.
   *
   * @param {string} key
   * @returns {Promise<object|null>}
   */
  async info(key) {
    if (!key) return null;
    const meta = await this._adapter.get(key);
    if (!meta) return null;

    const result = {
      key,
      hitCount: meta.hitCount,
      poolTarget: meta.poolTarget,
      poolSize: meta.poolSize,
      isGrowing: meta.isGrowing,
      createdAt: meta.createdAt,
      expiresAt: meta.expiresAt,
    };

    if (meta.poolTarget !== null && meta.poolTarget !== undefined) {
      result.pool = await this._adapter.getPoolEntries(key);
    }

    return result;
  }

  /**
   * Remove all expired entries.
   *
   * @returns {Promise<number>} Number of purged keys
   */
  async purgeExpired() {
    return this._adapter.purgeExpired();
  }

  /**
   * Get cache statistics.
   *
   * @returns {Promise<object>}
   */
  async stats() {
    return this._adapter.getStats();
  }
}

// --- Serialization helpers ---

function _serialize(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function _deserialize(str) {
  if (typeof str !== 'string') return str;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

module.exports = { GrowingPoolCache };
