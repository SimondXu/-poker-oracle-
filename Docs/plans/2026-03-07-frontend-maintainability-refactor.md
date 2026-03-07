# Frontend Maintainability Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the room and game frontend flows so route files stay thin, socket hooks have clearer responsibilities, and room/game code is organized by feature instead of being spread across large pages and flat utility buckets.

**Architecture:** Keep the existing behavior and store model intact, but split each route into route-local `_components` plus small feature helpers. For the game flow, separate socket transport from presentation mapping and next-hand control so the page composes smaller units instead of depending on a god hook.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zustand, Socket.IO client, node:test

### Task 1: Lock behavior with failing tests for extracted helpers

**Files:**
- Modify: `apps/web/src/hooks/room-socket-state.test.ts`
- Create: `apps/web/src/app/game/[id]/_lib/game-screen-state.test.ts`
- Create: `apps/web/src/hooks/game-socket-controller.test.ts`

**Step 1: Write the failing tests**

- Extend the room socket state tests so they describe the desired reset and ready-derivation behavior after extraction.
- Add a game screen state test that covers derived booleans such as `isMyTurn`, `isEliminatedPendingChoice`, `shouldRevealOutcome`, and `pot`.
- Add a game socket controller test that covers hand-result payout mapping and next-hand start guard behavior.

**Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test apps/web/src/hooks/room-socket-state.test.ts apps/web/src/app/game/[id]/_lib/game-screen-state.test.ts apps/web/src/hooks/game-socket-controller.test.ts`

Expected: FAIL because the new helper modules do not exist yet or the new behaviors are not exported.

### Task 2: Extract room route structure

**Files:**
- Modify: `apps/web/src/app/room/[id]/page.tsx`
- Create: `apps/web/src/app/room/[id]/_components/SeatCard.tsx`
- Create: `apps/web/src/app/room/[id]/_components/RoomStatusCard.tsx`
- Create: `apps/web/src/app/room/[id]/_components/RoomControlsCard.tsx`
- Create: `apps/web/src/app/room/[id]/_components/Stat.tsx`
- Create: `apps/web/src/app/room/[id]/_lib/room-page-state.ts`
- Modify: `apps/web/src/hooks/useRoomSocket.ts`

**Step 1: Write the failing tests**

- Add or extend tests for the room page state helper so `canStart`, `allHumansReady`, `canSelfStart`, and `activeStackPlayerCount` are derived outside the page component.

**Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test apps/web/src/app/room/[id]/_lib/room-page-state.test.ts`

Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

- Extract route-local display components from `page.tsx`.
- Move room-derived booleans into `room-page-state.ts`.
- Replace string array class joins with `cn(...)` inside the extracted components.
- Keep `page.tsx` focused on routing, auth guard, and composition.

**Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test apps/web/src/hooks/room-socket-state.test.ts apps/web/src/app/room/[id]/_lib/room-page-state.test.ts`

Expected: PASS

### Task 3: Extract game screen state and route-local components

**Files:**
- Modify: `apps/web/src/app/game/[id]/page.tsx`
- Create: `apps/web/src/app/game/[id]/_components/ConnectionBanner.tsx`
- Create: `apps/web/src/app/game/[id]/_components/GameHeader.tsx`
- Create: `apps/web/src/app/game/[id]/_components/GameFooter.tsx`
- Create: `apps/web/src/app/game/[id]/_lib/game-screen-state.ts`

**Step 1: Write the failing tests**

- Add tests for the game screen state helper that cover the footer-state derivation and pot calculation.

**Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test apps/web/src/app/game/[id]/_lib/game-screen-state.test.ts`

Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

- Move header/banner/footer presentation into route-local components.
- Move the game screen derived flags into `game-screen-state.ts`.
- Reduce `page.tsx` to route guard, hook composition, and view-model wiring.

**Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test apps/web/src/app/game/[id]/_lib/game-screen-state.test.ts`

Expected: PASS

### Task 4: Break up the game socket god hook

**Files:**
- Modify: `apps/web/src/hooks/useSocket.ts`
- Create: `apps/web/src/hooks/game-socket-controller.ts`
- Create: `apps/web/src/hooks/game-result-mapper.ts`

**Step 1: Write the failing tests**

- Add a controller test for payout mapping and next-hand guard behavior.

**Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test apps/web/src/hooks/game-socket-controller.test.ts`

Expected: FAIL because the controller module does not exist yet.

**Step 3: Write minimal implementation**

- Keep `useSocket` as the public route hook, but delegate payout mapping and next-hand start policy to extracted helpers.
- Leave socket wire-up in the hook, move pure logic and timer policy into testable modules.

**Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test apps/web/src/hooks/game-socket-controller.test.ts`

Expected: PASS

### Task 5: Verify and re-review

**Files:**
- Review: `apps/web/src/app/room/[id]/page.tsx`
- Review: `apps/web/src/app/game/[id]/page.tsx`
- Review: `apps/web/src/hooks/useRoomSocket.ts`
- Review: `apps/web/src/hooks/useSocket.ts`
- Review: `apps/web/src/app/room/[id]/_components/*`
- Review: `apps/web/src/app/game/[id]/_components/*`

**Step 1: Run targeted verification**

Run: `node --experimental-strip-types --test apps/web/src/hooks/room-socket-state.test.ts apps/web/src/app/room/[id]/_lib/room-page-state.test.ts apps/web/src/app/game/[id]/_lib/game-screen-state.test.ts apps/web/src/hooks/game-socket-controller.test.ts apps/web/src/lib/socket-url.test.ts`

Expected: PASS

**Step 2: Run broader verification**

Run: `pnpm --filter @aipoker/web typecheck`

Expected: PASS

**Step 3: Re-review maintainability**

- Check page file length and responsibilities.
- Check whether route-local components are colocated.
- Check whether `useSocket` and `useRoomSocket` still mix transport and presentation policy.
- Check whether room/game-specific modules still live in flat `src/lib` without need.
