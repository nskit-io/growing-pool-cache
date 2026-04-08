'use strict';

/**
 * MySQL adapter for GrowingPoolCache.
 *
 * Requires two tables — see schema below.
 *
 * Schema:
 *
 * ```sql
 * CREATE TABLE response_cache (
 *   cache_key    VARCHAR(255) PRIMARY KEY,
 *   response     LONGTEXT,
 *   hit_count    INT DEFAULT 0,
 *   pool_target  INT DEFAULT NULL,
 *   pool_size    INT DEFAULT 0,
 *   is_growing   TINYINT(1) DEFAULT 0,
 *   created_at   DATETIME(3) DEFAULT NOW(3),
 *   expires_at   DATETIME(3) DEFAULT NULL
 * );
 *
 * CREATE TABLE response_cache_pool (
 *   id           INT AUTO_INCREMENT PRIMARY KEY,
 *   cache_key    VARCHAR(255) NOT NULL,
 *   response     LONGTEXT NOT NULL,
 *   hit_count    INT DEFAULT 0,
 *   created_at   DATETIME(3) DEFAULT NOW(3),
 *   INDEX idx_cache_key (cache_key)
 * );
 * ```
 */
class MySQLAdapter {
  /**
   * @param {object} pool - mysql2/promise pool instance
   */
  constructor(pool) {
    this._db = pool;
  }

  async get(key) {
    const [rows] = await this._db.execute(
      `SELECT response, hit_count, pool_target, pool_size, is_growing,
              UNIX_TIMESTAMP(created_at)*1000 AS createdAt,
              CASE WHEN expires_at IS NOT NULL THEN UNIX_TIMESTAMP(expires_at)*1000 ELSE NULL END AS expiresAt
       FROM response_cache
       WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > NOW(3))`,
      [key]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      response: r.response,
      hitCount: r.hit_count,
      poolTarget: r.pool_target,
      poolSize: r.pool_size,
      isGrowing: !!r.is_growing,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    };
  }

  async set(key, data) {
    const expiresAt = data.expiresAt
      ? new Date(data.expiresAt).toISOString().slice(0, 23).replace('T', ' ')
      : null;

    if (data.incrementPoolSize) {
      await this._db.query(
        `INSERT INTO response_cache (cache_key, response, hit_count, pool_target, pool_size, is_growing, created_at, expires_at)
         VALUES (?, '', 0, ?, 1, 0, NOW(3), ?)
         ON DUPLICATE KEY UPDATE pool_size = pool_size + 1, is_growing = 0,
           pool_target = VALUES(pool_target),
           expires_at = COALESCE(VALUES(expires_at), expires_at)`,
        [key, data.poolTarget, expiresAt]
      );
    } else {
      await this._db.query(
        `INSERT INTO response_cache (cache_key, response, hit_count, created_at, expires_at)
         VALUES (?, ?, 0, NOW(3), ?)
         ON DUPLICATE KEY UPDATE response = VALUES(response), hit_count = 0,
           created_at = NOW(3), expires_at = VALUES(expires_at)`,
        [key, data.response, expiresAt]
      );
    }
  }

  async increment(key) {
    await this._db.execute(
      'UPDATE response_cache SET hit_count = hit_count + 1 WHERE cache_key = ?',
      [key]
    );
  }

  async setGrowing(key, value) {
    await this._db.execute(
      'UPDATE response_cache SET is_growing = ? WHERE cache_key = ?',
      [value ? 1 : 0, key]
    );
  }

  async getNewest(key) {
    const [rows] = await this._db.execute(
      'SELECT id, hit_count AS hitCount FROM response_cache_pool WHERE cache_key = ? ORDER BY id DESC LIMIT 1',
      [key]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async getRandom(key) {
    const [rows] = await this._db.execute(
      'SELECT id, response FROM response_cache_pool WHERE cache_key = ?',
      [key]
    );
    if (rows.length === 0) return null;
    return rows[Math.floor(Math.random() * rows.length)];
  }

  async addToPool(key, response) {
    await this._db.execute(
      'INSERT INTO response_cache_pool (cache_key, response, hit_count, created_at) VALUES (?, ?, 0, NOW(3))',
      [key, response]
    );
  }

  async incrementPoolEntry(key, entryId) {
    await this._db.execute(
      'UPDATE response_cache_pool SET hit_count = hit_count + 1 WHERE id = ?',
      [entryId]
    );
  }

  async getPoolEntries(key) {
    const [rows] = await this._db.execute(
      'SELECT id, hit_count AS hitCount, UNIX_TIMESTAMP(created_at)*1000 AS createdAt FROM response_cache_pool WHERE cache_key = ? ORDER BY id',
      [key]
    );
    return rows;
  }

  async delete(key) {
    await this._db.execute('DELETE FROM response_cache_pool WHERE cache_key = ?', [key]);
    await this._db.execute('DELETE FROM response_cache WHERE cache_key = ?', [key]);
  }

  async purgeExpired() {
    const [expired] = await this._db.execute(
      "SELECT cache_key FROM response_cache WHERE expires_at IS NOT NULL AND expires_at <= NOW(3)"
    );
    if (expired.length === 0) return 0;

    const keys = expired.map((r) => r.cache_key);
    const placeholders = keys.map(() => '?').join(',');
    await this._db.execute(`DELETE FROM response_cache_pool WHERE cache_key IN (${placeholders})`, keys);
    await this._db.execute(`DELETE FROM response_cache WHERE cache_key IN (${placeholders})`, keys);
    return expired.length;
  }

  async getStats() {
    const [rows] = await this._db.execute(
      `SELECT
         COUNT(*) AS totalKeys,
         COALESCE(SUM(hit_count), 0) AS totalHits,
         SUM(CASE WHEN pool_target IS NOT NULL THEN 1 ELSE 0 END) AS poolKeys,
         SUM(CASE WHEN pool_target IS NULL THEN 1 ELSE 0 END) AS simpleKeys,
         COALESCE(SUM(pool_size), 0) AS totalPoolResponses,
         SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW(3) THEN 1 ELSE 0 END) AS expired
       FROM response_cache`
    );
    return rows[0];
  }
}

module.exports = { MySQLAdapter };
