# AiPoker 工程规范（Code Style + Folder Structure + Reuse）

> 版本：v0.1 | 日期：2026-03-03  
> 目标：用“清晰边界 + 强约束 + 可复用模块 + 可测试性”保证长期可维护与可扩展（即使当前单机部署）。

---

## 0. 设计原则（必须遵守）

1. **引擎纯净**：`game-engine` 只做规则与状态变换（纯函数/确定性），不含网络/数据库/时间/随机全局副作用。
2. **契约先行**：跨包/前后端交互必须经过 `shared` 的类型与 runtime 校验（Zod/等价方案）。
3. **单向依赖**：依赖图必须单向（domain -> app -> infra），禁止“下层反向 import 上层”。
4. **事件驱动、状态可回放**：游戏推进基于 action log（可重放），任何 UI 状态都能从服务器快照恢复。
5. **默认可测**：每条关键规则都要有单测用例（尤其是 min-raise、re-open、side pot、dead button）。

---

## 1. Monorepo 结构（方案 A）

前后端 + 引擎同一个 repo（monorepo）。推荐目录：

```
AiPoker/
├── AGENTS.md
├── Docs/
│   ├── PRD.md
│   ├── gameplay-prd.md
│   └── engineering-styleguide.md
├── apps/
│   ├── web/                # Next.js (UI + replay viewer)
│   └── server/             # Fastify + Socket.io (权威状态机)
├── packages/
│   ├── game-engine/        # 纯 TS：规则/状态机/结算（无 I/O）
│   ├── shared/             # 共享：类型、事件契约、runtime 校验、工具
│   ├── bot-engine/         # Bot 决策（依赖 game-engine）
│   └── ui/                 # 可选：跨应用复用 UI 组件（纯前端）
└── tooling/                # 可选：脚本、lint 配置、CI helpers
```

### 1.1 依赖图（强约束）

- `packages/game-engine`：**不依赖任何 apps**；尽量不依赖第三方（或只依赖极少纯计算库）。
- `packages/shared`：允许依赖 `zod` 等校验库；不得依赖 `apps/*`。
- `packages/bot-engine`：可依赖 `game-engine` 与 `shared`。
- `apps/server`：可依赖所有 `packages/*`；负责 I/O（Socket、DB、队列、计时器）。
- `apps/web`：可依赖 `packages/shared`、`packages/ui`、`packages/game-engine`（用于 replay 重放），但**不能**直接依赖 `apps/server`。

---

## 2. 命名规范（统一风格）

### 2.1 文件/目录命名

- 目录：`kebab-case`（如 `game-engine`, `hand-history`）
- TS 文件：`kebab-case.ts`（React 组件可用 `PascalCase.tsx`，但同目录保持一致）
- 导出入口：每个包提供单一入口 `src/index.ts`，禁止跨包深层路径 import（例如禁止 `@aipoker/shared/src/foo`）。

### 2.2 代码命名

- 类型：`PascalCase`（`GameState`, `PlayerId`）
- 变量/函数：`camelCase`（`currentBetToMatch`）
- 常量：`SCREAMING_SNAKE_CASE`（只用于 truly-constant，例如规则表）
- 事件名（Socket）：`namespace:verb`（`room:join`, `game:action`）
- id 字段：统一后缀 `Id`（`roomId`, `handId`, `playerId`）

---

## 3. TypeScript 规范（可维护性核心）

### 3.1 类型策略

- 默认 `strict: true`，禁止 `any`（例外：边界层解析第三方输入时可 `unknown` + 校验后收敛）。
- 用 `unknown` 表示不可信输入，用 Zod/校验函数收敛到可信类型。
- 不要用 `enum`（除非非常必要）；优先用 union literals：`type Phase = 'preflop' | ...`
- id 使用“品牌类型”（branding）避免串用：

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };
export type PlayerId = Brand<string, 'PlayerId'>;
export type RoomId = Brand<string, 'RoomId'>;
```

### 3.2 不变量（Invariant）必须写进类型/校验

- `stack >= 0`
- `handCommitted >= streetCommitted`
- `currentBetToMatch >= 0`
- `pots.amount` 之和 = 全员 `handCommitted` 之和（结算前）

---

## 4. Clean Architecture（建议落地方式）

### 4.1 `packages/game-engine`（Domain）

建议子目录：

- `src/state/`：`GameState`, `HandState`, `StreetBettingState`
- `src/rules/`：动作校验、min-raise、re-open、dead button、BBA
- `src/settlement/`：side pot、hand ranking、odd chip
- `src/replay/`：action log apply、快照生成
- `src/index.ts`：对外暴露 `applyAction`, `getValidActions`, `advance` 等

强约束：

- 任何随机必须通过显式 `rng` 依赖注入（例如 `Rng.nextInt()`），并且可复现。
- 任何时间必须通过参数传入（例如 `nowMs`），禁止 `Date.now()` 直读。

### 4.2 `apps/server`（Application + Infrastructure）

建议子目录：

- `src/http/`：REST handlers（auth、history、stats）
- `src/ws/`：Socket.io handlers（join、action、reconnect）
- `src/rooms/`：Room 生命周期管理（create/start/end）
- `src/game-loop/`：tick/计时器/断线处理（仅 orchestrate）
- `src/persistence/`：DB repositories（hand history、users）
- `src/observability/`：logger、metrics、sentry hooks

关键约束：

- ws handler 只做：鉴权 -> parse/validate -> 调用 room service -> emit
- room service 只做：串行化处理 action（单线程队列/锁）-> 调 engine -> persist -> broadcast

### 4.3 `apps/web`（Presentation）

建议子目录：

- `src/app/`：Next.js app router 页面
- `src/components/`：页面/牌桌组件（可按 domain 拆）
- `src/stores/`：Zustand stores（socket state、UI state）
- `src/lib/`：socket client、formatters、hooks

关键约束：

- UI 的“游戏状态”以 server snapshot 为真源；本地只做乐观态（可选）。
- 组件 props 尽量传“已计算好的 view model”，不要把 engine 规则散落在 UI。

---

## 5. Common Components（高复用组件设计）

### 5.1 Web UI 组件（建议可复用清单）

- `PokerTable`：布局容器（2–9 座位自适应）
- `Seat`：玩家位（头像、筹码、当前下注、行动高亮）
- `CommunityCards`：公共牌展示
- `HoleCards`：底牌展示（仅自己可见；回放/摊牌按规则展示）
- `PotDisplay`：主池/边池展示（含 eligible 提示可选）
- `ActionPanel`：fold/check/call/raise/all-in + bet slider
- `BetSlider`：金额输入（只允许合法区间，避免 server 再做纠错）
- `ActionHistory`：本手行动历史（可折叠）
- `TimerBar`：行动计时
- `ReplayControls`：回放进度、速度、逐步
- `TrainingHUD`：训练提示（赔率、范围、建议）

组件设计约束：

- “渲染组件”不直接依赖 socket；由 store/hook 提供数据。
- 对频繁更新的 UI（计时条、筹码动画）要隔离状态，避免全桌重渲染。

### 5.2 Shared 组件（跨端复用）

建议在 `packages/shared` 提供：

- `events/`：Socket 事件类型（ClientEvents/ServerEvents）+ payload schema
- `schemas/`：Zod schema（输入校验、持久化模型）
- `types/`：品牌类型、基础类型（Card, Rank, Suit, Money）
- `errors/`：统一错误码（可序列化到客户端）

---

## 6. Scalability（单机也要做的“可扩展”）

即便单实例，也要避免“未来改不动”：

- Room 内 action 处理必须串行（per-room queue），避免竞态。
- 状态快照与 action log 持久化要异步但有顺序保证（先落库再广播/或反过来但可恢复）。
- Bot 计算与主 loop 解耦（可先同进程，但用 job/worker 抽象，未来可拆）。
- 内存上限：每个 room 持有的历史/回放数据要分页或持久化，避免常驻爆内存。

---

## 7. Agent Coding Style（让 AI/协作者写出干净代码）

必须遵守：

- 先写/补测试用例再改实现（特别是 `game-engine` 规则）。
- 每次改动聚焦单一主题，避免“顺手重构”扩散 diff。
- 新增功能要同步更新 `Docs/gameplay-prd.md`（规则/边界用例）与必要的事件契约。
- 所有跨包修改都要跑最小验证（unit tests + 类型检查）。

