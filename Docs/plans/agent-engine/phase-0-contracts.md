# Agent Engine Phase 0: Contracts

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this phase task-by-task.

## Goal

先把 shared/server 的最小合同定死，不扩散到 UI 行为和 memory/eval 逻辑。

## Scope

- `BotConfig` 改成 discriminated union
- `BotDecisionContext` 扩展到支持 skill runtime 和 action sizing
- 新 realtime socket event types
- OpenRouter / LLM runtime 配置入口

## Files

- Modify: `packages/shared/src/index.ts`
- Modify: `apps/server/src/rooms/types.ts`
- Modify: `apps/server/src/ws/schemas.ts`
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/game-loop/bot-support.ts`

## Deliverables

### 1. BotConfig

```ts
export type AgentModel = 'claude' | 'gpt' | 'gemini' | 'grok' | 'minimax';
export type AgentPersonaId = 'analyst' | 'bully' | 'chaos' | 'nit' | 'showman';

export type BotConfig =
  | { kind: 'rule'; personality: BotPersonality }
  | { kind: 'llm'; model: AgentModel; personaId: AgentPersonaId };
```

`RuntimePlayer` 统一收敛为：

```ts
export interface RuntimePlayer {
  id: string;
  name: string;
  seatIndex: number;
  stack: number;
  isBot: boolean;
  botConfig?: BotConfig;
}
```

### 2. BotDecisionContext 扩展

```ts
export interface BotDecisionContext {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;

  phase: BotDecisionPhase;
  potTotal: number;
  myStack: number;
  myStreetCommitted: number;
  currentBetToMatch: number;
  lastFullRaiseSize: number;
  bigBlind: number;
  smallBlind: number;
  preflopLimpersCount: number;
  streetActionCount: number;

  holeCards: Card[];
  communityCards: Card[];
  activePlayerCount: number;
  opponentCount: number;
  position: BotPosition;
  effectiveStack: number;
  effectiveStackBb: number;
  spr: number;
  bettingState: BotBettingState;
  isPreflopAggressor: boolean;
  isLastStreetAggressor: boolean;
}
```

新增字段目的：

- `bigBlind` / `smallBlind`：解析 preflop sizing presets
- `preflopLimpersCount`：解析 iso-raise preset
- `myStreetCommitted` / `currentBetToMatch`：映射 facing bet / raise 的 `raise_to`
- `lastFullRaiseSize`：计算最小合法 re-raise
- `streetActionCount`：帮助 skill preconditions

### 3. Socket events

新增 shared 事件：

- `game:bot_status`
- `game:bot_reasoning`
- `table:chat`

可见性：

- `bot_status`: 全桌可见
- `table:chat`: 全桌可见
- `bot_reasoning`: 默认 `table_after_hand`

### 4. 配置入口

新增 env：

- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_HTTP_REFERER`
- `OPENROUTER_APP_TITLE`
- `LLM_AGENT_ENABLED`
- `LLM_AGENT_REALTIME_TARGET_MS`
- `LLM_AGENT_REALTIME_TIMEOUT_MS`
- `LLM_AGENT_EVAL_TIMEOUT_MS`
- `LLM_AGENT_MAX_TOOL_ROUNDS_REALTIME`
- `LLM_AGENT_MAX_TOOL_ROUNDS_EVAL`
- `LLM_AGENT_MAX_PROMPT_TOKENS`
- `LLM_AGENT_MAX_COMPLETION_TOKENS`
- `LLM_AGENT_ROOM_COST_LIMIT_USD`

## Tests

- shared type tests
- `buildBotDecisionContext` 新字段单测
- server config parse tests
- 现有 `bot-support.test.ts` 全量回归通过

## Exit Criteria

- shared/server 类型可以表达 rule bot 和 llm bot
- `buildBotDecisionContext()` 能输出 resolver 和 skill precondition 所需字段
- server config 能稳定解析 LLM runtime env
- 没有 UI / eval / memory 改动混进这一阶段

## Out Of Scope

- `packages/agent-engine` 实现
- realtime queue 改造
- UI reasoning/chat 面板
- memory、trace export、benchmark
