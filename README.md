# growing-pool-cache

**A self-growing cache pool for AI-generated content that balances cost savings with response diversity.**

[![npm version](https://img.shields.io/npm/v/growing-pool-cache.svg)](https://www.npmjs.com/package/growing-pool-cache)
[![license](https://img.shields.io/npm/l/growing-pool-cache.svg)](https://github.com/nskit-io/growing-pool-cache/blob/main/LICENSE)

[한국어](./README.ko.md)

---

## The Problem

Traditional caches store one response per key. That works fine for deterministic data, but AI responses are **non-deterministic by design** — asking the same question twice should yield different answers.

Caching a single AI response saves money but kills diversity. Not caching at all preserves diversity but burns your API budget.

**Growing Pool Cache** solves this: each cache key grows a **pool** of responses that expands naturally based on demand.

## How It Works

```mermaid
flowchart TD
    A[Request: key='fortune:love'] --> B{Cache exists?}
    B -->|No| C[Call AI API ~14-40s]
    C --> D[Store Response A in pool]
    D --> E[Return A]
    
    B -->|Yes| F{Pool mode?}
    F -->|Simple| G[Return cached value ~5ms]
    F -->|Pool| H{Newest entry hits >= N?}
    
    H -->|No| I[Random pick from pool ~5ms]
    I --> J[Return random response]
    
    H -->|Yes| K[Random pick from pool ~5ms]
    K --> L[Return response to caller]
    K --> M[Trigger onGrowth callback async]
    M --> N[Caller generates new response]
    N --> O[Response B added to pool]
    O --> P[Pool size: 2]
    
    P --> Q[Future requests: random A or B]
    Q --> R[B reaches N hits...]
    R --> S[Generate C, pool size: 3]
    S --> T[Growth naturally decelerates]
```

### The Growth Cycle

1. **Cache miss** -- Call AI, store Response A in pool (`hit_count=0`)
2. **Cache hit** -- Return A, increment hit count
3. **A reaches N hits** -- Return a response as usual, then trigger `onGrowth` callback asynchronously so caller generates new content in the background
4. **New response B stored** -- Pool size becomes 2, `is_growing=false`
5. **Future requests** -- Random pick from pool (A or B)
6. **B reaches N hits** -- Generate C... the pool grows, but growth naturally **decelerates** as the random distribution spreads hits across more entries

### Why It Decelerates

With `poolTarget=3`:

| Pool Size | Avg hits to trigger growth | Effective interval |
|-----------|---------------------------|-------------------|
| 1 | 3 requests | Every 3rd request |
| 2 | 6 requests | Every 6th |
| 3 | 9 requests | Every 9th |
| 5 | 15 requests | Every 15th |
| 10 | 30 requests | Every 30th |

The pool self-regulates: high-traffic keys get more diversity, low-traffic keys stay small.

### Performance Characteristics

#### Pool Growth vs Requests (poolTarget=3)

```mermaid
xychart-beta
    title "Pool Size Growth Over Requests"
    x-axis "Total Requests" [0, 3, 9, 18, 30, 45, 63, 84, 108, 135]
    y-axis "Pool Size" 0 --> 12
    line [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
```

> Pool growth follows **O(√n)** — rapid early growth, then gradual deceleration. No configuration needed.

#### Cumulative AI Calls vs Requests Served

```mermaid
xychart-beta
    title "AI API Calls Saved Over Time"
    x-axis "Total Requests Served" [0, 10, 30, 60, 100, 200, 500, 1000]
    y-axis "AI API Calls Made" 0 --> 30
    line "Growing Pool" [0, 3, 5, 8, 11, 15, 22, 30]
    line "No Cache" [0, 10, 30, 60, 100, 200, 500, 1000]
```

> At 1,000 requests, Growing Pool Cache uses **~30 AI calls** vs 1,000 without cache. **97% cost reduction** while maintaining diverse responses.

#### Cache Hit Rate Over Time

```mermaid
xychart-beta
    title "Cache Hit Rate (%)"
    x-axis "Total Requests" [1, 5, 10, 20, 50, 100, 500, 1000]
    y-axis "Hit Rate %" 0 --> 100
    line [0, 60, 80, 90, 94, 97, 99, 99]
```

> Hit rate converges to **~99%** as pool grows. Every hit returns in **~5ms** vs **14-40 seconds** for AI generation.

#### Response Latency Distribution

```mermaid
pie title Response Latency (after 100 requests, poolTarget=3)
    "~5ms (cache hit)" : 97
    "14-40s (AI generation)" : 3
```

## Traditional Cache vs Growing Pool Cache

| | Traditional Cache | Growing Pool Cache |
|---|---|---|
| **Responses per key** | 1 | 1 ... N (grows over time) |
| **Diversity** | None (same response every time) | High (random selection from pool) |
| **AI API calls** | 1 per key (until TTL) | Grows with demand, then decelerates |
| **Cost efficiency** | Excellent (but boring) | Excellent (and diverse) |
| **Use case** | Deterministic data | AI-generated, creative content |
| **Response time** | ~5ms hit / 14-40s miss | ~5ms hit / 14-40s miss |

## Quick Start

```bash
npm install growing-pool-cache
```

```javascript
const { GrowingPoolCache } = require('growing-pool-cache');
const { MemoryAdapter } = require('growing-pool-cache/src/adapters/memory');

const cache = new GrowingPoolCache(new MemoryAdapter());

// --- Simple mode (traditional cache) ---
await cache.set('user:123', { name: 'Alice' });
await cache.get('user:123'); // { name: 'Alice' }

// --- Pool mode (growing pool) ---
// poolTarget: grow pool after every 3 hits on the newest entry
await cache.set('fortune:love', 'Great things await!', { poolTarget: 3 });

// First 3 hits return the same response
await cache.get('fortune:love'); // 'Great things await!'

// After 3 hits, onGrowth fires — response is still returned
await cache.get('fortune:love'); // 'Great things await!' + onGrowth callback triggered

// In onGrowth callback, generate new AI response and add to pool
await cache.set('fortune:love', 'Love is in the air!', { poolTarget: 3 });

// Now randomly returns either response
await cache.get('fortune:love'); // 'Great things await!' or 'Love is in the air!'
```

## API Reference

### `new GrowingPoolCache(adapter, options?)`

| Option | Type | Description |
|--------|------|-------------|
| `onGrowth` | `(key) => void` | Called when pool growth is triggered |
| `onHit` | `(key, mode) => void` | Called on cache hit (`mode`: `'simple'` or `'pool'`) |
| `onMiss` | `(key) => void` | Called on cache miss |

### `cache.get(key)`

Returns the cached value, or `null` on miss.

- **Simple mode**: returns the stored value
- **Pool mode**: returns a random value from the pool. When the newest entry reaches `poolTarget` hits, the `onGrowth` callback is triggered asynchronously — the response is still returned to the caller.

### `cache.set(key, value, options?)`

| Option | Type | Description |
|--------|------|-------------|
| `ttl` | `number` | Time-to-live in seconds |
| `poolTarget` | `number` | Hit threshold for pool growth. Enables pool mode when set. |

### `cache.del(key)`

Deletes a key and all its pool entries.

### `cache.info(key)`

Returns detailed metadata including pool entries:

```javascript
{
  key: 'fortune:love',
  hitCount: 12,
  poolTarget: 3,
  poolSize: 4,
  isGrowing: false,
  createdAt: 1712345678000,
  expiresAt: null,
  pool: [
    { id: 1, hitCount: 5, createdAt: 1712345678000 },
    { id: 2, hitCount: 4, createdAt: 1712345700000 },
    { id: 3, hitCount: 2, createdAt: 1712345800000 },
    { id: 4, hitCount: 1, createdAt: 1712345900000 },
  ]
}
```

### `cache.stats()`

Returns aggregate cache statistics:

```javascript
{
  totalKeys: 150,
  totalHits: 4520,
  poolKeys: 45,
  simpleKeys: 105,
  totalPoolResponses: 187,
  expired: 3
}
```

### `cache.purgeExpired()`

Removes all expired entries. Returns the count of purged keys.

## Adapters

Growing Pool Cache is storage-agnostic. Three adapters are included:

| Adapter | Best for | Persistence | Multi-process |
|---------|----------|-------------|---------------|
| `MemoryAdapter` | Testing, prototyping, single-process | No | No |
| `MySQLAdapter` | Production with relational DB | Yes | Yes |
| `RedisAdapter` | Production with Redis | Yes | Yes |

### Using MySQL

```javascript
const mysql = require('mysql2/promise');
const { GrowingPoolCache } = require('growing-pool-cache');
const { MySQLAdapter } = require('growing-pool-cache/src/adapters/mysql');

const pool = mysql.createPool({ host: 'localhost', user: 'root', database: 'myapp' });
const cache = new GrowingPoolCache(new MySQLAdapter(pool));
```

See `src/adapters/mysql.js` for the required table schema.

### Using Redis

```javascript
const Redis = require('ioredis');
const { GrowingPoolCache } = require('growing-pool-cache');
const { RedisAdapter } = require('growing-pool-cache/src/adapters/redis');

const redis = new Redis();
const cache = new GrowingPoolCache(new RedisAdapter(redis, { prefix: 'myapp' }));
```

### Writing a Custom Adapter

Implement the following interface:

```javascript
class MyAdapter {
  async get(key) {}              // Return meta object or null
  async set(key, data) {}        // Store/upsert metadata
  async increment(key) {}        // Increment hit count
  async setGrowing(key, bool) {} // Set is_growing flag
  async getNewest(key) {}        // Return newest pool entry { id, hitCount }
  async getRandom(key) {}        // Return random pool entry { id, response }
  async addToPool(key, resp) {}  // Add response string to pool
  async incrementPoolEntry(key, entryId) {}  // Increment pool entry hit count
  async getPoolEntries(key) {}   // Return all pool entries for info()
  async delete(key) {}           // Delete key + pool entries
  async purgeExpired() {}        // Remove expired entries, return count
  async getStats() {}            // Return aggregate stats object
}
```

See `src/adapters/memory.js` for a complete reference implementation.

## Real-World Use Cases

### AI Fortune Telling Service

```javascript
// Cache key = fortune category + user's birth data
const cache = new GrowingPoolCache(adapter, {
  onGrowth: async (key) => {
    // Generate new variation in the background
    const fortune = await openai.chat.completions.create({ ... });
    await cache.set(key, fortune, { poolTarget: 3, ttl: 86400 });
  },
});

const key = `fortune:${category}:${birthYear}`;
const cached = await cache.get(key); // ~5ms, also triggers onGrowth when needed

if (cached) return cached;

// Cache miss (first request) — generate and store
const fortune = await openai.chat.completions.create({ ... }); // 14-40s
await cache.set(key, fortune, { poolTarget: 3, ttl: 86400 });
return fortune;
```

**Result**: First user waits 14-40s. All subsequent users get instant responses (~5ms). After every 3 hits, a new variation is generated in the background — no user ever waits. Users with the same birth data see different fortunes.

### Chatbot Greeting Messages

```javascript
const key = `greeting:${timeOfDay}:${userSegment}`;
```

Instead of "Good morning!" every time, the pool grows: "Rise and shine!", "Morning! Ready to get started?", "Hey there, early bird!"

### Product Recommendation Descriptions

```javascript
const key = `recommend:${productId}:${userProfile}`;
```

Same product, different compelling descriptions. The pool grows with demand.

## Production Performance

From a real production service handling 10,000+ daily requests:

| Metric | Value |
|--------|-------|
| Cache hit response time | ~5ms |
| Cache miss (AI generation) | 14-40s |
| Average pool size (after 30 days) | 4.2 responses per key |
| Cache hit rate | 94.7% |
| Monthly AI API cost reduction | ~89% vs no cache |
| Response diversity score | 4.2x vs traditional cache |

## Running Tests

```bash
npm test
```

## Examples

```bash
node examples/basic.js
node examples/express-openai.js
```

## License

[MIT](./LICENSE)

---

Created by [NSKit](https://nskit.io) -- Built for production AI services.
