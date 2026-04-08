'use strict';

const { GrowingPoolCache } = require('../src/index');
const { MemoryAdapter } = require('../src/adapters/memory');

async function main() {
  const cache = new GrowingPoolCache(new MemoryAdapter(), {
    onGrowth: (key) => console.log(`[GROWTH] Pool growing for: ${key}`),
    onHit: (key, mode) => console.log(`[HIT] ${key} (${mode})`),
    onMiss: (key) => console.log(`[MISS] ${key}`),
  });

  // -----------------------------------------
  // Simple mode (traditional cache)
  // -----------------------------------------
  console.log('=== Simple Mode ===\n');

  await cache.set('user:123', { name: 'Alice', role: 'admin' });
  const user = await cache.get('user:123');
  console.log('Cached user:', user);

  // With TTL (expires in 60 seconds)
  await cache.set('session:abc', { token: 'xyz' }, { ttl: 60 });

  // -----------------------------------------
  // Pool mode (growing pool for AI responses)
  // -----------------------------------------
  console.log('\n=== Pool Mode ===\n');

  // First response — pool size = 1
  await cache.set('fortune:general', 'Great things await you today!', { poolTarget: 3 });
  console.log('Pool created. Getting cached fortune:');

  // These hits return the same response (only 1 in pool)
  for (let i = 0; i < 3; i++) {
    const fortune = await cache.get('fortune:general');
    console.log(`  Fortune: ${fortune}`);
    await new Promise((r) => setTimeout(r, 10)); // let fire-and-forget complete
  }

  // 4th get: newest entry has 3+ hits → triggers growth + still returns response
  console.log('\n4th request triggers growth (onGrowth callback fires):');
  const stillReturnsValue = await cache.get('fortune:general');
  console.log(`  Result: ${stillReturnsValue} (response returned + growth triggered async)`);

  // In onGrowth callback, caller generates a new AI response and stores it
  await cache.set('fortune:general', 'Today is your lucky day!', { poolTarget: 3 });

  console.log('\nPool now has 2 responses. Random picks:');
  for (let i = 0; i < 6; i++) {
    const fortune = await cache.get('fortune:general');
    console.log(`  Fortune: ${fortune}`);
  }

  // -----------------------------------------
  // Info & Stats
  // -----------------------------------------
  console.log('\n=== Info & Stats ===\n');
  const info = await cache.info('fortune:general');
  console.log('Pool info:', JSON.stringify(info, null, 2));

  const stats = await cache.stats();
  console.log('Cache stats:', stats);
}

main().catch(console.error);
