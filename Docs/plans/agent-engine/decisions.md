# Agent Engine Architectural Decisions

## 1. 非目标

- 不做通用 remote protocol 平台，本计划不引入 MCP。
- 不做完整 durable workflow / time-travel 系统，先做 replayable trace 和 deterministic re-run。
- 不把 `fold/check/call/raise` 设计成 tools。
- 不在多人公平对局中实时公开完整 reasoning。

## 2. 为什么不用 MCP

- 这个项目的主路径是实时扑克决策，要求低延迟、强类型、强约束、强公平性。
- 本地 typed tools 比 remote protocol 更简单、更快、更可控。
- `skills` 在这里比 MCP 更重要，因为本项目要展示的是 agent behavior abstraction，不是外部工具互操作。

采用：

- `skills` = 一等公民行为层
- `local tools` = 一等公民分析层
- `no MCP` = 明确设计决策，不是遗漏

## 3. Realtime 房间绝不等待长时 LLM

当前房间事件通过单队列串行推进：

- `apps/server/src/rooms/room-queue.ts`
- `apps/server/src/ws/handlers/game-events.ts`
- `apps/server/src/game-loop/run-bot-turns.ts`

因此：

- 不允许在房间队列中直接 `await` OpenRouter 请求
- 必须新增 `RoomAgentTurnCoordinator`
- 房间队列只负责创建 `turnToken`、发出 `thinking` 状态、启动异步 job、退出当前任务
- job 完成后重新进入房间队列，并执行 stale-state 校验

## 4. Realtime 和 Eval 必须是两套 budget

```ts
LLM_AGENT_REALTIME_TARGET_MS = 5000;
LLM_AGENT_REALTIME_TIMEOUT_MS = 8000;
LLM_AGENT_MAX_TOOL_ROUNDS_REALTIME = 1;

LLM_AGENT_EVAL_TIMEOUT_MS = 45000;
LLM_AGENT_MAX_TOOL_ROUNDS_EVAL = 3;
```

约束：

- realtime 路径优先吃 prompt 中的 deterministic features
- realtime 最多允许 1 轮 tool calling
- eval / replay / benchmark 才允许更深的 tool use

## 5. Skill 是主逻辑抽象，persona 只是风格层

- `skill` 决定当前 spot 应该采用哪种决策框架
- `persona` 只影响语气、偏好、chat 风格、细微倾向

这意味着：

- `persona` 不是核心逻辑单位
- `skill` 才是 runtime 的第一层抽象

## 6. 扑克动作不是 tool call

边界：

- `tool` 负责分析
- `skill` 负责组织策略
- `ActionPlan` 负责表达抽象动作意图
- `action-resolver` 负责把抽象动作转成合法 engine action

模型不会调用：

- `fold()`
- `check()`
- `call()`
- `raise_to()`

这些都不是 tools，而是最终结构化输出的一部分。

## 7. Memory 直接进 prompt，不做 realtime tool

以下内容必须直接进 prompt 或由程序侧提供，不能做成 tool：

- hole cards
- board cards
- legal action window
- position
- stack / SPR / pot total
- betting state
- recent action summary
- recent memory summary

原因：

- 都是 cheap deterministic features
- 做成 tool 只会增加 latency 和失败面
- memory 是 agent 的长期上下文，不是 realtime on-demand 查询

## 8. Tool 信息边界

禁止出现以下 tool：

- `peek_hidden_cards`
- `peek_remaining_deck`
- `peek_future_runout`
- `execute_action`

禁止把未知对手手牌、未来公共牌、牌堆状态暴露给模型。

## 9. Baseline 不是 GTO

report 里必须明确：

- baseline = `@aipoker/strategy-engine` 的 TAG heuristic output
- baseline 不是 solver
- 命名统一为 `heuristicBaseline` / `baselineAgreement` / `avgBaselineDelta`

## 10. Trace-first，而不是只记录最终结果

每次决策都必须产出结构化 trace：

- prompt build
- skill filtering
- skill selection
- llm calls
- tool calls
- action resolution
- fallback

这样才能支撑：

- replay
- regression detection
- promptVersion A/B
- latency / cost profiling
