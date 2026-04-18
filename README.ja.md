[🇬🇧 English](./README.md) · [🇰🇷 한국어](./README.ko.md) · [🇨🇳 中文](./README.zh.md)

# growing-pool-cache

**AI 生成コンテンツ向けの自己成長型キャッシュプール — コスト削減と応答の多様性を両立。**

[![npm version](https://img.shields.io/npm/v/growing-pool-cache.svg)](https://www.npmjs.com/package/growing-pool-cache)
[![license](https://img.shields.io/npm/l/growing-pool-cache.svg)](https://github.com/nskit-io/growing-pool-cache/blob/main/LICENSE)

> [**NSKit**](https://github.com/nskit-io/nskit-io) のコスト効率基盤技術 — *型にはまっているから、無限に組み合わせられる*。NSKit プロダクション・サービスの AI コンテンツ・キャッシュ層を担い、応答の多様性を保ちつつ AI API コストを約 97% 削減します。

---

## 問題

従来のキャッシュはキーごとに1つの応答を保存します。決定的データには適切ですが、AI 応答は **設計上、非決定的** — 同じ質問を2回すれば違う答えになるべき。

AI 応答を1つだけキャッシュするとコストは減りますが多様性が死にます。全くキャッシュしないと多様性は保てますが API 予算が燃えます。

**Growing Pool Cache がこれを解きます**: 各キャッシュキーが需要に応じて **自然に成長する応答プール** を持ちます。

---

## しくみ

### 成長サイクル

1. **キャッシュミス** — AI 呼び出し、応答 A をプールに保存(`hit_count=0`)
2. **キャッシュヒット** — A を返し、ヒット数をインクリメント
3. **A が N ヒット到達** — 通常通り応答を返しつつ、`onGrowth` コールバックを非同期発火 → 呼び出し側がバックグラウンドで新コンテンツ生成
4. **新応答 B 保存** — プールサイズ 2、`is_growing=false`
5. **以後のリクエスト** — プールから A または B をランダム選択
6. **B が N ヒット到達** — C 生成... プールは成長するが、ランダム分布でヒットが分散するため **自然に減速**

### なぜ減速するのか

`poolTarget=3` の場合:

| プールサイズ | 成長までの平均ヒット数 | 実効間隔 |
|---|---|---|
| 1 | 3 リクエスト | 3 回ごと |
| 2 | 6 リクエスト | 6 回ごと |
| 3 | 9 リクエスト | 9 回ごと |
| 5 | 15 リクエスト | 15 回ごと |
| 10 | 30 リクエスト | 30 回ごと |

プールは自己調整: 高トラフィックのキーは多様性が増し、低トラフィックのキーは小さなまま。

---

## 性能特性

成長曲線は **O(√n)** — 初期は急速、その後緩やかに減速。設定不要。

1,000 リクエスト時点で、Growing Pool Cache は **約 30 回の AI 呼び出し** を使う(キャッシュなしなら 1,000 回)。**97% のコスト削減** を実現しつつ、多様な応答を維持。

---

## インストール

```bash
npm install growing-pool-cache
```

---

## 基本的な使い方

```javascript
const { GrowingPoolCache } = require('growing-pool-cache');

const cache = new GrowingPoolCache({
  poolTarget: 3,      // ヒット数 N を決める
  onGrowth: async (key) => {
    // AI に新応答を要求する呼び出し側のコード
    return await generateWithAI(key);
  }
});

// 取得 — プールに何もなければ onGrowth を呼ぶ
const response = await cache.get('fortune:love');
```

---

## NSKit での利用

NewMyoung の「毎日の運勢」機能、Haru のレコメンド等、「同じキーに対して多様な AI 応答」が欲しいシナリオで利用中。月数万リクエストでも AI API コストを予算内に収められます。

---

## 詳細

完全な API、オプション、使用例、ベンチマーク、プロダクション事例は英語版を参照: **[README (English)](./README.md)**

---

<div align="center">

**growing-pool-cache** · Part of the **[NSKit](https://github.com/nskit-io/nskit-io)** ecosystem

© 2026 Neoulsoft Inc.

</div>
