# AiPoker 工程规范（详细参考）

> 版本：v0.3 | 日期：2026-03-03
> 本文件是**按需参考文档**，不需要每次对话都读。核心规则见项目根目录 `AGENTS.md`（Codex）与 `CLAUDE.md`（Claude）。
> 代码风格的大部分规则由 ESLint + tsconfig + Prettier 自动执行。

---

## 1. Monorepo 结构

```
AiPoker/
├── AGENTS.md                  # Codex Agent 指令（自动加载）
├── CLAUDE.md                  # Claude Agent 指令（自动加载）
├── Docs/                      # 参考文档
├── apps/
│   ├── web/                   # Next.js 前端
│   └── server/                # Fastify + Socket.io
├── packages/
│   ├── game-engine/           # 纯 TS：规则/状态机/结算（无 I/O）
│   ├── shared/                # 类型、事件契约、Zod schema、错误码
│   ├── bot-engine/            # Bot 决策（依赖 game-engine）
│   └── ui/                    # 可选：跨应用复用 UI 组件
└── tooling/                   # ESLint config、CI scripts
```

### 依赖图

```
game-engine  ←  bot-engine  ←  server
     ↑              ↑
   shared ─────────┘
     ↑
    web ──→ game-engine (replay only)
```

禁止反向 import。`apps/web` 不得 import `apps/server`。

---

## 2. Error Handling 策略

| 层 | 策略 | 示例 |
|----|------|------|
| `game-engine` | 返回 `Result<T, E>`，**不 throw** | `applyAction() → Result<GameState, ActionError>` |
| `server` | throw `AppError(code, message, httpStatus)` | 统一 Fastify errorHandler 捕获 |
| `web` | React ErrorBoundary（页面级 + 组件级） | Toast 显示用户友好信息，不暴露 stack |

错误码注册表在 `packages/shared/src/errors/error-codes.ts`，前后端共享。

---

## 3. Clean Architecture 落地

### 3.1 `packages/game-engine`

```
src/
├── state/        # GameState, HandState, StreetBettingState
├── rules/        # 动作校验、min-raise、re-open、dead button
├── settlement/   # side pot、hand ranking、odd chip
├── replay/       # action log apply、快照生成
└── index.ts      # 对外暴露纯函数 API
```

**强约束：** 随机通过 `rng` 注入，时间通过 `nowMs` 参数传入。

### 3.2 `apps/server`

```
src/
├── http/          # REST handlers (auth, history, stats)
├── ws/            # Socket.io handlers
├── rooms/         # Room 生命周期
├── game-loop/     # tick/计时器/断线处理
├── persistence/   # DB repositories (Drizzle)
└── config.ts      # 环境变量 Zod 校验（启动即验证）
```

**关键约束：**
- ws handler：鉴权 → validate(Zod) → 调 roomService → ack
- roomService：per-room 串行队列 → 调 engine → persist → broadcast

### 3.3 `apps/web`

```
src/
├── app/           # Next.js app router
├── components/    # 按 domain 拆
├── stores/        # Zustand (gameStore / uiStore / authStore)
└── lib/           # socket client, hooks, formatters
```

**关键约束：** Server snapshot 为唯一真源。MVP 不做乐观更新。

---

## 4. Testing 指南

### 覆盖率目标

| 包 | 目标 | 重点 |
|----|------|------|
| game-engine | ≥ 95% | 每条规则、side pot、all-in 边界 |
| shared | ≥ 90% | Zod schema |
| bot-engine | ≥ 80% | 决策逻辑 |
| server | ≥ 75% | API + Socket 事件流 |
| web | ≥ 70% | 组件交互 |

### 规则

- 测试放 `__tests__/`，镜像 `src/` 目录结构
- 统一 Arrange → Act → Assert
- game-engine **禁止 mock**（纯函数不需要）
- server **只 mock 外部 I/O**（DB、Redis）
- 用 factory 函数创建测试数据（`createGameState()`, `createPlayer()`）

---

## 5. Security Checklist

- [ ] 输入三道校验：Client UI → Server Zod → Engine rules
- [ ] Guest/用户 token 存 httpOnly cookie，不放 localStorage
- [ ] HTTP rate limit: 100 req/min/user
- [ ] Socket rate limit: 20 actions/min/user
- [ ] Server 发给玩家的 state 清空他人 holeCards
- [ ] Bot 策略参数不发客户端
- [ ] 全部使用 Drizzle 参数化查询，禁止拼接 SQL
- [ ] CSP header + React 默认 XSS 防护

---

## 6. Performance Budget

| 指标 | 预算 |
|------|------|
| 首屏 FCP | < 1.5s |
| JS Bundle (initial) | < 200KB gzip |
| 动画帧率 | ≥ 60FPS |
| Action 处理 (server p95) | < 50ms |
| WS 消息大小 | < 4KB |
| Bot 决策 (不含模拟延迟) | < 500ms |

---

## 7. Socket Event Contract

```ts
// Client → Server (必须有 ack 回调)
'room:join'     → { roomId: string }
'room:ready'    → {}
'game:action'   → { type: ActionType; amount?: number; seq: number }

// Server → Client (fire-and-forget)
'game:state'           → ClientGameState
'game:event'           → GameEvent
'game:action_required' → { validActions, timeoutMs }
'game:hand_result'     → HandResult
'error'                → { code: ErrorCode; message: string }
```

- 添加字段安全；删除字段禁止直接删（先 deprecated 2 sprint）
- Client action 附带 `seq` 做幂等去重

---

## 8. Git 规范

- 分支: `feat/xxx`, `fix/xxx`, `refactor/xxx`
- Commit: Conventional Commits（由 `commitlint` 强制）
- Scope: `engine` / `server` / `web` / `shared` / `bot` / `ci`
- PR 聚焦单一主题，描述含 What + Why + How to test
