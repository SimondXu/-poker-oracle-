# Free Mode Lobby Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a no-login, no-database MVP flow where users either create a room with username or join an existing room with username + room code.

**Architecture:** Keep server as single-process in-memory room runtime. Use guest session cookie for stable user identity. Enforce explicit room create/join semantics and room-local unique names.

**Tech Stack:** Next.js 15, Socket.io, Fastify, TypeScript, Zustand, node:test

### Task 1: Lock socket semantics and tests

**Files:**
- Modify: `apps/server/src/ws/handlers/room-events.ts`
- Modify: `apps/server/src/ws/schemas.ts`
- Test: `apps/server/src/tests/integration/realtime/realtime.test.ts`
- Test: `apps/server/src/tests/integration/realtime/room-switch.test.ts`

1. Add/verify failing tests for `room_not_found`, `room_already_exists`, and `player_name_taken`.
2. Implement strict `room:create` and `room:join` behavior.
3. Verify late-join behavior remains spectator-only during active hand.
4. Run: `pnpm --filter @aipoker/server test -- --test-name-pattern "room:join|room:create|room-switch"`.

### Task 2: Implement dual-entry lobby UI

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/lib/room-code.ts`
- Create: `apps/web/src/lib/room-errors.ts`

1. Build two primary entry cards: create and join.
2. Add room code generation + normalization + validation.
3. Route to waiting room with explicit intent query.

### Task 3: Wire waiting room intent flow

**Files:**
- Modify: `apps/web/src/hooks/useRoomSocket.ts`
- Modify: `apps/web/src/app/room/[id]/page.tsx`
- Modify: `apps/web/src/app/game/[id]/page.tsx`

1. Add `intent: create|join` behavior in room socket hook.
2. For create intent, perform `room:create` then `room:join`.
3. For join intent, perform `room:join` only.
4. On join/create fatal errors (`room_not_found`, `player_name_taken`, etc.), show message and return home.
5. Remove legacy direct jump to random room from game page.

### Task 4: Sync documentation to MVP reality

**Files:**
- Modify: `docs/process/PRD.md`
- Modify: `docs/process/sprint-plan.md`
- Modify: `docs/game-design/ui-spec.md`
- Modify: `docs/architecture/data-models.md`
- Modify: `README.md`

1. Remove replay/login/database as MVP requirements.
2. Document strict create/join semantics and same-room name uniqueness.
3. Keep replay/stats/account system in Phase 2+ section.

### Task 5: Verify end-to-end quality gate

**Files:**
- N/A (verification)

1. Run: `pnpm --filter @aipoker/server test`.
2. Run: `pnpm test`.
3. Run: `pnpm typecheck`.
4. Report remaining risk (if any) with concrete next mitigation.
