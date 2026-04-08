'use strict';

/**
 * Example: Express + OpenAI with GrowingPoolCache
 *
 * This shows a real-world pattern where AI-generated fortunes are cached
 * and the pool grows naturally as demand increases.
 *
 * Install dependencies:
 *   npm install express openai growing-pool-cache
 */

// const express = require('express');
// const OpenAI = require('openai');
// const { GrowingPoolCache } = require('growing-pool-cache');
// const { MemoryAdapter } = require('growing-pool-cache/src/adapters/memory');

// --- Mock implementations for demonstration ---
const express = { /* mock */ };
const app = {
  get: (path, handler) => console.log(`Route registered: GET ${path}`),
  listen: (port, cb) => cb && cb(),
};

function mockOpenAICall(prompt) {
  const responses = [
    'A great opportunity will come your way.',
    'Trust your instincts today.',
    'New connections will bring joy.',
    'Your patience will be rewarded.',
    'Adventure awaits around the corner.',
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// --- Setup ---

const { GrowingPoolCache } = require('../src/index');
const { MemoryAdapter } = require('../src/adapters/memory');

async function generateAndStore(category) {
  const cacheKey = `fortune:${category}`;
  // Simulate 2-second AI call (in production, use OpenAI)
  await new Promise((r) => setTimeout(r, 100));
  const fortune = mockOpenAICall(category);
  await cache.set(cacheKey, fortune, { poolTarget: 3, ttl: 86400 });
  console.log(`[Pool Growing] Generated new response for ${cacheKey}`);
}

const cache = new GrowingPoolCache(new MemoryAdapter(), {
  // onGrowth fires when pool needs to grow — generate new content async
  onGrowth: (key) => {
    const category = key.replace('fortune:', '');
    generateAndStore(category); // fire-and-forget, user already got a response
  },
});

// --- Route handler ---

async function handleFortune(category) {
  const cacheKey = `fortune:${category}`;

  // Try cache first
  const cached = await cache.get(cacheKey);

  if (cached !== null) {
    // Cache hit (~5ms) — always returns a response, even when growth is triggered
    return { source: 'cache', fortune: cached };
  }

  // Cache miss (first request for this key) — generate and store
  await generateAndStore(category);
  const fortune = await cache.get(cacheKey);

  return { source: 'ai', fortune };
}

// --- Demo ---

async function demo() {
  console.log('=== Express + OpenAI + GrowingPoolCache Demo ===\n');

  // Simulate 10 requests for the same fortune category
  for (let i = 1; i <= 10; i++) {
    const start = Date.now();
    const result = await handleFortune('love');
    const elapsed = Date.now() - start;
    console.log(
      `Request ${i}: [${result.source.toUpperCase()}] "${result.fortune}" (${elapsed}ms)`
    );
    await new Promise((r) => setTimeout(r, 20));
  }

  console.log('\n--- Cache Info ---');
  const info = await cache.info('fortune:love');
  console.log(JSON.stringify(info, null, 2));
}

demo().catch(console.error);
