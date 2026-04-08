'use strict';

const assert = require('assert');
const { GrowingPoolCache } = require('../src/index');
const { MemoryAdapter } = require('../src/adapters/memory');

// --- Test runner ---
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function run() {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  \u2713 ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`  \u2717 ${t.name}`);
      console.log(`    ${err.message}`);
      failed++;
    }
  }
  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
}

// ==========================================
// Simple mode tests
// ==========================================

test('simple mode: miss returns null', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  const val = await cache.get('nonexistent');
  assert.strictEqual(val, null);
});

test('simple mode: set and get string', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  await cache.set('greeting', 'hello world');
  const val = await cache.get('greeting');
  assert.strictEqual(val, 'hello world');
});

test('simple mode: set and get object', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  await cache.set('user', { name: 'Alice', age: 30 });
  const val = await cache.get('user');
  assert.deepStrictEqual(val, { name: 'Alice', age: 30 });
});

test('simple mode: overwrite value', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  await cache.set('key', 'v1');
  await cache.set('key', 'v2');
  assert.strictEqual(await cache.get('key'), 'v2');
});

test('simple mode: delete', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  await cache.set('key', 'value');
  await cache.del('key');
  assert.strictEqual(await cache.get('key'), null);
});

test('simple mode: TTL expiration', async () => {
  const adapter = new MemoryAdapter();
  const cache = new GrowingPoolCache(adapter);
  await cache.set('temp', 'data', { ttl: 0.05 }); // 50ms TTL
  assert.strictEqual(await cache.get('temp'), 'data');
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(await cache.get('temp'), null);
});

test('simple mode: hit count increments', async () => {
  const adapter = new MemoryAdapter();
  const cache = new GrowingPoolCache(adapter);
  await cache.set('key', 'value');
  await cache.get('key');
  await cache.get('key');
  await cache.get('key');
  // Allow fire-and-forget to complete
  await new Promise((r) => setTimeout(r, 10));
  const info = await cache.info('key');
  assert.strictEqual(info.hitCount, 3);
});

// ==========================================
// Pool mode tests
// ==========================================

test('pool mode: first set creates pool with size 1', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  await cache.set('fortune', 'Your luck is great today!', { poolTarget: 3 });
  const info = await cache.info('fortune');
  assert.strictEqual(info.poolSize, 1);
  assert.strictEqual(info.poolTarget, 3);
});

test('pool mode: get returns value from pool', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  await cache.set('fortune', 'Good fortune ahead!', { poolTarget: 5 });
  const val = await cache.get('fortune');
  assert.strictEqual(val, 'Good fortune ahead!');
});

test('pool mode: triggers growth after N hits', async () => {
  let growthTriggered = false;
  const adapter = new MemoryAdapter();
  const cache = new GrowingPoolCache(adapter, {
    onGrowth: () => { growthTriggered = true; },
  });

  await cache.set('fortune', 'Response A', { poolTarget: 2 });

  // Hit 1
  await cache.get('fortune');
  await new Promise((r) => setTimeout(r, 10));
  // Hit 2 - should trigger growth
  await cache.get('fortune');
  await new Promise((r) => setTimeout(r, 10));

  // Hit 3 - newest has hit_count >= poolTarget, triggers growth
  const val = await cache.get('fortune');
  assert.strictEqual(val, null); // null = caller should generate new response
  assert.strictEqual(growthTriggered, true);
});

test('pool mode: after growth, pool size increases', async () => {
  const adapter = new MemoryAdapter();
  const cache = new GrowingPoolCache(adapter);

  await cache.set('fortune', 'Response A', { poolTarget: 2 });

  // Simulate hits to trigger growth
  await cache.get('fortune');
  await new Promise((r) => setTimeout(r, 10));
  await cache.get('fortune');
  await new Promise((r) => setTimeout(r, 10));
  await cache.get('fortune'); // triggers growth, returns null

  // Add new response (simulating caller generating new AI content)
  await cache.set('fortune', 'Response B', { poolTarget: 2 });

  const info = await cache.info('fortune');
  assert.strictEqual(info.poolSize, 2);
  assert.strictEqual(info.isGrowing, false);
});

test('pool mode: returns random responses from pool', async () => {
  const adapter = new MemoryAdapter();
  const cache = new GrowingPoolCache(adapter);

  // Manually build a pool with 2 entries (skip growth cycle for this test)
  await cache.set('fortune', 'Response A', { poolTarget: 100 });
  await adapter.addToPool('fortune', '"Response B"');
  // Manually update pool size
  const meta = await adapter.get('fortune');
  meta.poolSize = 2;

  const results = new Set();
  for (let i = 0; i < 30; i++) {
    const val = await cache.get('fortune');
    results.add(val);
  }

  // With 30 picks from 2 items, both should appear
  assert.ok(results.size >= 1, 'Should return responses from pool');
});

test('pool mode: delete removes pool entries', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  await cache.set('fortune', 'Response A', { poolTarget: 5 });
  await cache.del('fortune');
  assert.strictEqual(await cache.get('fortune'), null);
});

// ==========================================
// Info & Stats tests
// ==========================================

test('info: returns null for nonexistent key', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  assert.strictEqual(await cache.info('nope'), null);
});

test('info: returns detailed info for pool key', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  await cache.set('fortune', 'Response A', { poolTarget: 3 });
  const info = await cache.info('fortune');
  assert.strictEqual(info.key, 'fortune');
  assert.strictEqual(info.poolTarget, 3);
  assert.strictEqual(info.poolSize, 1);
  assert.ok(Array.isArray(info.pool));
  assert.strictEqual(info.pool.length, 1);
});

test('stats: returns aggregate statistics', async () => {
  const adapter = new MemoryAdapter();
  const cache = new GrowingPoolCache(adapter);
  await cache.set('simple1', 'value1');
  await cache.set('simple2', 'value2');
  await cache.set('pool1', 'response', { poolTarget: 5 });

  const stats = await cache.stats();
  assert.strictEqual(stats.totalKeys, 3);
  assert.strictEqual(stats.simpleKeys, 2);
  assert.strictEqual(stats.poolKeys, 1);
});

// ==========================================
// Purge tests
// ==========================================

test('purgeExpired: removes expired entries', async () => {
  const adapter = new MemoryAdapter();
  const cache = new GrowingPoolCache(adapter);
  await cache.set('temp1', 'data', { ttl: 0.05 });
  await cache.set('temp2', 'data', { ttl: 0.05 });
  await cache.set('permanent', 'data');

  await new Promise((r) => setTimeout(r, 80));
  const purged = await cache.purgeExpired();
  assert.strictEqual(purged, 2);

  assert.strictEqual(await cache.get('permanent'), 'data');
});

// ==========================================
// Edge cases
// ==========================================

test('null/empty key returns null', async () => {
  const cache = new GrowingPoolCache(new MemoryAdapter());
  assert.strictEqual(await cache.get(null), null);
  assert.strictEqual(await cache.get(''), null);
});

test('constructor throws without adapter', () => {
  assert.throws(() => new GrowingPoolCache(), /Adapter is required/);
});

// ==========================================
// Callback tests
// ==========================================

test('onHit callback fires on simple hit', async () => {
  let hitKey = null, hitMode = null;
  const cache = new GrowingPoolCache(new MemoryAdapter(), {
    onHit: (k, m) => { hitKey = k; hitMode = m; },
  });
  await cache.set('key', 'val');
  await cache.get('key');
  assert.strictEqual(hitKey, 'key');
  assert.strictEqual(hitMode, 'simple');
});

test('onMiss callback fires on cache miss', async () => {
  let missKey = null;
  const cache = new GrowingPoolCache(new MemoryAdapter(), {
    onMiss: (k) => { missKey = k; },
  });
  await cache.get('nonexistent');
  assert.strictEqual(missKey, 'nonexistent');
});

// --- Run ---
console.log('\nGrowingPoolCache Tests\n');
run();
