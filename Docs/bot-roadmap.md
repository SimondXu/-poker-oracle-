# AiPoker — Bot / AI 路线图

> 从 PRD v1.0 §E 抽取。定义三个阶段的 Bot 演进和统一接口。

---

## 1. 统一接口（所有阶段共用）

```typescript
// packages/shared/src/ai-adapter.ts

interface AIPlayerAdapter {
  /** 根据公开状态+私人手牌生成决策 */
  decide(
    publicState: PublicHandState,
    myHoleCards: Card[],
    validActions: ValidActions,
  ): Promise<BotDecision>;

  /** 教练模式：解释决策理由（可选，Phase 3 用）*/
  explain?(decision: BotDecision): Promise<string>;

  /** 超时限制（ms）。超时自动 fold */
  readonly timeoutMs: number;
}

interface BotDecision {
  action: ActionType;
  amount?: number;
  thinkingDelayMs: number;  // 模拟人类思考 1000-3000ms
}

/**
 * PublicHandState = HandState 但清空了其他人的 holeCards。
 * Bot 和真人看到相同的信息量（信息安全）。
 */
```

所有 Phase 的 Bot 都实现 `AIPlayerAdapter`。server 只调这个接口，不关心底层实现。

---

## 2. Phase 1 — 规则/启发式 Bot [MVP]

三种人格：

| 类型 | 英文 | 风格 | VPIP | PFR | AF |
|------|------|------|------|-----|-----|
| 新手鱼 | Fish | 随机跟注，很少弃牌 | 50%+ | 10% | 0.5 |
| 紧凶型 | TAG | 标准玩法，新手对练 | 20% | 16% | 2.5 |
| 松凶型 | LAG | 更激进，挑战大 | 35% | 28% | 3.5 |

### 决策流程

```
1. 评估手牌强度
   - Preflop：陈氏公式 / 预设 range 表
   - Postflop：Monte Carlo equity（1000 次模拟）

2. 计算底池赔率
   - potOdds = callAmount / (totalPot + callAmount)

3. 基于人格决策
   - equity > threshold → raise/call
   - equity < potOdds * damping → fold
   - 引入随机性（~20% 概率偏离"最优"，模拟人类错误）

4. 确定下注金额
   - 标准 sizing：0.5x-1x pot（按人格调整）
   - 加随机扰动（±15%），避免机械感
```

### Preflop Range 表（位置敏感）

```
BTN: openRange 35%, vs3bet 15%
CO:  openRange 25%, vs3bet 12%
HJ:  openRange 20%, vs3bet 10%
UTG: openRange 14%, vs3bet  7%
```

### 关键实现要点
- Bot 决策在 BullMQ worker 异步执行（不阻塞游戏 loop）
- thinkingDelayMs = 1000 + random(2000)，模拟人类思考
- Bot 使用同一套 action 校验逻辑（服务端验证 bot 行为）

---

## 3. Phase 2 — 配置化策略 Bot [3-6 个月后]

目标：可配置的 GTO 近似 Bot

```typescript
interface Phase2BotConfig {
  preflop_ranges: Record<Position, HandRange>;
  cbet_frequency: number;
  bluff_catch_threshold: number;
  fold_to_3bet: number;
  icm_aware: boolean;  // 锦标赛场景
}
```

实现方案：
- 预计算 GTO 近似解（lookup table）
- 或简化 CFR 在线计算（适合 Heads-Up）

---

## 4. Phase 3 — ML/LLM Bot [12 个月后]

### ML Bot
- 自博弈 / 强化学习训练
- 输入：observation vector（公共牌、底池、筹码深度、历史行动）
- 输出：action distribution

### LLM Bot
- 接入 Claude / GPT 作为"人类风格"对手或解释型教练
- 每次决策 prompt → 解析 action → 超时 fallback fold
- 费用控制：每次决策最多 500 tokens

### 安全沙箱
- LLM 调用在独立 worker 线程
- 严格超时（5s），超时自动 fold
- 决策日志全部记录（调试 + 回放）

---

## 5. 手牌强度评估模块

此模块同时被 Bot 和训练 HUD 使用：

```typescript
// packages/game-engine/src/hand-evaluator.ts

/** Preflop 手牌排名 */
function evaluatePreflopStrength(holeCards: [Card, Card]): number; // 0-1

/** Postflop equity：Monte Carlo N次模拟 */
function estimateEquity(
  holeCards: [Card, Card],
  communityCards: Card[],
  numOpponents: number,
  simulations: number,  // 默认 1000
  rng: Rng,
): number; // 0-1

/** 7-card hand ranking（Cactus Kev 或等价算法）*/
function evaluateHand(cards: Card[]): HandRank;
```
