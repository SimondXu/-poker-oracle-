# Agent Engine Tracking

## Overall Status

- Phase 0: todo
- Phase 1: todo
- Phase 2: todo
- Phase 3: todo
- Phase 4: todo
- Phase 5: todo

## Phase Checklist

### Phase 0

- [ ] `BotConfig` discriminated union added to shared types
- [ ] `BotDecisionContext` expanded
- [ ] new socket event types added
- [ ] LLM env parsing added
- [ ] regression coverage for existing bot-support behavior

### Phase 1

- [ ] `packages/agent-engine` scaffolded
- [ ] OpenRouter client implemented
- [ ] skill registry / selector / executor implemented
- [ ] local tool registry + runtime implemented
- [ ] action resolver implemented
- [ ] offline runner implemented
- [ ] trace collector implemented
- [ ] offline tests passing

### Phase 2

- [ ] turn coordinator implemented
- [ ] realtime integration wired into server game loop
- [ ] stale-turn protection verified
- [ ] timeout fallback verified
- [ ] `game:bot_status` event flow verified

### Phase 3

- [ ] reasoning event contract finalized
- [ ] table chat event flow added
- [ ] room bot selector supports `rule` and `llm`
- [ ] reasoning visibility rules enforced

### Phase 4

- [ ] hand-end memory reducer implemented
- [ ] chat lifecycle hooked to observed events only
- [ ] trace export schema stabilized
- [ ] decision recorder supports human/rule/llm actors

### Phase 5

- [ ] benchmark runner implemented
- [ ] experiment runner implemented
- [ ] baseline comparator implemented
- [ ] llm judge implemented
- [ ] player analysis implemented
- [ ] report generation implemented

## Dependencies

- Phase 1 depends on Phase 0 contracts
- Phase 2 depends on Phase 1 offline runner
- Phase 3 depends on Phase 2 socket/runtime flow
- Phase 4 depends on Phase 2 turn lifecycle
- Phase 5 depends on Phase 1 trace and Phase 4 recorder data

## Notes

- Keep `decisions.md` stable; update only when architectural boundaries change.
- Keep phase docs focused on scope, files, tests, and exit criteria.
- Use this file for execution status instead of appending progress notes into phase docs.
