# Agent Engine Phase 1: Offline Runner

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this phase task-by-task.

## Goal

先在离线环境把 `skills + local tools + action resolver + trace collector` 做完整，不接 realtime 房间。

## Files

- Create: `packages/agent-engine/src/types.ts`
- Create: `packages/agent-engine/src/openrouter-client.ts`
- Create: `packages/agent-engine/src/agent-tools.ts`
- Create: `packages/agent-engine/src/tool-runtime.ts`
- Create: `packages/agent-engine/src/skill-registry.ts`
- Create: `packages/agent-engine/src/skill-selector.ts`
- Create: `packages/agent-engine/src/skill-executor.ts`
- Create: `packages/agent-engine/src/action-resolver.ts`
- Create: `packages/agent-engine/src/trace-collector.ts`
- Create: `packages/agent-engine/src/agent-runner.ts`
- Create: `packages/agent-engine/src/prompt-templates/*.ts`
- Create: `packages/agent-engine/src/skills/*.ts`

## Scope

### 1. Skill-first 设计

核心 skills：

- `preflop_open`
- `preflop_iso`
- `preflop_vs_open`
- `preflop_vs_3bet`
- `short_stack_push_fold`
- `flop_cbet`
- `flop_defend`
- `flop_facing_bet`
- `turn_barrel`
- `turn_facing_bet`
- `river_value`
- `river_facing_bet`
- `river_bluff_catch`
- `pot_control`

`SkillDefinition`：

```ts
export interface SkillDefinition {
  id: AgentSkillId;
  label: string;
  description: string;
  priority: number;
  exclusive?: boolean;
  phases: BotDecisionPhase[];
  allowedTools: AgentToolName[];
  allowedIntents: ActionIntent[];
  allowedSizePresets: ActionSizePreset[];
  outputSchema: Record<string, unknown>;
  isApplicable: (ctx: BotDecisionContext) => boolean;
  buildInstruction: (ctx: BotDecisionContext) => string;
}
```

selector 规则：

- 先 deterministic filtering
- 命中 `exclusive` skill 时，只保留 exclusive candidates
- 否则按 `priority` 排序
- realtime 路径限制候选 skill 数量
- `short_stack_push_fold` 必须排他，避免标准 preflop 框架和 jam 框架混用

关键规则：

- `flop_defend` 只在 `canCheck` 时命中
- `*_facing_bet` 作为通用兜底
- `river_bluff_catch` 只在 `callAmount > potTotal * 0.5` 时加入候选
- `pot_control` 只在 turn/river、`canCheck`、`spr > 3`、`!isPreflopAggressor` 命中

### 2. Skill executor

`skill-selector.ts` 只负责候选筛选。  
`skill-executor.ts` 负责：

- 接收 `selectedSkill + context + persona + memory`
- 生成 skill-specific instruction
- 组装：
  - base system prompt
  - persona prompt
  - memory prompt
  - deterministic game context
  - selected skill instruction
  - skill-level allowed tools
  - strict output schema

接口：

```ts
export interface SkillExecutionInput {
  skill: SkillDefinition;
  context: BotDecisionContext;
  persona: AgentPersona;
  memoryPrompt: string;
  mode: 'realtime' | 'eval' | 'replay';
}

export interface SkillExecutionPrompt {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  responseFormat: CompletionRequest['response_format'];
}
```

### 3. Tool-call 设计

不做成 tool 的内容：

- hole cards
- board cards
- legal action window
- position
- stack / SPR / pot total
- betting state
- recent action summary
- recent memory summary

Phase 1 核心 local tools：

- `get_preflop_mix`
- `get_pot_odds`
- `get_required_equity`
- `analyze_postflop`
- `get_opponent_profile`

eval / replay only：

- `get_recent_history`
- `get_training_analysis`
- `get_heuristic_baseline`
- `get_trace_slice`

`AgentToolSpec`：

```ts
export interface AgentToolSpec {
  name: AgentToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  mode: 'realtime_and_eval' | 'eval_only' | 'replay_only';
  execute: (args: Record<string, unknown>, ctx: AgentToolExecutionContext) => Promise<unknown>;
}
```

### 4. 扑克动作设计

模型先输出 `AgentActionPlan`：

```ts
export interface AgentActionPlan {
  skillId: AgentSkillId;
  intent: ActionIntent;
  sizePreset?: ActionSizePreset;
  confidence: number;
  reasoning: {
    situation: string;
    analysis: string;
    decision: string;
    alternativeConsidered: string;
  };
}
```

resolver 负责：

- skill-level constraints
- preset sizing -> legal `raise_to`
- clamp to `[minRaiseTo, maxRaiseTo]`
- invalid output fallback

Phase 1 realtime 允许的 sizing presets：

- preflop: `open_2_2bb`, `open_2_5bb`, `open_3bb`, `iso_4bb_plus_1`, `three_bet_3x`, `three_bet_4x`, `jam`
- postflop: `bet_33`, `bet_50`, `bet_75`, `bet_100`, `raise_min`, `raise_2_5x`, `raise_3x`, `jam`

### 5. Agent runner

流程：

1. build prompt context
2. collect candidate skills
3. build memory prompt
4. build final prompt via `skill-executor`
5. first LLM call
6. optional one-round tool execution
7. parse `AgentActionPlan`
8. validate selected `skillId`
9. validate `intent` / `sizePreset`
10. resolve to legal engine action
11. emit `AgentDecisionResult`
12. record trace

### 6. Trace-first observability

每次决策都要产出 `AgentRunTrace`：

- `prompt_build`
- `skill_filter`
- `skill_selected`
- `llm_call`
- `tool_call`
- `action_resolution`
- `fallback`

## Tests

- skill candidate filtering
- facing-bet skill fallback coverage
- exclusive short-stack skill suppresses standard preflop skills
- generic fallback skills rank below street-specific skills
- strict schema parse
- one-round tool calling
- invalid skill rejection
- invalid `intent` / `sizePreset` rejected by skill constraints
- preset sizing resolves to legal `raise_to`
- fallback on invalid output
- trace spans are emitted

## Exit Criteria

- 离线输入 `BotDecisionContext` 能稳定产出 `AgentDecisionResult`
- 所有动作都经过 resolver 和 legality 防护
- tool-runtime 能按 mode 和 skill 白名单过滤工具
- trace 能完整覆盖一次决策流程

## Out Of Scope

- room queue 集成
- socket emit
- hand-end memory
- benchmark / player analysis
