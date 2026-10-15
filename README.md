# AiPoker

AiPoker 是一个面向个人训练的德州扑克（No-Limit Texas Hold'em）项目，采用 pnpm + Turborepo 的 monorepo 结构。

当前代码重点在：
- 可测试的规则引擎（`game-engine`）
- 共享类型与事件契约（`shared`）
- Bot 决策引擎（`bot-engine`）
- 实时房间与牌局事件流（`apps/server` + Socket.io）
- Next.js 首页双入口 + 等待室 + 牌桌 UI（`apps/web`）

## Project Status

项目处于持续迭代阶段，核心规则和实时事件链路已可通过测试验证。

已实现的关键能力（基于当前仓库代码）：
- 自由模式双入口：`用户名创建房间` / `用户名+房间号加入`
- 显式建房与严格加房语义（加入不存在房间返回 `room_not_found`）
- 同房同名拦截（`player_name_taken`）
- 服务端权威状态推进（`game:start` / `game:action`）
- 合法动作校验与动作序列去重
- 行动超时自动动作（check/fold）
- 断线与离房后的 seat 清理逻辑
- Bot 自动行动循环（Fish / TAG / LAG）
- 前端实时渲染牌桌、行动面板、行动历史、训练提示

## Repository Layout

```text
AiPoker/
├── apps/
│   ├── server/         # Fastify + Socket.io realtime layer
│   └── web/            # Next.js 15 frontend
├── packages/
│   ├── game-engine/    # Pure TS poker rules + state transitions
│   ├── bot-engine/     # Bot action decision logic
│   └── shared/         # Shared types/contracts between web/server
├── Docs/               # Product/architecture/rules/plans docs
├── turbo.json
└── pnpm-workspace.yaml
```

## Documentation Map

核心文档位于 `Docs/`：
- `Docs/process/PRD.md`：产品需求
- `Docs/game-design/gameplay-rules.md`：玩法规则权威文档
- `Docs/architecture/data-models.md`：类型与接口契约
- `Docs/architecture/tech-architecture.md`：技术架构与选型
- `Docs/game-design/ui-spec.md`：前端 UI/UX 规范
- `Docs/game-design/bot-roadmap.md`：Bot 分阶段路线图

## Tech Stack

- Node.js 22+
- pnpm 10+
- TypeScript 5
- Turborepo
- Next.js 15 + React 19
- Fastify + Socket.io
- Zustand + Framer Motion
- Zod

## Getting Started

### 1. Prerequisites

```bash
node -v   # >= 22
pnpm -v   # >= 10
```

### 2. Install

```bash
pnpm install
```

### 3. Useful Commands (root)

```bash
pnpm dev         # 一条命令同时启动 server + web（推荐）
pnpm dev:all     # 同 pnpm dev
pnpm dev:server  # 仅启动后端
pnpm dev:web     # 仅启动前端
pnpm build       # turbo run build
pnpm typecheck   # turbo run typecheck
pnpm test        # turbo run test
```

### 4. Workspace Commands

```bash
# Frontend
pnpm --filter @aipoker/web dev
pnpm --filter @aipoker/web build
pnpm --filter @aipoker/web typecheck

# Realtime server + tests
pnpm --filter @aipoker/server typecheck
pnpm --filter @aipoker/server test

# Core packages
pnpm --filter @aipoker/game-engine test
pnpm --filter @aipoker/strategy-engine test
pnpm --filter @aipoker/shared typecheck
```

## Environment Variables

### Web (`apps/web`)

- `NEXT_PUBLIC_SERVER_URL` (optional)
  - default: `http://localhost:3001`

示例：

```bash
# apps/web/.env.local
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
```

### Server (`apps/server`)

- `HOST` (optional, default `0.0.0.0`)
- `PORT` (optional, default `3001`)
- `LLM_CLI_BOTS_ENABLED` (optional, default `false`)：开启后候机室可添加 Claude Haiku / Sonnet 机器人（见下）
- `LLM_CLI_BOT_TIMEOUT_MS` (optional, default `30000`)：单次 `claude -p` 决策的期限，超时该手按 TAG 打

### 和 Claude Code 机器人对打（仅本地）

机器人通过本机的 `claude -p` 走你的 Claude 订阅，每手决策一个独立进程（无工具、空目录、白名单环境变量），提示词为 v1.2 + analyst。服务器启动时会检查订阅登录和 canary（`pnpm --filter @aipoker/server eval:cli-canary` 通过过），不通过则不启用并在日志里说明原因。

```bash
# 启动前必须不带 ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY（否则会计到 API 上，服务器拒绝启用）
pnpm --filter @aipoker/server dev:claude-bots   # 等价于 env -u ANTHROPIC_BASE_URL LLM_CLI_BOTS_ENABLED=true ... dev
pnpm --filter @aipoker/web dev
```

遇到登录、用量上限或限流错误时，Claude 机器人在本进程内全部停用，改按 TAG 打，且不会重试。同时最多 2 个 `claude` 进程并行。

## Notes

- 当前仓库以模块与测试驱动开发为主，服务端运行链路主要通过 `apps/server/src/*.test.ts` 验证。
- 前后端契约集中在 `packages/shared/src/index.ts`，改动事件字段时应同步更新 server emitter 与 web hooks。
- 当前 MVP 不包含数据库持久化、登录注册页面、回放页面；以上能力在后续阶段实现。

## License

暂未定义（TBD）。
