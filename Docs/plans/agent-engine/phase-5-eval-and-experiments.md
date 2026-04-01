# Agent Engine Phase 5: Eval And Experiments

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this phase task-by-task.

## Goal

把项目从“能跑”提升到“能证明优化和评估能力”。

## Files

- Create: `packages/agent-engine/src/eval/benchmark-runner.ts`
- Create: `packages/agent-engine/src/eval/experiment-runner.ts`
- Create: `packages/agent-engine/src/eval/llm-judge.ts`
- Create: `packages/agent-engine/src/eval/baseline-comparator.ts`
- Create: `packages/agent-engine/src/eval/report-generator.ts`
- Create: `apps/server/src/features/player-analysis.ts`

## Scope

### 1. Baseline 命名

统一使用：

- `heuristicBaseline`
- `baselineAgreement`
- `avgBaselineDelta`

并明确：

- baseline = `@aipoker/strategy-engine` TAG heuristic
- baseline 不是 GTO solver

### 2. Experiment runner

```ts
export interface GameScenario {
  id: string;
  description: string;
  actorId: string;
  roomSnapshot: {
    players: Array<{
      id: string;
      seatIndex: number;
      stack: number;
      isBot: boolean;
      botConfig?: BotConfig;
    }>;
    handNumber: number;
    buttonMarkerSeat: number;
    blinds: { smallBlind: number; bigBlind: number };
    phase: BotDecisionPhase;
    potTotal: number;
    communityCards: Card[];
    currentActorSeat: number;
    actionLog: Array<{
      playerId: string;
      type: 'fold' | 'check' | 'call' | 'raise_to' | 'all_in';
      amount?: number;
      toAmount?: number;
    }>;
    holeCardsByPlayer: Record<string, Card[]>;
  };
  forcedDeck?: Card[];
  tags?: string[];
}
```

```ts
export interface ExperimentConfig {
  name: string;
  variants: Array<{
    id: string;
    model: AgentModel;
    personaId: AgentPersonaId;
    promptVersion: string;
    temperature: number;
  }>;
  scenarios: GameScenario[];
  handsPerVariant: number;
}
```

目的：

- 对同一批固定场景比较 promptVersion / persona / model
- 做 controlled A/B，而不是凭直觉调 prompt

### 3. Benchmark + judge

- benchmark respects concurrency and budget caps
- judge 只作为异步补充评分，不进入 realtime 主路径
- report 输出成本、胜率、baselineAgreement、reasoning quality

### 4. 轻量 adversarial eval

不做完整 red-team 平台，但 benchmark 里加入：

- weird sizing spots
- misleading opponent history
- bluff-heavy table
- short-stack jam pressure
- high-SPR postflop draw spots

### 5. Player analysis

`player-analysis.ts` 要支持：

- human + rule + llm records
- style label
- strengths / leaks / summary / recommendations

## Tests

- benchmark respects concurrency and budget caps
- experiment runner compares fixed scenarios fairly
- player analysis can include human + bot records

## Exit Criteria

- benchmark / experiment 能稳定输出结构化 report
- promptVersion / model / persona 可做 controlled 对比
- player analysis 建立在 recorder 数据源之上，而不是临时拼接

## Out Of Scope

- 通用研究平台
- 外部 protocol integration
