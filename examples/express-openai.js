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

const cache = new GrowingPoolCache(new MemoryAdapter(), {
  onGrowth: (key) => console.log(`[Pool Growing] ${key}`),
});

// In production, use OpenAI:
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateFortune(category) {
  // In production:
  // const response = await openai.chat.completions.create({
  //   model: 'gpt-4',
  //   messages: [{ role: 'user', content: `Generate a fortune for category: ${category}` }],
  // });
  // return response.choices[0].message.content;

  // Simulate 2-second AI call
  await new Promise((r) => setTimeout(r, 100));
  return mockOpenAICall(category);
}

// --- Route handler ---

async function handleFortune(category) {
  const cacheKey = `fortune:${category}`;

  // Try cache first
  const cached = await cache.get(cacheKey);

  if (cached !== null) {
    // Cache hit (~5ms)
    return { source: 'cache', fortune: cached };
  }

  // Cache miss or growth trigger — generate new AI response
  const fortune = await generateFortune(category);

  // Store with pool mode: grow pool every 3 hits
  await cache.set(cacheKey, fortune, { poolTarget: 3, ttl: 86400 });

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
