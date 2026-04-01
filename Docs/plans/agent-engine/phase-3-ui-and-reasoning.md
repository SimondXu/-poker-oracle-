# Agent Engine Phase 3: UI And Reasoning

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this phase task-by-task.

## Goal

展示可观测性和 demo 价值，但不泄漏公平信息。

## Files

- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/features/game/hooks/useGameSocket.ts`
- Modify: `apps/web/src/stores/gameStore.ts`
- Create: `apps/web/src/features/game/components/AgentReasoningPanel.tsx`
- Create: `apps/web/src/features/game/components/TableChat.tsx`
- Modify: `apps/web/src/components/game/table/Seat.tsx`
- Modify: `apps/web/src/features/room/hooks/useRoomSocket.ts`

## Scope

### 1. Reasoning visibility

默认策略：

- `bot_status`: 全桌可见
- `table:chat`: 全桌可见
- `bot_reasoning`: 默认 `table_after_hand`

要求：

- 不泄漏 hidden information
- 不在 hand 进行中公开完整 reasoning
- reasoning panel 应该支持 limited replay / after-hand viewing

### 2. Table chat

保留 table chat 作为 demo signal，但不让它污染主线 runtime。

约束：

- 只在已观测事件后触发
- 每手每 agent 最多 1 条
- 最大 140 chars
- profanity / unsafe filter

### 3. Room UI bot selector

房间 UI 需要支持：

- `rule` vs `llm` bot config 选择
- model 和 persona 选择
- 与 shared `BotConfig` 合同一致

## Tests

- reasoning visibility obeys audience
- seat thinking indicator tracks `game:bot_status`
- room UI can choose `rule` vs `llm` bot config

## Exit Criteria

- 玩家能看到 bot 思考状态和 chat signal
- after-hand reasoning 可查看
- UI 的 bot config 和 shared/server 合同一致

## Out Of Scope

- hand-end memory reducer
- experiment dashboard
- player analysis
