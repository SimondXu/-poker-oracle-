# AiPoker — Agent 指令

> 本文件自动加载到每次对话。保持精简。详细参考见 `Docs/` 目录。

## 架构铁律（不可违反）

1. **`packages/game-engine` 是纯函数**：零 I/O、零副作用。无 `Date.now()`、无 `Math.random()`、无 `fetch`、无 `fs`。随机通过 `rng` 参数注入，时间通过 `nowMs` 参数传入。
2. **依赖单向**：`game-engine` ← `bot-engine` ← `server`。下层永不 import 上层。`web` 不 import `server`。
3. **服务器权威**：客户端只发意图，服务器校验后广播。永远不信任客户端数据。
4. **他人手牌不发客户端**：server 发给玩家的 state 必须清空其他人的 `holeCards`（showdown 除外）。
5. **game-engine 不 throw**：所有可失败操作返回 `Result<T, E>` 类型。throw 只用于 server 层的 `AppError`。

## 技术栈

- Monorepo: pnpm workspace + Turborepo
- 前端: Next.js 15 / React 19 / Zustand / Framer Motion / Tailwind + shadcn/ui
- 后端: Fastify / Socket.io / Drizzle ORM / BullMQ
- 数据库: PostgreSQL (Supabase) + Redis (Upstash)
- 测试: Vitest + Testing Library + Playwright (E2E)
- 语言: TypeScript strict 全栈

## 代码风格（工具链未覆盖的部分）

- 文件命名: `kebab-case.ts`，React 组件 `PascalCase.tsx`
- 每个包只通过 `src/index.ts` 导出，禁止跨包深层 import
- ID 用 branded type: `type PlayerId = Brand<string, 'PlayerId'>`
- Socket 事件名: `namespace:verb` 格式 (`room:join`, `game:action`)
- Zustand store 按职责拆分（gameStore / uiStore / authStore），用精确 selector 防重渲染
- UI 组件不直接操作 socket，通过 store action 或 hook 封装

## Agent 工作习惯

- 改 game-engine → 先写测试再改实现
- 每次改动聚焦单一主题，不顺手重构
- 跨包修改 → 跑 `pnpm lint && pnpm typecheck && pnpm test`
- 不确定时读现有代码模式，保持一致；不要猜

## 参考文档（按需读取，不要每次都读）

- `Docs/PRD.md` — 产品需求与功能范围
- `Docs/gameplay-prd.md` — 德州规则与边界用例
- `Docs/engineering-styleguide.md` — 完整工程规范（含测试/安全/性能细节）
- `AGENTS.md` — Agent 团队分工
