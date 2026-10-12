# Agent Engine Phase 2: Realtime Runtime

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this phase task-by-task.

## Goal

LLM bot 可以实时行动，但不阻塞房间队列。

## Files

- Create: `packages/agent-engine/src/agent-turn-coordinator.ts`
- Modify: `apps/server/src/game-loop/run-bot-turns.ts`
- Modify: `apps/server/src/ws/handlers/game-events.ts`
- Modify: `apps/server/src/ws/emitters.ts`

## Scope

### 1. RoomAgentTurnCoordinator

职责：

- 接收 realtime turn 请求
- 生成 `turnToken`
- 启动异步 agent job
- 记录 pending job 和 timeout
- job 完成后重新 enqueue room task
- stale-state / stale-turn 校验

### 2. Realtime budget

```ts
LLM_AGENT_REALTIME_TARGET_MS = 5000;
LLM_AGENT_REALTIME_TIMEOUT_MS = 8000;
LLM_AGENT_MAX_TOOL_ROUNDS_REALTIME = 1;
```

约束：

- 不能在房间队列里直接 await LLM
- 超时 realtime 直接 fallback：`check` if legal else `fold`
- stale result 不允许落地

### 3. Socket emit contract

realtime 只保证：

- `game:bot_status` = `thinking`
- `game:bot_status` = `acted`
- `game:bot_status` = `error`

Phase 2 不引入 reasoning/chat UI，只保证状态流正确。

### 4. Failure taxonomy

需要稳定区分：

- `timeout`
- `tool_error`
- `invalid_output`
- `stale_turn`

所有失败都必须有统一 fallback path。

## Tests

- room queue continues after async agent start
- stale turn discarded
- timeout falls back to check/fold
- `game:bot_status` thinking/acted/error 顺序正确
- pending job 在 room cleanup 时被清理

## Exit Criteria

- realtime LLM bot 不会冻结房间推进
- stale-state 结果不会被错误执行
- timeout / invalid output 都有稳定 fallback
- room 状态和 socket 事件顺序可预测

## Out Of Scope

- reasoning 面板
- table chat
- memory 更新
- benchmark / experiment
