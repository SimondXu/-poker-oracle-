Original prompt: 我现在遇到一个问题就是我刚实验了打开两个浏览器 第一个浏览器创建了一个房间 然后的第二个浏览器尝试加入刚创建的房间的时候 会导致第一个浏览器创建房间的user不见了 应该是有逻辑错误 查看相关的代码和dev doc深度思考找到问题解决修复

2026-03-07
- Read debugging/TDD/develop-web-game skills and set a root-cause-first plan.
- Inspected room join/leave handlers, auth guest-session flow, room/game socket hooks, and architecture docs.
- Reproduced the bug with two sockets that share the same guest cookie: the second `room:join` reused the same `userId`, overwrote the existing room player snapshot, and a later disconnect from either socket could evict the player entirely.
- Added regression tests for same-guest multi-socket join/disconnect behavior and updated the room handler so a player can keep multiple sockets attached without losing seat/name/stack/ready state.
- Verification: `pnpm --filter @aipoker/server test -- --test-name-pattern "same guest"` ended up executing the full server test suite successfully (`68` passing), and `pnpm --filter @aipoker/server typecheck` passed.
- Updated the room page so once `roomState.isPlaying` becomes `true`, clients in the waiting room auto-navigate to `/game/:id`; the room owner still navigates immediately on successful `game:start`.
- Added a small web-side navigation helper test for the route decision.
- Verification: `node --experimental-strip-types --test apps/web/src/lib/room-navigation.test.ts` passed and `pnpm --filter @aipoker/web typecheck` passed.
- Investigated the table animation complaints with the required frontend/game testing workflow; found that the biggest remaining rough edges were mechanical hole-card dealing order and the end-of-hand footer competing visually with the showdown overlay.
- Added pure helpers/tests for seat deal order, second-pass hole-card delay, and result-phase timing in `apps/web/src/lib/table-animation.ts`.
- Updated the table to deal from the seat after the button using occupied-seat order instead of raw `seatIndex`, and to base the second card pass on active player count rather than max seats.
- Shortened the announcing phase and lengthened the reveal linger (`1200ms` to reveal, `3800ms` to done) so the pot transfer resolves sooner and the showdown/result emphasis has more screen time.
- Suppressed the next-hand/table-finished footer panels while the result overlay is active, replacing them with a neutral "正在播放结算动画" status pill to avoid abrupt stacked UI.
- Browser verification on the rebuilt production frontend (`http://127.0.0.1:3100` against backend `3101`) confirmed: opponents stay face-down at `announce-start`, flip during reveal, the footer no longer jumps straight to champion/next-hand UI during the overlay, and the overlay eventually dismisses before the footer panel appears.
- Verification: `node --experimental-strip-types --test apps/web/src/lib/table-animation.test.ts apps/web/src/lib/room-navigation.test.ts` passed, `pnpm --filter @aipoker/web typecheck` passed, `NEXT_PUBLIC_SERVER_URL=http://127.0.0.1:3101 pnpm --filter @aipoker/web build` passed, and live Playwright sampling on the rebuilt app matched the intended animation sequence.
- Follow-up fix for result leakage: traced the user-reported “牌还没开完就被 modal 告知输赢” issue to `WinnerAnnouncement` rendering during `handResult.phase === 'announcing'`, with additional early leakage from winner badges, pot-award animation, and winner stacks.
- Added regression coverage for phase-gated result presentation and temporary announcing-stack masking in `apps/web/src/lib/table-animation.test.ts`.
- Updated the game page/table to keep `announcing` neutral: no winner modal, no winner badges/highlights, no pot-award animation, and no awarded chips added to seat stacks until `showing`.
- Browser verification on the rebuilt frontend confirmed `announce-start` now shows only the neutral “正在播放结算动画” state with unrevealed winners and pre-award stacks, while `showing` is the first point where the modal and final winner stack appear.
