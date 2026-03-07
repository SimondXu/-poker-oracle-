# AiPoker — 技术架构

> 从 PRD v1.0 §C 抽取。技术选型与取舍理由。

---

## 1. 架构总览

```
┌─────────────────────────────────────────────────┐
│                  前端 (Next.js 15)               │
│  React 19 · TypeScript · Tailwind · Zustand     │
│  Framer Motion · Socket.io-client · shadcn/ui   │
└────────────────────┬────────────────────────────┘
                     │ WebSocket (Socket.io)
┌────────────────────▼────────────────────────────┐
│                后端 (Fastify + Node.js)           │
│  TypeScript · Socket.io · Zod · Drizzle ORM     │
│  (可选：BullMQ / Redis)                          │
└──────┬──────────────────┬───────────────────────┘
       │                  │
┌──────▼──────┐    ┌──────▼──────┐
│ PostgreSQL  │    │   Redis     │
│ (Self-host) │    │ (Optional)  │
│  永久存储   │    │  可选加速   │
└─────────────┘    └─────────────┘
```

---

## 2. 前端技术栈

| 技术 | 选择 | 取舍理由 |
|------|------|---------|
| 框架 | **Next.js 15 (App Router)** | SSR 加速初始加载；Server Components 优化数据获取。备选：Vite+React（更轻但失去 SSR） |
| 语言 | **TypeScript** | 前后端共享类型，减少联调错误 |
| 样式 | **Tailwind CSS + shadcn/ui** | 开发快；高质量基础组件。备选：MUI（过重） |
| 状态管理 | **Zustand** | 轻量、适合游戏状态。备选：Redux Toolkit（过重）；不用 Context（频繁更新重渲染） |
| 动画 | **Framer Motion** | 声明式动画，卡牌翻转/飞行简洁实现。备选：GSAP（更强但体积大） |
| 实时通信 | **Socket.io-client** | 配套服务端，自动重连、rooms 支持 |
| 渲染方式 | **DOM + CSS（非 Canvas）** | 开发快；可访问性好；动画够用。备选：Pixi.js（仅超高帧率需求才考虑） |

---

## 3. 后端技术栈

| 技术 | 选择 | 取舍理由 |
|------|------|---------|
| 运行时 | **Node.js 22 LTS** | 前后端共享 game-engine；TypeScript 生态成熟 |
| 框架 | **Fastify** | 比 Express 快 3-4x；内置 Schema 验证。备选：Hono（更轻但生态小） |
| WebSocket | **Socket.io** | Rooms 天然适配游戏房间；自动重连。备选：原生 ws（需自己实现 rooms） |
| 任务队列 | （可选）**BullMQ** | MVP 先用 in-process 队列/worker threads；需要延迟任务/强隔离再引入 BullMQ |
| 验证 | **Zod** | 运行时类型验证，与 TypeScript 完美集成 |
| ORM | **Drizzle ORM** | TypeScript 原生，性能好，比 Prisma 更轻 |

### 身份策略（MVP）

- 采用 **Guest-first**：无需注册即可开始。
- 服务端签发 `httpOnly cookie`（guest token）作为会话身份。
- 房间号用于发现与进入房间；动作授权以服务端会话身份为准。
- 账号体系（邮箱/密码）作为 Phase 2 的可选升级能力，不阻断 MVP 体验。

---

## 4. 实时通信：WebSocket vs WebRTC

选择 **WebSocket（Socket.io）**：

- 扑克是 **服务器权威** 游戏 —— 服务器才是唯一真相来源
- WebRTC 是 P2P，无法服务器端反作弊验证
- Socket.io 的 rooms 天然映射游戏房间概念
- 延迟要求：扑克不需要毫秒级延迟，100-200ms 完全可接受

---

## 5. Monorepo 结构（pnpm + Turborepo）

```
AiPoker/
├── packages/
│   ├── game-engine/        # 纯 TS，零依赖，前后端共享
│   ├── shared/             # 类型、事件契约、Zod schema、错误码
│   ├── bot-engine/         # Bot 决策（依赖 game-engine）
│   └── ui/                 # 可选：跨应用复用 UI 组件
├── apps/
│   ├── web/                # Next.js 15
│   └── server/             # Fastify + Socket.io
├── turbo.json
└── pnpm-workspace.yaml
```

依赖图详见 [`engineering-styleguide.md §1`](./engineering-styleguide.md)。

---

## 6. 数据存储策略

### PostgreSQL（持久数据）
- 用户账号、历史、统计
- 对局记录、行动序列（回放用）

### 房间运行态（MVP：内存）

- 房间权威状态（Table/Hand）保存在 `apps/server` 内存中，并通过 **per-room 串行队列**推进。
- 每个 action 都持久化到 PostgreSQL（`hand_actions` 等）用于回放与训练分析。
- 个人训练产品的 MVP 默认接受“进程重启会丢失进行中的房间状态”。若需要恢复，再引入 Redis 或 DB snapshot。

### Redis（可选，用于恢复/加速/多进程）

```
room:{roomId}:state    → GameState JSON           TTL: 24h
bot:{roomId}:{pos}     → Bot 决策状态              TTL: 1h
```

---

## 7. 部署架构

```
开发环境:
  Next.js dev (localhost:3000) + Fastify dev (localhost:3001)
  PostgreSQL (Docker)
  (可选) Redis (Docker)

生产环境（默认：个人服务器 Self-host）:
  Caddy/Nginx   → 反向代理 / TLS
  Next.js       → Web（同机部署）
  Fastify       → API + WebSocket（同机部署）
  PostgreSQL    → Docker（同机部署）
  (可选) Redis  → Docker（需要恢复/队列时再加）

可选云部署（非 MVP 必需）:
  Vercel / Railway / Supabase / Upstash

CI/CD (GitHub Actions):
  PR:    lint → typecheck → unit tests
  main:  E2E tests → build → deploy staging
  tag:   deploy production
```

### 监控
- **Sentry**：前后端错误追踪
- **Better Uptime**：可用性监控
- **Grafana Cloud（免费）**：自定义指标仪表盘

---

## 8. 关键依赖包

```json
// packages/game-engine — 零依赖
{ "dependencies": {} }

// packages/bot-engine
{ "dependencies": { "@aipoker/game-engine": "workspace:*" } }

// apps/server
{
  "dependencies": {
    "fastify": "^5.0", "socket.io": "^4.7", "drizzle-orm": "^0.36",
    "zod": "^3.23",
    "@aipoker/game-engine": "workspace:*",
    "@aipoker/bot-engine": "workspace:*"
  }
}

// apps/web
{
  "dependencies": {
    "next": "^15.0", "react": "^19.0", "zustand": "^5.0",
    "framer-motion": "^11.0", "socket.io-client": "^4.7",
    "tailwindcss": "^4.0",
    "@aipoker/game-engine": "workspace:*",
    "@aipoker/shared": "workspace:*"
  }
}
```

> 可选依赖（按需引入）：`ioredis` / `bullmq`（仅当你确定需要 Redis 或独立队列 worker 时）。
