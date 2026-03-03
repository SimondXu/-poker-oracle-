# AiPoker — 德州扑克训练平台 产品设计报告 (PRD)

> 版本：v1.0 | 日期：2026-03-03 | 负责人：Claude (Product + Tech Arch + UX + Agent 编排)

---

## 0. 背景与目标确认

**这是一个个人训练场，不是休闲娱乐平台。**

- 用户核心诉求：**系统性地提升自己的德州扑克水平**
- 差异化定位：提供可回放、有提示、可分析的"个人训练室"
- 当前优先级：**核心玩法 + UI/交互 + 房间系统 + 回放/训练功能**，AI/ML延后
- 默认规格：No-Limit Texas Hold'em，单人 vs 2–5 个 Bot，桌面网页优先

---

## A. 产品范围与核心体验

### 核心使用场景（3个）

| # | 场景 | 用户目标 | 关键功能 |
|---|------|---------|---------|
| 1 | **新手快速上桌** | "我刚学规则，想练手感" | 自动配置2个简单Bot，提示模式默认开启 |
| 2 | **针对性局面练习** | "我想专门练3-bet后的处理" | 预设挑战场景，强制进入特定局面 |
| 3 | **自由对局+复盘** | "随便打几局然后复盘分析" | 自由创房间，打完可立即进入回放 |

### MVP 功能列表

#### Must Have（必须有，否则不是产品）
- [ ] 用户注册/登录（邮箱+密码，或者Guest游客模式）
- [ ] 创建房间：设置盲注/人数/Bot数量/Bot难度
- [ ] No-Limit Texas Hold'em 完整规则（pre-flop → flop → turn → river → showdown）
- [ ] Bot 对手 x 2–5（Phase 1 规则驱动）
- [ ] 实时牌桌 UI：手牌、公共牌、底池、筹码、行动按钮
- [ ] 计时器（每个行动 30 秒默认）
- [ ] 对局行动历史（本手内可查看）
- [ ] 对局结算（赢家展示、筹码变化）
- [ ] 回放系统：看完一手可以逐步回放

#### Should Have（重要，但可以推后1-2个sprint）
- [ ] 训练提示 HUD（底池赔率、手牌强度、位置建议）
- [ ] 个人统计（局数、胜率、最大赢/输）
- [ ] 多手连续对局（无需重新进房间）
- [ ] 回放标注（用户在某个动作处添加笔记）
- [ ] 快捷键支持（F = fold, C = call, R = raise, Space = check）

#### Could Have（未来迭代）
- [ ] 预设挑战任务（Challenge模式）
- [ ] Bot难度可调（新手/中级/进阶）
- [ ] 对局历史列表（查看历史所有回放）
- [ ] 进阶训练提示（GTO建议、EV计算）
- [ ] 多人联机（真人 vs 真人）
- [ ] 移动端适配

#### Won't Have（明确不进 MVP）
- 排行榜/社交
- 货币化/真实金钱
- 锦标赛模式
- LLM/ML Bot
- 移动端

### 关键指标（KPIs）

| 指标 | 定义 | MVP目标 |
|------|------|---------|
| 局数/用户/天 | DAU平均完整手牌数 | ≥ 5 局 |
| 训练提示使用率 | 打开提示HUD的用户占比 | ≥ 50% |
| 摊牌回放率 | 摊牌后查看回放的频率 | ≥ 30% |
| 会话时长 | 平均单次访问时长 | ≥ 20 min |
| D7留存 | 7天后回来的用户 | ≥ 25% |

---

## B. UI/UX 设计

### 信息架构

```
/                           ← Landing Page（简洁介绍）
├── /login                  ← 登录
├── /register               ← 注册
├── /dashboard              ← 主控台（核心枢纽）
│   ├── /rooms              ← 房间管理（创建/查看）
│   ├── /history            ← 对局历史
│   └── /profile            ← 个人资料/统计
├── /room/:id               ← 等待室
├── /game/:id               ← 牌桌（实时游戏核心）
└── /replay/:gameId         ← 回放查看器
```

### 牌桌界面布局（1440px 基准，深色主题）

```
┌──────────────────────────────────────────────────────────────────┐
│  ♠ AiPoker   房间: 训练室#1   盲注: 10/20   局数: #7      [⚙][✕]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│           [Bot2 ●]            [Bot3 ●]                          │
│    [Bot1 ●]                              [Bot4 ●]               │
│                  ╔══════════════════╗                           │
│                  ║  ♠A  ♥K  ♣7     ║  ← 公共牌               │
│                  ║  (Flop)          ║                           │
│                  ║  底池: 340      ║                           │
│    [Bot5 ●]      ╚══════════════════╝      [ 空位 ]             │
│                                                                  │
│              ┌──────────────────┐                               │
│              │  [♥A ♦K]         │  ← 玩家手牌                 │
│              │  Edison  2,840   │                               │
│              │  ████░░░░  18s   │  ← 计时器                   │
│              └──────────────────┘                               │
├──────────────────────────────────────────────────────────────────┤
│ 行动历史: Bot1 raise 60 · Bot3 call · 你 3bet 180 · Bot1 call... │
├──────────────────────────────────────────────────────────────────┤
│  [弃牌(F)]  [跟注 60(C)]  [加注 ──────●────── 360]  [全压(A)]  │
│                                        [底池赔率: 28%] [提示▸]  │
└──────────────────────────────────────────────────────────────────┘
```

**训练提示面板（右侧可折叠）：**
```
┌─────────────────────┐
│ 📊 训练提示         │
├─────────────────────┤
│ 手牌强度: Top 18%   │
│ 底池赔率: 28%       │
│ 建议胜率需求: >28%  │
│                     │
│ 位置: 按钮位(BTN)   │
│ 建议: ✅ 跟注/加注  │
│                     │
│ [详细说明 ▾]        │
└─────────────────────┘
```

### 关键页面设计说明

**Dashboard（主控台）：**
- 左侧：用户信息卡（头像、筹码、今日统计）
- 中间：最近对局列表（每行显示结果、净盈亏、"▶ 回放"按钮）
- 右侧：快速开始（一键创建默认房间）

**等待室（/room/:id）：**
- 显示座位布局（已加入玩家 + Bot 占位）
- Bot配置面板：拖拽调整难度/数量
- "开始游戏"按钮（仅房主可见）

**回放查看器（/replay/:gameId）：**
```
┌────────────── 回放界面 ──────────────────┐
│  [◀◀] [◀] [▶/⏸] [▶] [▶▶]  速度: 1x    │
│  ████████████████░░░░░░░  第13/31步     │
│                                          │
│  [牌桌状态（与游戏界面相同）]             │
│                                          │
│  ┌ 当前动作 ──────────────────────────┐  │
│  │ Edison: RAISE $180 (Pre-flop)      │  │
│  │ [✅ 好决策] [❌ 值得反思] [📝 笔记] │  │
│  └──────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 视觉设计规范

**颜色系统：**
```css
--bg-primary:    #0D1117;  /* 主背景（GitHub dark风格）*/
--bg-surface:    #161B22;  /* 卡片/面板背景 */
--table-felt:    #1B5E20;  /* 牌桌桌布（深绿） */
--table-border:  #4A7C59;  /* 牌桌边框 */
--accent-gold:   #FFD700;  /* 底池/赢家 highlight */
--text-primary:  #E6EDF3;  /* 主文字 */
--text-muted:    #8B949E;  /* 次要文字 */
--error-red:     #EF5350;  /* 弃牌/危险 */
--success-green: #66BB6A;  /* 赢牌/正确决策 */
--chip-white:    #F5F5F5;  /* 白色筹码 */
--chip-red:      #E53935;  /* 红色筹码 */
--chip-blue:     #1E88E5;  /* 蓝色筹码 */
--chip-green:    #43A047;  /* 绿色筹码 */
--chip-black:    #212121;  /* 黑色筹码 */
```

**动画设计：**
- 发牌：卡牌从牌堆飞向玩家位（300ms，ease-out）
- 翻牌：3D Y轴翻转（400ms，cubic-bezier）
- 下注：筹码动态移至底池（500ms，spring动画）
- 赢牌：底池筹码飞向赢家 + 金色粒子效果（600ms）
- 当前行动玩家：边框脉冲光效（infinite pulse）

**多端适配策略：**
- MVP：桌面优先（1024px+），最低支持1024px宽
- 响应式断点：1440px（宽桌面）/ 1024px（普通桌面）
- 移动端（768px以下）：**不在MVP范围**，界面降级为"观看模式"

---

## C. 技术架构与 Tech Stack

### 技术选型总览

```
┌─────────────────────────────────────────────────┐
│                  前端 (Next.js 15)               │
│  React 19 · TypeScript · Tailwind · Zustand     │
│  Framer Motion · Socket.io-client · shadcn/ui   │
└────────────────────┬────────────────────────────┘
                     │ WebSocket (Socket.io)
┌────────────────────▼────────────────────────────┐
│                后端 (Fastify + Node.js)           │
│  TypeScript · Socket.io · BullMQ · Zod          │
└──────┬──────────────────┬───────────────────────┘
       │                  │
┌──────▼──────┐    ┌──────▼──────┐
│ PostgreSQL  │    │   Redis     │
│  (Supabase) │    │  (Upstash)  │
│  永久存储   │    │  实时状态   │
└─────────────┘    └─────────────┘
```

### 前端技术栈（详细取舍）

| 技术 | 选择 | 取舍理由 |
|------|------|---------|
| 框架 | **Next.js 15 (App Router)** | SSR加速初始加载；App Router支持Server Components优化数据获取；备选：Vite+React（更轻，但失去SSR） |
| 语言 | **TypeScript** | 与后端共享类型定义，减少联调错误 |
| 样式 | **Tailwind CSS + shadcn/ui** | 快速开发；shadcn/ui提供高质量基础组件；备选：MUI（过重） |
| 状态管理 | **Zustand** | 轻量、适合游戏状态；备选：Redux Toolkit（过重）；不用Context（频繁更新导致大量重渲染） |
| 动画 | **Framer Motion** | 声明式动画，卡牌翻转/飞行效果简洁实现；备选：GSAP（功能更强但体积大） |
| 实时通信 | **Socket.io-client** | 与服务端配套，自动重连、rooms支持 |
| 渲染方式 | **DOM + CSS（非Canvas）** | 开发速度快；可访问性好；动画够用；备选：Pixi.js（只有超高帧率需求才考虑） |

### 后端技术栈（详细取舍）

| 技术 | 选择 | 取舍理由 |
|------|------|---------|
| 运行时 | **Node.js 22 LTS** | 前后端共享游戏引擎代码；TypeScript生态成熟 |
| 框架 | **Fastify** | 比Express快3-4倍；内置Schema验证；备选：Hono（更轻但生态小） |
| WebSocket | **Socket.io** | Rooms机制天然适合游戏房间；自动重连；备选：原生ws（需要自己实现rooms） |
| 任务队列 | **BullMQ** | Bot决策异步化（防止阻塞主线程）；延迟任务（计时器超时） |
| 验证 | **Zod** | 运行时类型验证，与TypeScript完美集成 |
| ORM | **Drizzle ORM** | TypeScript原生，性能好，比Prisma更轻 |

### 实时通信设计：WebSocket vs WebRTC

**选择 WebSocket（Socket.io）的原因：**
- 扑克是**服务器权威（Server-Authoritative）游戏**——服务器才是唯一真相来源
- WebRTC是P2P架构，无法进行服务器端反作弊验证
- Socket.io的rooms天然映射游戏房间概念
- 延迟要求：扑克动作不需要毫秒级延迟，100-200ms完全可接受

### 项目结构（pnpm Monorepo + Turborepo）

```
AiPoker/
├── packages/
│   ├── game-engine/        # 核心：纯TypeScript，零依赖，前后端共享
│   │   ├── src/
│   │   │   ├── GameState.ts
│   │   │   ├── GameStateMachine.ts
│   │   │   ├── Deck.ts
│   │   │   ├── HandEvaluator.ts
│   │   │   ├── PotCalculator.ts
│   │   │   └── ActionValidator.ts
│   │   └── __tests__/
│   ├── shared-types/       # 共享TypeScript接口/类型
│   └── bot-engine/         # Bot决策，依赖game-engine
│       └── src/
│           ├── BotPlayer.ts
│           └── strategies/
│               ├── TagBot.ts   # Tight-Aggressive
│               ├── LagBot.ts   # Loose-Aggressive
│               └── FishBot.ts  # 新手模式
├── apps/
│   ├── web/                # Next.js 15
│   └── server/             # Fastify + Socket.io
├── turbo.json
└── pnpm-workspace.yaml
```

### 数据存储策略

**PostgreSQL（持久数据）：**
- 用户账号、历史、统计
- 对局记录、行动序列（用于回放）

**Redis（实时数据，TTL设计）：**
```
room:{roomId}:state    → 完整GameState JSON          TTL: 24h
room:{roomId}:lock     → 行动锁（防并发）             TTL: 10s
session:{token}        → 用户会话信息                 TTL: 7d
bot:{roomId}:{pos}     → Bot当前决策状态              TTL: 1h
```

**为什么不用纯内存？** Node.js重启后状态丢失，Redis保证持久化

### 部署架构

```
开发环境:
├── Next.js dev server (localhost:3000)
├── Fastify dev server (localhost:3001)
├── PostgreSQL (Docker)
└── Redis (Docker)

生产环境:
├── Vercel          → Next.js 前端（边缘CDN，全球快速）
├── Railway         → Fastify 后端（支持WebSocket，简单部署）
├── Supabase        → PostgreSQL（免费tier：500MB，够MVP用）
└── Upstash         → Redis（Serverless，按请求计费）

CI/CD (GitHub Actions):
├── PR:     lint → typecheck → unit tests
├── main:   E2E tests → build → deploy to staging
└── tag:    deploy to production
```

**监控：**
- **Sentry**：前后端错误追踪
- **Better Uptime**：可用性监控
- **Grafana Cloud（免费）**：自定义指标仪表盘

---

## D. 游戏引擎与规则实现

> 更详细的“玩法规则/两种模式（锦标赛SNG + 自由练习桌 + 可选Squid旁注）/边界用例”见：`Docs/gameplay-prd.md`

### 游戏状态机

```
         ┌─────────────────────────────────────────────────────┐
         ▼                                                     │
      [WAITING]                                               │
         │ 足够玩家就绪                                        │
         ▼                                                     │
      [STARTING] ← 3秒倒计时                                  │
         │                                                     │
         ▼                                                     │
   [DEAL_HOLE_CARDS] ← 每人2张手牌，面朝下                    │
         │                                                     │
         ▼                                                     │
   [PRE_FLOP_BETTING] ← SB/BB强制下盲，从UTG开始行动         │
         │ 所有行动完毕                                        │
         ▼                                                     │
   [DEAL_FLOP] ← 翻3张公共牌                                  │
         │                                                     │
         ▼                                                     │
   [FLOP_BETTING] ← 从SB开始（或第一个未fold的玩家）          │
         │                                                     │
         ▼                                                     │
   [DEAL_TURN] → [TURN_BETTING] → [DEAL_RIVER] → [RIVER_BETTING]
         │                                                     │
         ▼                                                     │
      [SHOWDOWN] ← 结算手牌强度                               │
         │                                                     │
         ▼                                                     │
      [SETTLE] ← 分发底池，更新筹码                           │
         │                                                     │
         └─────────────────────────────────────────────────────┘
              下一手（如果房间继续）
```

### 核心数据结构

```typescript
// packages/game-engine/src/types.ts

type Suit = 'h' | 'd' | 'c' | 's';  // hearts/diamonds/clubs/spades
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A';
type Card = `${Rank}${Suit}`;  // e.g., "Ah", "Kd", "Tc"

type Phase =
  | 'waiting' | 'starting' | 'preflop' | 'flop'
  | 'turn' | 'river' | 'showdown' | 'settle';

type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

interface PlayerState {
  id: string;
  name: string;
  position: number;        // 0-5 座位号
  chips: number;
  holeCards: Card[];       // 只有本人或showdown时才filled
  currentBet: number;      // 本轮已下注量
  totalBetThisHand: number; // 本手总投入（用于边池计算）
  status: 'active' | 'folded' | 'all_in' | 'sitting_out';
  isBot: boolean;
  botStrategy?: 'tag' | 'lag' | 'fish';
}

interface Pot {
  amount: number;
  eligiblePlayers: string[]; // player IDs
}

interface GameState {
  id: string;
  roomId: string;
  handNumber: number;
  phase: Phase;
  dealerPosition: number;
  players: PlayerState[];
  communityCards: Card[];
  pots: Pot[];             // index 0 = main pot, 1+ = side pots
  currentActorPosition: number;
  lastRaiseAmount: number;
  minRaise: number;
  actions: GameAction[];   // 本手所有行动记录
}

interface GameAction {
  playerId: string;
  playerName: string;
  position: number;
  phase: Phase;
  type: ActionType;
  amount: number;
  stackBefore: number;
  potBefore: number;
  timestamp: number;
  sequenceNum: number;
}
```

### 边池（Side Pot）算法

```typescript
// packages/game-engine/src/PotCalculator.ts

function calculatePots(players: PlayerState[]): Pot[] {
  const pots: Pot[] = [];

  // 按本手总投入从小到大排序（all-in量最小的先处理）
  const activePlayers = players
    .filter(p => p.totalBetThisHand > 0)
    .sort((a, b) => a.totalBetThisHand - b.totalBetThisHand);

  let processedAmount = 0;

  for (const allInPlayer of activePlayers) {
    const levelAmount = allInPlayer.totalBetThisHand - processedAmount;
    if (levelAmount <= 0) continue;

    // 参与这个level的玩家（投入 >= 当前level上限的玩家）
    const eligible = players.filter(
      p => p.totalBetThisHand >= allInPlayer.totalBetThisHand && p.status !== 'folded'
    );

    // 每个参与玩家贡献 levelAmount
    const potAmount = levelAmount * players.filter(
      p => p.totalBetThisHand >= allInPlayer.totalBetThisHand
    ).length;

    pots.push({
      amount: potAmount,
      eligiblePlayers: eligible.map(p => p.id)
    });

    processedAmount = allInPlayer.totalBetThisHand;
  }

  return pots;
}
```

### 动作校验

```typescript
// packages/game-engine/src/ActionValidator.ts

interface ValidActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;       // 实际需要跟注的量（考虑筹码不足）
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;         // 等于玩家筹码（all-in上限）
  canAllIn: boolean;
}

function getValidActions(state: GameState, playerId: string): ValidActions {
  const player = state.players.find(p => p.id === playerId)!;
  const toCall = state.lastRaiseAmount - player.currentBet;

  return {
    canFold: true,  // 永远可以弃牌
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount: Math.min(toCall, player.chips), // 不超过筹码
    canRaise: player.chips > toCall,
    minRaise: Math.max(state.minRaise, toCall + state.bigBlind),
    maxRaise: player.chips,
    canAllIn: player.chips > 0
  };
}
```

### RNG 与可验证性

```typescript
// packages/game-engine/src/Deck.ts

import { randomBytes, createHash } from 'crypto';

class Deck {
  private cards: Card[] = [];
  private serverSeed: string;
  private deckHash: string; // 游戏前公开给玩家

  constructor() {
    this.serverSeed = randomBytes(32).toString('hex');
    this.cards = this.generateDeck();
    this.shuffle();
    // 游戏结束后公开serverSeed，让玩家可以验证
    this.deckHash = createHash('sha256')
      .update(this.serverSeed + JSON.stringify(this.cards))
      .digest('hex');
  }

  private shuffle() {
    // Fisher-Yates 算法，使用密码学安全随机
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(
        parseInt(randomBytes(4).toString('hex'), 16) / 0xFFFFFFFF * (i + 1)
      );
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(): Card { return this.cards.pop()!; }
}
```

### 断线重连策略

```
玩家断线
    │
    ▼
保留座位 30 秒（Redis key TTL）
    │
    ├── 30秒内重连 ──→ 发送全量 GameState 快照
    │                   客户端从快照恢复（不用diff）
    │
    └── 30秒后 ──→ 标记为 AFK
                    当前行动 → 自动 CHECK 或 FOLD
                    （取决于是否有待跟注量）
```

---

## E. Bot / AI 路线图

### Phase 1（MVP，规则/启发式 Bot）

**三种人格：**

| Bot类型 | 英文名 | 风格描述 | VPIP | PFR | AF |
|---------|--------|---------|------|-----|-----|
| 新手鱼 | Fish | 随机跟注，很少弃牌 | 50%+ | 10% | 0.5 |
| 紧凶型 | TAG | 标准玩法，适合新手对练 | 20% | 16% | 2.5 |
| 松凶型 | LAG | 更激进，挑战更大 | 35% | 28% | 3.5 |

```typescript
// packages/bot-engine/src/BotPlayer.ts

interface BotDecision {
  action: ActionType;
  amount?: number;
  thinkingDelayMs: number; // 模拟人类思考，1000-3000ms
}

abstract class BaseBot {
  abstract personality: BotPersonality;

  async decide(gameState: GameState, myPosition: number): Promise<BotDecision> {
    const delay = 1000 + Math.random() * 2000; // 1-3s随机延迟

    const myState = gameState.players[myPosition];
    const validActions = getValidActions(gameState, myState.id);
    const handStrength = evaluateHandStrength(myState.holeCards, gameState.communityCards);
    const potOdds = calcPotOdds(gameState, myPosition);
    const position = getPositionType(gameState, myPosition);

    const decision = this.makeDecision(handStrength, potOdds, position, validActions);

    return { ...decision, thinkingDelayMs: delay };
  }

  protected abstract makeDecision(
    handStrength: HandStrength,
    potOdds: number,
    position: PositionType,
    validActions: ValidActions
  ): Omit<BotDecision, 'thinkingDelayMs'>;
}
```

**决策逻辑（TAG Bot示例）：**
```typescript
protected makeDecision(hs: HandStrength, potOdds: number, pos: PositionType, va: ValidActions) {
  // Preflop：基于位置的起手牌范围
  if (isPreflopPhase) {
    if (hs.preflopStrength < this.getRangeThreshold(pos)) {
      return { action: 'fold' };
    }
  }

  // Postflop：基于手牌强度 vs 底池赔率
  const equity = hs.equity; // Monte Carlo模拟 (1000次)

  if (equity < potOdds * 0.8) {
    return { action: 'fold' };
  } else if (equity > 0.7) {
    // 强牌：加注
    const raiseSize = Math.floor(gameState.pots[0].amount * 0.75);
    return { action: 'raise', amount: Math.min(raiseSize, va.maxRaise) };
  } else if (equity > potOdds) {
    return { action: 'call' };
  } else {
    return va.canCheck ? { action: 'check' } : { action: 'fold' };
  }
}
```

### Phase 2（配置化策略 Bot，3-6个月后）

**目标：** 提供可配置的"GTO近似"Bot

```typescript
interface Phase2BotConfig {
  preflop_ranges: Record<Position, HandRange>; // 可以加载GTO range表
  cbet_frequency: number;
  bluff_catch_threshold: number;
  fold_to_3bet: number;
  icm_aware: boolean; // 锦标赛场景用
}
```

实现方案：
- 加载预计算的GTO近似解（lookup table，约100MB）
- 或使用简化CFR在线计算（适合Heads-Up）

### Phase 3（ML/LLM Bot，12个月后）

**统一 AIPlayerAdapter 接口（确保Phase 1-3可无缝替换）：**

```typescript
// packages/shared-types/src/AIAdapter.ts

interface PublicGameState {
  communityCards: Card[];
  pots: Pot[];
  players: Array<{
    position: number;
    name: string;
    chips: number;
    currentBet: number;
    status: PlayerStatus;
    // 注意：不暴露手牌（只有自己的）
  }>;
  currentActorPosition: number;
  phase: Phase;
  actions: GameAction[]; // 本手行动历史
}

interface AIPlayerAdapter {
  // 观察空间（何者可见）
  observe(
    publicState: PublicGameState,
    myHoleCards: Card[]
  ): Observation;

  // 决策
  decide(obs: Observation): Promise<BotDecision>;

  // 教练模式（解释决策，可选）
  explain?(decision: BotDecision): Promise<string>;

  // 安全配置
  readonly timeoutMs: number; // 默认5000ms，超时自动fold
}

// LLM Bot实现
class LLMPokerPlayer implements AIPlayerAdapter {
  readonly timeoutMs = 5000;

  constructor(
    private client: Anthropic | OpenAI,
    private model: string = 'claude-sonnet-4-6'
  ) {}

  async decide(obs: Observation): Promise<BotDecision> {
    const prompt = this.buildPokerPrompt(obs);
    const response = await Promise.race([
      this.client.complete(prompt),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('timeout')), this.timeoutMs)
      )
    ]);
    return this.parseDecision(response);
  }
}
```

**沙箱安全：**
- LLM调用在独立worker线程中执行
- 严格超时（5s），超时自动fold
- 费用限制：每次决策最多500 tokens
- Bot决策日志记录，便于调试

---

## F. 开发计划与 Agent Team 分工

### Agent 团队组建

---

### Agent 1：Product + UX Agent

**负责范围：**
- 用户旅程设计、信息架构、交互规范
- Figma设计稿、原型迭代
- 用户研究（定义训练价值）

**关键设计决策：**
- 训练提示默认开启（新手模式），可关闭（进阶模式）
- 提示面板不阻断游戏操作（侧边栏，不是弹窗）
- 回放标注设计：类似YouTube视频注释的轴点式标注

**交付物：**
1. `docs/ux/user-flows.md` — 完整用户旅程图
2. `docs/ux/wireframes/` — 所有页面线框图
3. `docs/ux/interaction-spec.md` — 动画/交互规范文档
4. Figma设计稿（高保真）

**风险点：**
- 风险：训练提示破坏游戏沉浸感
- 验证：可用性测试（5人），A/B测试提示位置

---

### Agent 2：Game Engine Agent

**负责范围：**
- `packages/game-engine/` 全部模块
- 规则实现、状态机、边池计算、RNG

**关键设计决策：**
- **Immutable GameState**：每次动作产生新State副本（便于回放replay，便于测试）
- **零依赖设计**：game-engine不依赖任何第三方库，只用TypeScript标准库
- 手牌评估使用Cactus Kev算法（O(1)查表，极快）

**核心接口：**
```typescript
// GameEngine.ts
class GameEngine {
  constructor(config: GameConfig) {}

  // 纯函数：输入状态+动作，输出新状态（不修改原状态）
  applyAction(state: GameState, action: PlayerAction): GameState;

  // 获取当前玩家的合法动作
  getValidActions(state: GameState, playerId: string): ValidActions;

  // 前进到下一阶段（发牌等）
  advancePhase(state: GameState): GameState;

  // 结算
  settle(state: GameState): SettleResult;
}
```

**交付物：**
1. `packages/game-engine/` — 完整实现
2. `packages/game-engine/__tests__/` — 100%覆盖率目标
3. `docs/engine/rules.md` — 边界情况文档（边池、all-in等）

**风险点：**
- 风险：边池计算在极端场景（6人多次all-in）出错
- 验证：1000+随机场景压力测试，与pokersolver库输出对比

---

### Agent 3：Backend + Realtime Agent

**负责范围：**
- `apps/server/` — Fastify服务器
- Socket.io房间管理、游戏loop、Bot调度
- 数据库设计、Redis集成
- 认证（JWT）、API设计

**关键设计决策：**
- **并发动作防护**：Redis Lua脚本实现原子锁，防止两个玩家同时提交动作
- **服务器权威**：客户端只发"意图"，服务器验证后广播
- **Bot异步调度**：BullMQ队列，Bot决策异步执行，完成后通过Socket推送

**Socket.io 事件规范：**
```typescript
// Client → Server
interface ClientEvents {
  'room:join':    { roomId: string }
  'room:ready':   {}
  'game:action':  { type: ActionType; amount?: number }
}

// Server → Client
interface ServerEvents {
  'game:state':          GameState       // 全量状态（首次/重连）
  'game:event':          GameEvent       // 增量事件（动画触发用）
  'game:action_required': ActionRequired  // 轮到你了
  'game:hand_result':    HandResult      // 手牌结算
  'error':               ErrorPayload
}
```

**关键API：**
```
POST /api/auth/register
POST /api/auth/login
GET  /api/rooms
POST /api/rooms
GET  /api/rooms/:id
POST /api/rooms/:id/join
GET  /api/games/:id/replay    ← 返回回放数据
GET  /api/users/me/stats      ← 个人统计
```

**交付物：**
1. `apps/server/` — 完整后端服务
2. `docs/api/openapi.yaml` — OpenAPI规范
3. `docs/api/socketio-events.md` — 事件文档
4. `migrations/` — 数据库迁移文件

**风险点：**
- 风险：高并发下Bot决策阻塞游戏loop
- 验证：BullMQ队列隔离Bot计算，游戏loop保持响应

---

### Agent 4：Frontend Table UI Agent

**负责范围：**
- `apps/web/` — Next.js前端全部
- 牌桌组件库、动画系统
- Socket.io客户端状态同步
- 训练HUD、快捷键系统

**关键设计决策：**
- DOM渲染（非Canvas），动画用Framer Motion
- 游戏状态用Zustand，与Socket.io事件解耦
- 组件拆分：PlayingCard, PokerTable, PlayerSeat, ActionPanel, Pot, ChipStack

**核心状态管理：**
```typescript
// apps/web/src/stores/gameStore.ts
interface GameStore {
  state: GameState | null;
  myPlayerId: string | null;
  pendingAction: ActionRequired | null;
  trainingHints: TrainingHint[];

  // Actions
  syncState: (newState: GameState) => void;
  handleEvent: (event: GameEvent) => void;
  submitAction: (action: ActionType, amount?: number) => void;
}
```

**关键组件：**
```typescript
// 卡牌组件（SVG渲染）
<PlayingCard card="Ah" faceDown={false} highlighted={false} />

// 牌桌（动态布局2-6人）
<PokerTable players={players} communityCards={board} />

// 行动面板
<ActionPanel validActions={validActions} onAction={submitAction} />

// 训练HUD
<TrainingHUD hints={hints} visible={showHints} />
```

**交付物：**
1. `apps/web/` — 完整前端
2. Storybook组件文档
3. `docs/frontend/keyboard-shortcuts.md`

**风险点：**
- 风险：多个同时动画导致性能问题（6人发牌）
- 验证：Chrome DevTools性能分析，目标60FPS

---

### Agent 5：Data + Replay/Analytics Agent

**负责范围：**
- 回放系统（ReplayViewer组件 + 回放API）
- 个人统计数据聚合
- 训练提示计算引擎（底池赔率、手牌强度）
- 对局数据分析API

**核心回放设计：**
```typescript
// 回放控制器（纯前端，不需要WebSocket）
class ReplayController {
  private actions: GameAction[];
  private currentIndex: number = 0;
  private speed: number = 1;

  // 从action列表重建任意时刻的GameState
  getStateAtStep(step: number): GameState {
    return this.actions
      .slice(0, step)
      .reduce(
        (state, action) => engine.applyAction(state, action),
        this.initialState
      );
  }

  // 获取这一步的训练分析
  getAnalysis(step: number): StepAnalysis {
    const state = this.getStateAtStep(step);
    const action = this.actions[step];
    const optimalAction = evaluateOptimalAction(state, action.playerId);
    return {
      actualAction: action,
      optimalAction,
      evDiff: calcEVDifference(optimalAction, action, state),
      explanation: generateExplanation(state, action, optimalAction)
    };
  }
}
```

**统计API（聚合查询）：**
```
GET /api/users/me/stats
Response: {
  totalHands: 234,
  winRate: 0.47,
  avgProfit: 45.2,
  vpip: 0.22,
  pfr: 0.18,
  afq: 0.34,
  byPosition: { BTN: {...}, SB: {...}, ... },
  trend: [{ date, winRate, handsPlayed }]  // 30天趋势
}
```

**交付物：**
1. `apps/web/src/components/ReplayViewer/` — 回放组件
2. `packages/game-engine/src/TrainingAnalyzer.ts` — 训练分析
3. 统计API实现
4. `docs/analytics/metrics.md`

**风险点：**
- 风险：回放与实时游戏状态不一致
- 验证：确定性测试（相同输入 → 相同GameState）

---

### Agent 6：Bot/AI Roadmap Agent

**负责范围：**
- `packages/bot-engine/` — Phase 1 Bot实现
- Phase 2/3 架构设计文档
- AIPlayerAdapter接口定义
- Bot难度配置系统

**Phase 1 Bot实现细节：**
```typescript
// packages/bot-engine/src/HandRangeEvaluator.ts

// 手牌强度评估（核心算法）
function evaluateHandStrength(
  holeCards: Card[],
  communityCards: Card[]
): HandStrength {
  if (communityCards.length === 0) {
    // Preflop：陈氏起手牌排名
    return evaluatePreflopStrength(holeCards);
  } else {
    // Postflop：Monte Carlo模拟（1000次）估算equity
    return monteCarloEquity(holeCards, communityCards, 1000);
  }
}

// Preflop 位置 range 表
const PREFLOP_RANGES: Record<Position, PreflopRange> = {
  BTN: { openRange: 0.35, vs3betRange: 0.15 },
  CO:  { openRange: 0.25, vs3betRange: 0.12 },
  HJ:  { openRange: 0.20, vs3betRange: 0.10 },
  UTG: { openRange: 0.14, vs3betRange: 0.07 },
  // ...
};
```

**交付物：**
1. `packages/bot-engine/` — Phase 1实现（3种Bot）
2. `docs/ai/roadmap.md` — Phase 2/3 详细规划
3. `packages/shared-types/src/AIAdapter.ts` — 统一接口
4. Bot难度测试报告（vs 不同水平假想玩家）

**风险点：**
- 风险：Bot玩法过于机械，用户识破策略后无训练价值
- 验证：引入随机性（20%概率偏离"最优"动作），模拟真实人类错误

---

## G. 风险清单与优先级

### 技术风险

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| 并发动作处理bug | 中 | 高（金钱相关） | Redis原子锁 + 状态版本号校验 |
| 边池计算错误 | 中 | 高（规则核心） | 独立模块 + 100+单元测试 + 随机场景压力测试 |
| 断线重连状态不一致 | 高 | 中（体验问题） | 全量快照策略（非diff），30s保座 |
| Bot决策阻塞游戏loop | 低 | 中（延迟感知） | BullMQ异步队列 |
| WebSocket连接稳定性 | 中 | 中 | Socket.io自动重连 + 指数退避 |

### 产品风险

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| 训练提示"感知价值不足" | 高 | 高 | 清晰的好/坏决策反馈，EV差值可视化 |
| Bot太强用户放弃 | 中 | 高 | 多难度 + 新手模式默认Fish Bot |
| Bot太弱无训练价值 | 中 | 中 | TAG/LAG Bot提供合理挑战 |
| 用户不知道如何使用训练功能 | 高 | 中 | 引导式Onboarding，首次进入有使用教程 |

### MVP 范围控制（坚决不做）

❌ 多人真人联机
❌ 排行榜/社交功能
❌ 真实金钱/货币化
❌ 移动端
❌ 锦标赛模式
❌ LLM/ML Bot
❌ 筹码购买/充值
❌ 好友系统

---

## H. 最小可运行 MVP 里程碑

### Sprint 计划（12周 / 6个Sprint）

```
Sprint 1（Week 1-2）：游戏引擎核心
├── game-engine: 状态机实现
├── game-engine: 规则 + 动作校验
├── game-engine: 边池计算
├── game-engine: 手牌评估（集成Cactus Kev）
└── 目标：单元测试全绿，可在Node.js中运行完整一局

Sprint 2（Week 3-4）：后端基础设施
├── Fastify服务器 + 认证（JWT）
├── PostgreSQL schema + Drizzle ORM
├── Redis集成（房间状态）
├── Socket.io基础：房间加入/状态广播
└── 目标：Postman测试全部API，Socket.io可创建房间

Sprint 3（Week 5-6）：前端牌桌UI
├── Next.js 15项目初始化
├── 牌桌布局（PlayingCard, PokerTable, PlayerSeat）
├── ActionPanel（按钮 + 加注滑块）
├── Socket.io客户端集成
└── 目标：浏览器中能看到牌桌，能点击行动按钮

Sprint 4（Week 7-8）：Bot + 完整游戏loop
├── bot-engine: Fish/TAG Bot实现
├── 完整游戏loop：发牌→下注→结算
├── Bot动作触发（BullMQ异步）
├── 动画：发牌/下注/赢牌
└── 目标：玩家可以vs Bot完整打一局德州

Sprint 5（Week 9-10）：回放 + 训练提示
├── 对局记录存储（game_actions表）
├── ReplayViewer组件
├── 训练HUD（底池赔率、手牌强度）
├── 个人统计API + 统计页面
└── 目标：打完一局可以回放，可以看训练提示

Sprint 6（Week 11-12）：集成测试 + 打磨 + 发布
├── E2E测试（Playwright）
├── 性能优化（动画60FPS，首屏<2s）
├── 错误处理（断线重连、超时）
├── 部署到生产环境（Vercel + Railway）
└── 目标：MVP发布，可分享链接给用户试玩
```

### MVP Definition of Done

- [ ] 用户可以注册/登录（或Guest模式）
- [ ] 用户可以创建房间，选择2-5个Bot
- [ ] 完整德州扑克一局可以正常进行（所有阶段、all-in、边池）
- [ ] Bot可以自动行动（1-3s延迟）
- [ ] 游戏结算正确（筹码计算、赢家显示）
- [ ] 可以查看上一手回放
- [ ] 训练提示HUD可以显示底池赔率和手牌强度
- [ ] 断线重连可以恢复状态
- [ ] 桌面浏览器（Chrome/Firefox/Safari）均可正常运行

---

## I. 附录：关键依赖包

```json
// packages/game-engine
{
  "dependencies": {} // 零依赖！
}

// packages/bot-engine
{
  "dependencies": {
    "@aipoker/game-engine": "workspace:*"
  }
}

// apps/server
{
  "dependencies": {
    "fastify": "^5.0.0",
    "socket.io": "^4.7.0",
    "drizzle-orm": "^0.36.0",
    "ioredis": "^5.4.0",
    "bullmq": "^5.0.0",
    "zod": "^3.23.0",
    "jsonwebtoken": "^9.0.0",
    "@aipoker/game-engine": "workspace:*",
    "@aipoker/bot-engine": "workspace:*"
  }
}

// apps/web
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "zustand": "^5.0.0",
    "framer-motion": "^11.0.0",
    "socket.io-client": "^4.7.0",
    "tailwindcss": "^4.0.0",
    "@aipoker/game-engine": "workspace:*",
    "@aipoker/shared-types": "workspace:*"
  }
}
```

---

*报告结束 — 下一步建议：初始化monorepo结构，Agent 2（Game Engine）最先开始，因为其他所有模块都依赖它。*
