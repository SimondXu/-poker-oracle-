# Game view slots (table UI v2)

`app/game/[id]/page.tsx` wires auth + socket + `useGameScreenState` and renders `GameView`.
`GameView.tsx` owns the page layout only. It imports each slot from a fixed path and passes the props defined in `slots.ts`.
Replace a slot's implementation freely. If you need different props, change `slots.ts` and the `GameView` call together, additively where possible.

| Slot | File (export) | Directory | Props type (`slots.ts`) |
|---|---|---|---|
| Table stage | `table/TableStage.tsx` (`TableStage`) | `table/**` | `TableStageProps { viewModel: TableViewModel }` |
| Action bar | `action-bar/ActionBar.tsx` (`ActionBar`) | `action-bar/**` | `ActionBarProps` (hero stack/street bet read via `useHeroContext`) |
| Side panel | `side-panel/SidePanel.tsx` (`SidePanel`) | `side-panel/**` | `SidePanelProps` (reads `handResult` from the store) |
| Top bar | `TopBar.tsx` (`TopBar`) | — | `TopBarProps` |
| Icon rail | `IconRail.tsx` (`IconRail`) | — | `IconRailProps` (owns the `L` hotkey) |
| Hand result | `result/HandResultBanner.tsx` (`HandResultBanner`) | `result/**` | none (reads `handResult` from the store) |

`GameView` also renders `ConnectionBanner` as an overlay.

## Layout (GameView)

- `lg` (≥1024px): `IconRail` (56px) | column: `TopBar`, then the stage section | 320px `SidePanel` column (the rail's panel button collapses it).
- The action bar wrapper sits bottom-right over the stage on `md+` (`absolute bottom-3 right-3`, max 640px) and is fixed full-width to the bottom below `md`. There is a single `ActionBar` instance, so keyboard handlers are never registered twice.
- Below `lg`, the side panel opens as a sheet from the "记录 / 教练" button (bottom sheet below `md`, right drawer on `md`). Below `md`, the rail is hidden.
- Stage section fills the remaining space at all sizes. `TableStage` measures itself, keeps `ACTION_BAR_RESERVE_PX` free at the bottom for the action bar, picks the landscape (16:9) or portrait (3:5) seat tables from `lib/seat-layout.ts`, and scales its content through the box font-size. Everything inside is sized in `em`.

## Data seams

- `hooks/useTableViewModel.ts` returns `TableViewModel | null` (null before the first hand). It is built by `lib/table-view-model.ts`, which is pure and tested.
- `lib/seat-layout.ts` gives seat, bet and button positions in stage percent (pure, tested). Hero, or seat 0 when spectating, is at bottom center, with seats clockwise from there.
- Pot total has one source: `getHandPotTotal` in `lib/game-screen-state.ts` = `max(Σ pots, Σ handCommitted)`. It includes live street bets. The action bar's `pot` prop and `TableViewModel.pot.total` are the same number.
- Winner gating: the view model applies `shouldShowWinnerIdentity` / `shouldAnimatePotAward` itself, so pass raw store values.
- Primitives: `@/components/poker` (`Card`, `ChipBubble`, `DealerButton`, `BlindTag`, `ActionTag`). They are em-sized, static, and have no framer-motion. Shared keyframes in `globals.css`: `table-deal-in` (uses `--deal-dx`/`--deal-dy`), `table-fade-in`, and `table-timer-drain`.
