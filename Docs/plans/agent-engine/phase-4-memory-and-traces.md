# Agent Engine Phase 4: Memory And Traces

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this phase task-by-task.

## Goal

完成 hand-end memory 更新、trace export 和 decision recording。

## Files

- Create: `packages/agent-engine/src/agent-memory.ts`
- Create: `packages/agent-engine/src/agent-chat.ts`
- Modify: `apps/server/src/ws/handlers/game-events.ts`
- Create: `packages/agent-engine/src/eval/eval-types.ts`
- Create: `packages/agent-engine/src/eval/decision-recorder.ts`

## Scope

### 1. Memory lifecycle

- 不在 `runAgentDecision()` 尾部更新
- 统一挂到 hand-end pipeline
- `MEMORY_WINDOW = 20`
- 最近 5 手详细，其余一行摘要
- MVP 先 deterministic summary，再异步 LLM compression

### 2. Chat lifecycle

chat 只在 hand-end 已知事件上触发，例如：

- `big_pot`
- `all_in_called`
- `bluff_caught`
- `bad_beat`
- `hero_fold`
- `showdown_win`

### 3. Trace export

trace export 需要稳定 JSON schema，支持：

- replay 单个决策
- 比较 promptVersion
- 统计 latency / tokens / cost

### 4. Decision recorder

```ts
export interface DecisionRecord {
  handId: string;
  handNumber: number;
  actorId: string;
  actorType: 'llm' | 'rule' | 'human';
  model?: AgentModel;
  promptVersion?: string;
  skillId?: AgentSkillId;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  gameContext: BotDecisionContext;
  decision: AgentDecision;
  heuristicBaseline?: AgentActionOutput;
  baselineDelta?: number;
  traceId?: string;
  timestamp: number;
}
```

## Tests

- memory updates once per hand
- room delete clears sessions and pending jobs
- trace export JSON schema stable
- decision recorder accepts human + rule + llm actor types

## Exit Criteria

- memory 只在 hand-end 更新
- trace export 格式稳定
- recorder 能作为 benchmark / player analysis 数据源

## Out Of Scope

- experiment runner
- judge scoring
- dashboard
