# AiPoker — 开发计划与 Agent 分工

> 从 PRD v1.0 §F+§H 抽取。6 个 Agent、12 周 MVP。

---

## 1. Agent 团队分工

### Agent 1：Product + UX

| | |
|---|---|
| **范围** | 用户旅程、信息架构、交互规范、设计稿 |
| **读哪些文档** | `PRD.md`, `ui-spec.md` |
| **关键决策** | 训练提示默认开启（新手模式）；提示面板不阻断操作（侧边栏） |
| **交付物** | 用户流程图、线框图、交互规范文档、高保真设计稿 |
| **风险** | 训练提示破坏沉浸感 → 可用性测试验证 |

### Agent 2：Game Engine

| | |
|---|---|
| **范围** | `packages/game-engine/` 全部：状态机、规则校验、边池、RNG、手牌评估 |
| **读哪些文档** | `gameplay-rules.md`（权威）, `data-models.md` |
| **关键决策** | Immutable GameState（每次动作产生新副本）；零依赖设计；RNG 注入 |
| **交付物** | game-engine 完整实现 + ≥95% 测试覆盖 |
| **风险** | 边池极端场景 bug → 随机压力测试 1000+ 场景 |

### Agent 3：Backend + Realtime

| | |
|---|---|
| **范围** | `apps/server/`：Fastify + Socket.io + DB（可选 Redis）+ 认证 |
| **读哪些文档** | `tech-architecture.md`, `data-models.md` |
| **关键决策** | per-room 串行队列 + 状态版本号；（可选）Redis/BullMQ 仅在证明需要时引入 |
| **交付物** | 后端服务 + OpenAPI spec + Socket 事件文档 + DB migrations |
| **风险** | Bot 决策阻塞 loop → worker threads/独立进程隔离；需要队列再 BullMQ |

### Agent 4：Frontend Table UI

| | |
|---|---|
| **范围** | `apps/web/`：牌桌组件、动画、Socket 客户端、训练 HUD、快捷键 |
| **读哪些文档** | `ui-spec.md`, `data-models.md` |
| **关键决策** | DOM 渲染（非 Canvas）；Zustand 按职责拆分 store；Framer Motion 动画 |
| **交付物** | 完整前端 + Storybook 组件文档 |
| **风险** | 6 人同时动画性能 → Chrome DevTools 验证 60FPS |

### Agent 5：Data + Replay/Analytics

| | |
|---|---|
| **范围** | 回放系统 + 个人统计 + 训练提示引擎 |
| **读哪些文档** | `data-models.md`, `gameplay-rules.md`（手牌评估相关） |
| **关键决策** | 回放用 action-log 重放（非 snapshot）；训练提示复用 hand-evaluator |
| **交付物** | ReplayViewer 组件 + 统计 API + TrainingAnalyzer |
| **风险** | 回放与实时不一致 → 确定性 replay 测试 |

### Agent 6：Bot/AI Roadmap

| | |
|---|---|
| **范围** | `packages/bot-engine/` Phase 1 + Phase 2/3 架构文档 |
| **读哪些文档** | `bot-roadmap.md`, `gameplay-rules.md` |
| **关键决策** | AIPlayerAdapter 接口确保 Phase 1-3 可替换；20% 随机偏离避免机械感 |
| **交付物** | 3 种 Bot 实现 + 难度测试报告 + Phase 2/3 架构文档 |
| **风险** | Bot 太机械 → 随机扰动 + 可配置 |

---

## 2. Sprint 计划（12 周 / 6 Sprint）

```
Sprint 1（Week 1-2）：游戏引擎核心 ─── Agent 2
├── 状态机实现（gameplay-rules.md §4）
├── 动作校验（§5 下注规则）
├── 边池计算（§6.3）
├── 手牌评估（§6.2.1）
└── ✅ 目标：单测全绿，Node.js 中可运行完整一手

Sprint 2（Week 3-4）：后端基础设施 ─── Agent 3
├── Fastify 服务器 + JWT 认证
├── PostgreSQL schema + Drizzle ORM
├── 房间状态：MVP 内存为主（可选 Redis）
├── Socket.io 基础（房间加入/状态广播）
└── ✅ 目标：Postman 测 API，Socket.io 可创建房间

Sprint 3（Week 5-6）：前端牌桌 UI ─── Agent 4
├── Next.js 15 项目初始化
├── 牌桌布局（PokerTable, Seat, PlayingCard）
├── ActionPanel（按钮 + BetSlider）
├── Socket.io 客户端集成
└── ✅ 目标：浏览器能看到牌桌、能点击行动

Sprint 4（Week 7-8）：Bot + 完整游戏 loop ─── Agent 6 + Agent 3
├── Fish / TAG Bot 实现
├── 完整游戏 loop：发牌 → 下注 → 结算
├── Bot 动作调度（in-process；可选 BullMQ）
├── 动画：发牌 / 下注 / 赢牌
└── ✅ 目标：玩家可以 vs Bot 完整打一手

Sprint 5（Week 9-10）：回放 + 训练 ─── Agent 5
├── 对局记录存储（hand_actions 表）
├── ReplayViewer 组件
├── 训练 HUD（底池赔率、手牌强度）
├── 个人统计 API + 页面
└── ✅ 目标：打完一手可回放，可看训练提示

Sprint 6（Week 11-12）：集成 + 发布 ─── 全员
├── E2E 测试（Playwright）
├── 性能优化（60FPS, FCP<1.5s）
├── 断线重连 + 错误处理
├── 部署生产（默认：个人服务器 Self-host；可选云部署）
└── ✅ 目标：MVP 发布
```

---

## 3. MVP Definition of Done

- [ ] 用户可以注册/登录（或 Guest 模式）
- [ ] 创建房间，选择 2-5 个 Bot
- [ ] 完整德州一手可正常进行（所有街、all-in、边池）
- [ ] Bot 自动行动（1-3s 延迟）
- [ ] 结算正确（筹码、赢家）
- [ ] 可查看上一手回放
- [ ] 训练 HUD 显示底池赔率和手牌强度
- [ ] 断线 30s 内重连恢复
- [ ] Chrome / Firefox / Safari 均可运行

---

## 4. 依赖关系

```
Sprint 1 (Engine) ─── 无依赖，最先开始
    ↓
Sprint 2 (Backend) ─── 依赖 Engine
    ↓
Sprint 3 (Frontend) ─── 依赖 Backend Socket 事件
    ↓
Sprint 4 (Bot + Loop) ─── 依赖 Engine + Backend
    ↓
Sprint 5 (Replay) ─── 依赖 全部
    ↓
Sprint 6 (集成) ─── 依赖 全部
```

Sprint 1 是关键路径。Engine 延误 → 全线延误。
