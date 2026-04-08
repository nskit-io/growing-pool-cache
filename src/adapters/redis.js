'use strict';

/**
 * Redis adapter for GrowingPoolCache.
 *
 * Key layout:
 *   gpc:{key}          — Hash: response, hitCount, poolTarget, poolSize, isGrowing, createdAt, expiresAt
 *   gpc:{key}:pool     — Sorted set (score = entry id)
 *   gpc:{key}:pool:{n} — Hash: response, hitCount, createdAt
 *   gpc:keys            — Set of all cache keys (for stats/purge)
 *
 * Requires: ioredis or redis@4+ compatible client
 */
class RedisAdapter {
  /**
   * @param {object} client - Redis client instance (ioredis or node-redis)
   * @param {object} [options]
   * @param {string} [options.prefix='gpc'] - Key prefix
   */
  constructor(client, options = {}) {
    this._redis = client;
    this._prefix = options.prefix || 'gpc';
  }

  _key(key) {
    return `${this._prefix}:${key}`;
  }

  async get(key) {
    const data = await this._redis.hgetall(this._key(key));
    if (!data || !data.createdAt) return null;
    return {
      response: data.response || '',
      hitCount: parseInt(data.hitCount, 10) || 0,
      poolTarget: data.poolTarget === 'null' ? null : parseInt(data.poolTarget, 10),
      poolSize: parseInt(data.poolSize, 10) || 0,
      isGrowing: data.isGrowing === '1',
      createdAt: parseInt(data.createdAt, 10),
      expiresAt: data.expiresAt === 'null' ? null : parseInt(data.expiresAt, 10),
    };
  }

  async set(key, data) {
    const k = this._key(key);
    const exists = await this._redis.exists(k);

    if (data.incrementPoolSize && exists) {
      await this._redis.hincrby(k, 'poolSize', 1);
      await this._redis.hset(k, 'isGrowing', '0');
      if (data.poolTarget !== null) await this._redis.hset(k, 'poolTarget', String(data.poolTarget));
      if (data.expiresAt !== null) await this._redis.hset(k, 'expiresAt', String(data.expiresAt));
    } else if (data.incrementPoolSize) {
      await this._redis.hset(k, {
        response: '',
        hitCount: '0',
        poolTarget: String(data.poolTarget),
        poolSize: '1',
        isGrowing: '0',
        createdAt: String(Date.now()),
        expiresAt: data.expiresAt ? String(data.expiresAt) : 'null',
      });
    } else {
      await this._redis.hset(k, {
        response: data.response,
        hitCount: '0',
        poolTarget: data.poolTarget !== null ? String(data.poolTarget) : 'null',
        poolSize: '0',
        isGrowing: '0',
        createdAt: String(Date.now()),
        expiresAt: data.expiresAt ? String(data.expiresAt) : 'null',
      });
    }

    // Track key for stats/purge
    await this._redis.sadd(`${this._prefix}:keys`, key);

    // Set Redis TTL if expiresAt is defined
    if (data.expiresAt) {
      const ttlMs = data.expiresAt - Date.now();
      if (ttlMs > 0) await this._redis.pexpire(k, ttlMs);
    }
  }

  async increment(key) {
    await this._redis.hincrby(this._key(key), 'hitCount', 1);
  }

  async setGrowing(key, value) {
    await this._redis.hset(this._key(key), 'isGrowing', value ? '1' : '0');
  }

  async getNewest(key) {
    const members = await this._redis.zrevrange(`${this._key(key)}:pool`, 0, 0);
    if (!members || members.length === 0) return null;
    const entryId = members[0];
    const data = await this._redis.hgetall(`${this._key(key)}:pool:${entryId}`);
    return {
      id: entryId,
      hitCount: parseInt(data.hitCount, 10) || 0,
    };
  }

  async getRandom(key) {
    const members = await this._redis.zrange(`${this._key(key)}:pool`, 0, -1);
    if (!members || members.length === 0) return null;
    const entryId = members[Math.floor(Math.random() * members.length)];
    const data = await this._redis.hgetall(`${this._key(key)}:pool:${entryId}`);
    return {
      id: entryId,
      response: data.response,
    };
  }

  async addToPool(key, response) {
    const entryId = await this._redis.incr(`${this._prefix}:seq`);
    const poolKey = `${this._key(key)}:pool`;
    await this._redis.zadd(poolKey, entryId, String(entryId));
    await this._redis.hset(`${poolKey}:${entryId}`, {
      response,
      hitCount: '0',
      createdAt: String(Date.now()),
    });
  }

  async incrementPoolEntry(key, entryId) {
    await this._redis.hincrby(`${this._key(key)}:pool:${entryId}`, 'hitCount', 1);
  }

  async getPoolEntries(key) {
    const members = await this._redis.zrange(`${this._key(key)}:pool`, 0, -1);
    const entries = [];
    for (const entryId of members) {
      const data = await this._redis.hgetall(`${this._key(key)}:pool:${entryId}`);
      entries.push({
        id: entryId,
        hitCount: parseInt(data.hitCount, 10) || 0,
        createdAt: parseInt(data.createdAt, 10),
      });
    }
    return entries;
  }

  async delete(key) {
    const members = await this._redis.zrange(`${this._key(key)}:pool`, 0, -1);
    const pipeline = this._redis.pipeline();
    for (const entryId of members) {
      pipeline.del(`${this._key(key)}:pool:${entryId}`);
    }
    pipeline.del(`${this._key(key)}:pool`);
    pipeline.del(this._key(key));
    pipeline.srem(`${this._prefix}:keys`, key);
    await pipeline.exec();
  }

  async purgeExpired() {
    const keys = await this._redis.smembers(`${this._prefix}:keys`);
    const now = Date.now();
    let count = 0;
    for (const key of keys) {
      const expiresAt = await this._redis.hget(this._key(key), 'expiresAt');
      if (expiresAt && expiresAt !== 'null' && now > parseInt(expiresAt, 10)) {
        await this.delete(key);
        count++;
      }
    }
    return count;
  }

  async getStats() {
    const keys = await this._redis.smembers(`${this._prefix}:keys`);
    let totalHits = 0, poolKeys = 0, simpleKeys = 0, totalPoolResponses = 0, expired = 0;
    const now = Date.now();
    for (const key of keys) {
      const data = await this._redis.hgetall(this._key(key));
      if (!data || !data.createdAt) continue;
      totalHits += parseInt(data.hitCount, 10) || 0;
      if (data.poolTarget !== 'null') {
        poolKeys++;
        totalPoolResponses += parseInt(data.poolSize, 10) || 0;
      } else {
        simpleKeys++;
      }
      if (data.expiresAt !== 'null' && now > parseInt(data.expiresAt, 10)) expired++;
    }
    return { totalKeys: keys.length, totalHits, poolKeys, simpleKeys, totalPoolResponses, expired };
  }
}

module.exports = { RedisAdapter };
