# Backend Game Rules And Auto Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 bootstrap 基线上完成服务端权威的手牌初始化、行动校验与推进，并接入 Bot 自动行动闭环。

**Architecture:** `packages/game-engine` 负责纯规则（合法动作、动作应用、回合推进）；`apps/server` 只维护 room 生命周期和 socket 事件，所有动作先过 engine 校验再广播；Bot 仍通过统一 action API 推进，确保真人/Bot 同规则。

**Tech Stack:** TypeScript、Node test runner、Fastify、Socket.io、Zod、workspace packages。

### Task 1: Expand Game Engine Action Model (TDD)

**Files:**
- Modify: `packages/game-engine/src/index.ts`
- Test: `packages/game-engine/src/index.test.ts`

**Step 1: Write failing tests for valid actions**
- 覆盖 `toCall`、`canCheck/canCall`、`minRaiseTo/maxRaiseTo`、`all_in`。

**Step 2: Run test to verify failure**
Run: `pnpm --filter @aipoker/game-engine test`
Expected: FAIL（缺少合法动作与行动推进 API）

**Step 3: Implement minimal action APIs**
- 新增 `getValidActions(handState, playerId)`
- 新增 `applyAction(handState, action)`
- 补齐 `pendingActors/hasActed/matchedBetToMatchAtLastAction`

**Step 4: Re-run tests**
Run: `pnpm --filter @aipoker/game-engine test`
Expected: PASS

### Task 2: Add Re-open And PendingActors Behaviors (TDD)

**Files:**
- Modify: `packages/game-engine/src/index.ts`
- Test: `packages/game-engine/src/index.test.ts`

**Step 1: Write failing tests**
- 短 all-in 不 re-open：已行动玩家不能再 raise。
- 累计到 full raise 后 re-open：玩家重新可 raise。
- `pendingActors` 在 raise 后重置，在 call/check/fold 后移除。

**Step 2: Run failing tests**
Run: `pnpm --filter @aipoker/game-engine test`
Expected: FAIL（re-open 与 pendingActors 行为不正确）

**Step 3: Implement minimal fixes**
- 按 `matchedBetToMatchAtLastAction` 计算 `delta`。
- 按 `pendingActors` 判断本街是否结束。

**Step 4: Re-run tests**
Run: `pnpm --filter @aipoker/game-engine test`
Expected: PASS

### Task 3: Wire Realtime Room Game Loop (TDD)

**Files:**
- Modify: `apps/server/src/realtime.ts`
- Modify: `apps/server/src/realtime.test.ts`

**Step 1: Write failing realtime tests**
- 新增 `game:start` 成功初始化手牌并广播 `game:state`。
- 新增 `game:action` 仅允许当前行动者操作。
- 动作后广播新状态与下一行动者。

**Step 2: Run failing tests**
Run: `pnpm --filter @aipoker/server test`
Expected: FAIL（事件不存在或行为不符）

**Step 3: Implement minimal server room state**
- room 保存 `config/players/handState`。
- `game:start` 调用 engine `initializeHand`。
- `game:action` 调用 engine `applyAction` 并广播。

**Step 4: Re-run tests**
Run: `pnpm --filter @aipoker/server test`
Expected: PASS

### Task 4: Add Bot Auto Agent Turn Runner (TDD)

**Files:**
- Modify: `apps/server/src/realtime.ts`
- Modify: `apps/server/src/realtime.test.ts`

**Step 1: Write failing tests**
- 当 `currentActor` 是 bot，服务端自动触发 bot 决策并推进动作。
- 自动动作后仍保证 `game:state` 广播顺序和合法性。

**Step 2: Run failing tests**
Run: `pnpm --filter @aipoker/server test`
Expected: FAIL（bot 自动行动缺失）

**Step 3: Implement minimal bot runner**
- 使用 `@aipoker/bot-engine` 的 `chooseBotAction`。
- 仅在 bot 回合触发，直到轮到真人或手牌结束。

**Step 4: Re-run tests**
Run: `pnpm --filter @aipoker/server test`
Expected: PASS

### Task 5: End-to-End Workspace Verification

**Files:**
- Modify: `docs/plans/2026-03-03-backend-game-rules-and-auto-agent.md`（记录结果）

**Step 1: Full test**
Run: `pnpm test`
Expected: PASS

**Step 2: Typecheck**
Run: `pnpm typecheck`
Expected: PASS

**Step 3: Sanity status**
Run: `git status --short`
Expected: 仅出现本次实现相关变更。

## Execution Status (2026-03-04)

### Completion Summary

- [x] Task 1: Expand Game Engine Action Model
- [x] Task 2: Add Re-open And PendingActors Behaviors
- [x] Task 3: Wire Realtime Room Game Loop
- [x] Task 4: Add Bot Auto Agent Turn Runner
- [x] Task 5: End-to-End Workspace Verification

### Implemented Commits

- `66f6ad6` feat(engine): progress betting streets through river
- `37373da` feat(engine): add side-pot builder utility
- `5c800a7` feat(engine): attach computed pots to hand-end state
- `801e4aa` feat(engine): settle uncontested pots at hand end
- `d3b9a2a` feat(engine): auto-runout all-in streets to hand end
- `ba961d9` feat(engine): deal hole cards during hand initialization
- `39cbc21` feat(engine): settle showdown pots with hand ranking
- `e31d85e` feat(server): auto-run bot turns in realtime loop

### Verification Evidence

- Full test: `pnpm test` -> PASS
- Full typecheck: `pnpm typecheck` -> PASS
- Server targeted test (bot loop): `pnpm --filter @aipoker/server test` -> PASS

## Post-Plan Hardening Iterations (2026-03-04)

- `73f2afe` refactor(server): separate ws view-model and bot game-loop modules
  - 拆分 `ws` 视图模型和 `game-loop` 机器人轮询逻辑，避免单文件堆积，贴合 `apps/server/src` 分层规范。
- feat(server): enforce `game:action.seq` idempotency
  - `game:action` 增加必填 `seq`，对同一玩家重复/过期序号返回 `duplicate_action_seq`，防止网络重试导致重复推进。
- feat(server): emit `game:action_required` for current human actor
  - 每次状态推进后，为当前真人行动者下发 `validActions + timeoutMs`，对齐实时事件契约并为行动倒计时接入做准备。
- feat(server): emit `game:hand_result` at `hand_end`
  - 在手牌结束时向房间广播结算摘要（pot/payout/player stacks），为回放与结果面板提供稳定事件源。
- feat(server): add action timer auto-fold/check loop
  - 新增 per-room 行动超时调度，超时按规则执行 `toCall==0 -> check` / `toCall>0 -> fold`，并自动衔接 bot 回合与后续计时。
- fix(server): align `game:action_required.timeoutMs` with configured timer
  - 消除固定 30s 常量，改为房间级 `actionTimeoutMs`，保证客户端提示与服务端真实超时一致。
