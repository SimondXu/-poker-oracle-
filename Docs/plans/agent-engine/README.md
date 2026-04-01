# Agent Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 把 AiPoker 从“接了几个模型的扑克 demo”升级成一个可展示 `skill-driven agent runtime + tool use + observability + eval loop` 的 2026 agent engineering portfolio 项目。

**Architecture:** 采用 `skill-first, local-tools-first` 架构。实时房间路径绝不阻塞房间队列；LLM 不直接输出最终芯片金额，也不把扑克动作建模成 tool call。相反，agent 先在候选技能中选择 skill，再输出抽象 `ActionPlan`，最后由程序侧 `action-resolver` 映射成合法的 `fold/check/call/raise_to/all_in`。所有 agent run 记录结构化 trace，用于回放、A/B 实验、回归检测和 benchmark。

**Tech Stack:** TypeScript, Node 22, pnpm/turbo monorepo, socket.io, `@aipoker/game-engine`, `@aipoker/strategy-engine`, `@aipoker/shared`, OpenRouter Chat Completions API.

---

## 项目定位

这个项目的主叙事不再是 “AI 扑克 bot”，而是：

> AiPoker is a constrained multi-agent benchmark environment for skill-driven agents, structured tool use, replayable traces, and eval-driven optimization.

扑克桌只是环境，真正展示的是：

- agent runtime
- skill abstraction
- typed tool execution
- realtime orchestration
- trace tree
- experiment runner
- benchmark / eval pipeline

## 文档结构

- [decisions.md](./decisions.md)
  - 架构边界、非目标、tradeoff、关键设计决策
- [phase-0-contracts.md](./phase-0-contracts.md)
  - shared/server 合同、类型扩展、socket events、配置
- [phase-1-offline-runner.md](./phase-1-offline-runner.md)
  - `agent-engine` package、skills、tools、action resolver、offline runner
- [phase-2-realtime-runtime.md](./phase-2-realtime-runtime.md)
  - realtime 协调、turn token、timeout、stale-state 防护
- [phase-3-ui-and-reasoning.md](./phase-3-ui-and-reasoning.md)
  - reasoning/chat 事件、前端展示、可见性
- [phase-4-memory-and-traces.md](./phase-4-memory-and-traces.md)
  - hand-end memory、trace export、decision recorder
- [phase-5-eval-and-experiments.md](./phase-5-eval-and-experiments.md)
  - benchmark、experiment runner、judge、player analysis
- [tracking.md](./tracking.md)
  - 当前状态、checklist、依赖、验收进度

## 阅读顺序

1. 先读 [decisions.md](./decisions.md)
2. 再读 [phase-0-contracts.md](./phase-0-contracts.md) 和 [phase-1-offline-runner.md](./phase-1-offline-runner.md)
3. 确认实时集成路径后再看 [phase-2-realtime-runtime.md](./phase-2-realtime-runtime.md)
4. UI、memory、eval 作为后续扩展分别看 Phase 3-5

## 新 package 结构

```text
packages/agent-engine/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types.ts
    ├── openrouter-client.ts
    ├── agent-registry.ts
    ├── agent-runner.ts
    ├── agent-turn-coordinator.ts
    ├── agent-tools.ts
    ├── tool-runtime.ts
    ├── skill-registry.ts
    ├── skill-selector.ts
    ├── skill-executor.ts
    ├── action-resolver.ts
    ├── trace-collector.ts
    ├── agent-memory.ts
    ├── agent-chat.ts
    ├── prompt-templates/
    ├── skills/
    ├── eval/
    └── cache/
```

## 全局验收标准

- realtime 房间不会因为 LLM 请求而阻塞房间队列
- skill selection、tool use、action resolution、fallback 全部可追踪
- 动作执行严格经过 skill-level constraints 和 engine legality 校验
- memory 和 chat 挂在 hand-end lifecycle，不污染 realtime 决策路径
- benchmark / experiment runner 能比较模型、promptVersion、persona，并导出结构化结果

## 当前实施顺序

1. Phase 0: 协议与上下文合同
2. Phase 1: Skill Runtime + Local Tools + Offline Runner
3. Phase 2: Realtime Turn Coordinator
4. Phase 3: Reasoning + Chat + UI
5. Phase 4: Memory + Hand-end Hooks + Trace Export
6. Phase 5: Benchmark + Experiment Runner + Player Analysis
