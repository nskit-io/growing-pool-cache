[🇬🇧 English](./README.md) · [🇰🇷 한국어](./README.ko.md) · [🇯🇵 日本語](./README.ja.md)

# growing-pool-cache

**为 AI 生成内容设计的自增长缓存池 — 在节省成本与保持响应多样性之间取得平衡。**

[![npm version](https://img.shields.io/npm/v/growing-pool-cache.svg)](https://www.npmjs.com/package/growing-pool-cache)
[![license](https://img.shields.io/npm/l/growing-pool-cache.svg)](https://github.com/nskit-io/growing-pool-cache/blob/main/LICENSE)

> [**NSKit**](https://github.com/nskit-io/nskit-io) 的成本效率基础技术 — *有结构,才有无限组合*。承担 NSKit 生产服务的 AI 内容缓存层,在保留响应多样性的前提下,把 AI API 成本降低约 97%。

---

## 问题

传统缓存为每个 key 存一个响应。这对确定性数据很适合,但 AI 响应 **天然是非确定性的** — 同一个问题问两次应该得到不同的答案。

只缓存一个 AI 响应能省钱,但会扼杀多样性。完全不缓存能保住多样性,但会烧光 API 预算。

**Growing Pool Cache 解决这个矛盾**: 每个缓存 key 会根据需求 **自然成长出一个响应池**。

---

## 工作原理

### 成长周期

1. **缓存未命中** — 调用 AI,把响应 A 存进池中(`hit_count=0`)
2. **缓存命中** — 返回 A,命中次数 +1
3. **A 命中达到 N 次** — 照常返回响应,同时异步触发 `onGrowth` 回调 → 调用方在后台生成新内容
4. **新响应 B 存入** — 池大小变 2,`is_growing=false`
5. **后续请求** — 从池中随机选 A 或 B
6. **B 命中达到 N 次** — 生成 C... 池继续成长,但由于随机分布让命中分散到更多条目,**自然减速**

### 为什么会减速

以 `poolTarget=3` 为例:

| 池大小 | 触发成长的平均命中数 | 有效间隔 |
|---|---|---|
| 1 | 3 次请求 | 每 3 次 |
| 2 | 6 次请求 | 每 6 次 |
| 3 | 9 次请求 | 每 9 次 |
| 5 | 15 次请求 | 每 15 次 |
| 10 | 30 次请求 | 每 30 次 |

池自我调节: 高流量的 key 获得更多多样性,低流量的 key 保持小巧。

---

## 性能特征

成长曲线遵循 **O(√n)** — 前期增长快,随后逐渐减速,无需配置。

到 1,000 次请求时,Growing Pool Cache 仅用 **约 30 次 AI 调用**(无缓存则需 1,000 次)。**降低 97% 成本**,同时保持响应多样。

---

## 安装

```bash
npm install growing-pool-cache
```

---

## 基础用法

```javascript
const { GrowingPoolCache } = require('growing-pool-cache');

const cache = new GrowingPoolCache({
  poolTarget: 3,      // 决定命中数 N
  onGrowth: async (key) => {
    // 调用方代码,向 AI 请求新响应
    return await generateWithAI(key);
  }
});

// 获取 — 如池中无值,则触发 onGrowth
const response = await cache.get('fortune:love');
```

---

## 在 NSKit 中的使用

被用于 NewMyoung「每日运势」、Haru 推荐等「同一 key 需要多样 AI 响应」的场景。即便每月数万次请求,也能把 AI API 成本控制在预算内。

---

## 详情

完整 API、选项、用法示例、基准测试、生产案例请查看英文版: **[README (English)](./README.md)**

---

<div align="center">

**growing-pool-cache** · Part of the **[NSKit](https://github.com/nskit-io/nskit-io)** ecosystem

© 2026 Neoulsoft Inc.

</div>
