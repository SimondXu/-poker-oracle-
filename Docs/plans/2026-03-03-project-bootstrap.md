# AiPoker Monorepo Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按项目规则完成 AiPoker 初始工程骨架，形成可扩展的 pnpm + Turborepo monorepo，并建立最小可验证的 engine/shared/bot 代码与测试基线。

**Architecture:** 根目录负责 workspace 编排与统一脚本；`packages/game-engine` 保持纯函数与确定性；`packages/bot-engine` 仅依赖 engine/shared；`apps/server` 与 `apps/web` 作为应用入口层，不反向依赖。初始化阶段优先保证结构正确、约束清晰、可本地验证。

**Tech Stack:** Node.js 22、pnpm workspace（配置就绪）、Turborepo、TypeScript（源码）、Node 内建 test runner（`--experimental-strip-types`）。

### Task 1: Root Workspace Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.npmrc`

**Step 1: 定义根脚本与工作区包清单**
- 在 `package.json` 中定义 `dev/build/lint/test/typecheck` 脚本，统一走 turbo。

**Step 2: 建立 workspace 与 turbo pipeline**
- 写 `pnpm-workspace.yaml` 包含 `apps/*`、`packages/*`。
- 写 `turbo.json`，为 `build/lint/typecheck/test/dev` 定义依赖关系与缓存策略。

**Step 3: 建立共享 TypeScript 配置**
- 写 `tsconfig.base.json`，统一 strict、ESM、路径别名（`@aipoker/*`）。

**Step 4: 本地执行基础检查**
Run: `node --version`
Expected: Node 22.x

### Task 2: Shared Package Baseline (TDD)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

**Step 1: Write the failing test**
- 新增测试：校验 `ok/err` Result helper 返回结构稳定。

**Step 2: Run test to verify it fails**
Run: `node --experimental-strip-types --test packages/shared/src/index.test.ts`
Expected: FAIL（导入符号不存在）

**Step 3: Write minimal implementation**
- 在 `index.ts` 实现 `Result<T,E>`、`ok`、`err`。

**Step 4: Run test to verify it passes**
Run: `node --experimental-strip-types --test packages/shared/src/index.test.ts`
Expected: PASS

### Task 3: Game Engine Baseline (TDD)

**Files:**
- Create: `packages/game-engine/package.json`
- Create: `packages/game-engine/tsconfig.json`
- Create: `packages/game-engine/src/index.ts`
- Test: `packages/game-engine/src/index.test.ts`

**Step 1: Write the failing test**
- 测试 `createDeck` 使用注入 `rng` 洗牌且结果可重复。
- 测试 `createDeck` 不依赖 `Math.random`。

**Step 2: Run test to verify it fails**
Run: `node --experimental-strip-types --test packages/game-engine/src/index.test.ts`
Expected: FAIL（函数未实现）

**Step 3: Write minimal implementation**
- 实现 `createDeck(rng)` 与内部纯洗牌逻辑。
- 导出 `Rng` 类型，禁止隐式全局随机源。

**Step 4: Run test to verify it passes**
Run: `node --experimental-strip-types --test packages/game-engine/src/index.test.ts`
Expected: PASS

### Task 4: Bot Engine Baseline (TDD)

**Files:**
- Create: `packages/bot-engine/package.json`
- Create: `packages/bot-engine/tsconfig.json`
- Create: `packages/bot-engine/src/index.ts`
- Test: `packages/bot-engine/src/index.test.ts`

**Step 1: Write the failing test**
- 测试 bot 在给定 valid actions 与注入 rng 时，返回可预测动作。

**Step 2: Run test to verify it fails**
Run: `node --experimental-strip-types --test packages/bot-engine/src/index.test.ts`
Expected: FAIL（函数未实现）

**Step 3: Write minimal implementation**
- 实现 `chooseBotAction`：优先 `check`，否则 `call`，否则 `fold`，并允许 rng 控制轻微随机偏好。

**Step 4: Run test to verify it passes**
Run: `node --experimental-strip-types --test packages/bot-engine/src/index.test.ts`
Expected: PASS

### Task 5: App Skeletons and Dependency Direction

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/src/index.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/app/page.tsx`

**Step 1: server skeleton**
- 建立最小 HTTP 健康检查入口，依赖方向仅指向 packages。

**Step 2: web skeleton**
- 建立最小 Next.js 页面与 `next.config.ts`。
- 明确不引入 `apps/server`。

**Step 3: 验证目录结构**
Run: `rg --files apps packages`
Expected: 目录与文件完整。

### Task 6: Root Verification

**Files:**
- Modify: `package.json`（聚合测试命令）

**Step 1: 运行全部基础测试**
Run: `node --experimental-strip-types --test packages/*/src/*.test.ts`
Expected: 全部 PASS

**Step 2: 运行 git 变更检查**
Run: `git status --short`
Expected: 仅包含初始化相关新增/修改。
