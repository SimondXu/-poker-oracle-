# Game view slots (Card-Room Print)

The design system is documented in `apps/web/DESIGN.md` (tokens, rules, components) with a machine-readable sidecar in `apps/web/.impeccable/design.json`. This file covers the slot wiring and the code-level contract.

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

- One CSS grid (`GameView`): rows `48px | rest`; cols `md`: `56px rail | table column`, `xl` (≥1280): `+ 340px SidePanel` (the rail's panel button collapses it). `TopBar` spans all columns.
- The table column is a flex column: `[ConnectionBanner strip] [stage region, flex-1] [ActionBar dock]`. The action bar is the dock: full column width, below the stage, never over the felt. When the raise sizing row opens the dock grows upward and the stage shrinks. There is a single `ActionBar` instance, so keyboard handlers are never registered twice.
- The stage region is exactly the free space: `TableStage` fills it (`absolute inset-0` wrapper). There is no bottom reserve for the action bar or the hand result: the result banner lives in the dock (`ResultPresentationBar` in `action-bar/StatusPanels.tsx` mounts `HandResultBanner` as a 72px in-flow row), never over the felt.
- `fitTableStage(stageW, stageH)` in `lib/seat-layout.ts` fits a fixed-aspect box into the stage and picks one of three orientations: landscape 16:9 (em 1.45% of box width, max 20px), square 6:5 (1.9%, max 20px), portrait 3:5 (2.9%, max 16px, compact plate-only opponents). The box may stretch up to `MAX_ASPECT_STRETCH` 1.35 to fill the stage; a squarer orientation wins only when its em is 1.12x larger; stages narrower than `PORTRAIT_ONLY_MAX_WIDTH_PX` 560 are always portrait. The box font-size is the stage em (`--stage-em`); everything inside is sized in `em` and placed in percent of the box.
- Below `xl` the side panel is a sheet inside the stage region (bottom sheet below `md`, right drawer on `md`), so it ends where the dock starts. Below `md` the rail is hidden; `TopBar` carries the back, coach and panel buttons.
- Layout boxes (`data-layout-box="<name>"`): every element that must never overlap another carries one. Game screen: `top-bar`, `room-code`, `icon-rail`, `locale-toggle`, `panel-sheet`, `panel-sheet-button`, `coach-toggle`, `coach-hint`, `panel-tabs`, `side-panel`, `connection-banner`, `seat-plate`, `empty-seat`, `hole-cards`, `action-tag`, `hand-name`, `bet-chip`, `dealer`, `pot`, `board`, `action-bar`, `action-fold|call|raise`, `preset`, `raise-input`, `raise-slider`, `raise-cancel`, `result-banner`. Lobby: `home-form`, `home-hero`, `room-panel`, `room-table`, `room-seat`. Add a name to any new element that sits on the table or in the chrome.
- Overlap checker: a Playwright script (run against the dev server on :3000, per viewport, optionally with the raise sizing row open) collects every `data-layout-box` element and fails on any pair intersecting by more than 1px (nested boxes excepted), any box outside the viewport, and any box whose text overflows (`scrollWidth > clientWidth + 1`). The script is not committed to the repo yet; `lib/seat-layout.test.ts` is the in-repo guard for the stage geometry (2 to 10 seats, every orientation, aspects 9:16 to 21:9).

## Data seams

- `hooks/useTableViewModel.ts` returns `TableViewModel | null` (null before the first hand). It is built by `lib/table-view-model.ts`, which is pure and tested.
- `lib/seat-layout.ts` gives seat, bet and button positions in stage percent (pure, tested). Hero, or seat 0 when spectating, is at bottom center, with seats clockwise from there.
- Pot total has one source: `getHandPotTotal` in `lib/game-screen-state.ts` = `max(Σ pots, Σ handCommitted)`. It includes live street bets. The action bar's `pot` prop and `TableViewModel.pot.total` are the same number.
- Winner gating: the view model applies `shouldShowWinnerIdentity` / `shouldAnimatePotAward` itself, so pass raw store values.
- Pot medallion: `TableStage`'s `PotPill` renders `PotMedallion` (aria-live) with `t('table.pot.*')` labels.

## Foundation contract (Card-Room Print)

Direction: `.impeccable/surfaces/src-app-game-id-page-tsx.md`. Tokens live in `src/styles/globals.css` (`@theme static`).

### Tokens (Tailwind utilities `bg-*`, `text-*`, `border-*`, opacity modifiers work: `border-brass/35`)

- Ink ramp `ink-0` … `ink-10` (#0b1120 → #ece7db). Semantic aliases: `page` (ink-2), `panel` (ink-1), `panel-2` (ink-3), `line` (ink-3), `line-2` (ink-4), `text` (ink-10), `text-2` (ink-8), `text-3` (ink-7).
- Table: `felt`, `felt-deep`, `rail`. Loud ink: `vermilion` (to-act, raise, timer, all-in, error), `vermilion-hi` (vermilion text on navy, hover), `vermilion-ink` (vermilion text on ivory).
- Card stock (cards + seat plates only): `ivory`, `ivory-shade` (inner rule), `ivory-edge` (outer edge), `on-ivory`, `on-ivory-2` (text on ivory).
- `brass`: hairlines, dealer disc, winner rule, focus ring. Suits: `suit-spade`, `suit-heart`, `suit-diamond`, `suit-club`. States: `caution`, `positive`, `error`.
- Type scale (chrome and lobby; each `text-*` sets size and line-height, so put `leading-*` after it): `text-micro` 11, `text-body` 13, `text-lead` 15, `text-label` 18, `text-value` 22, `text-title` 28, `text-display` 44; exceptions `text-kbd` 10 and `text-input` 16. Table type in stage em with a px floor: `text-seat-micro` 0.62em, `seat-tag` 0.78, `seat-name` 0.82, `seat-amount` 0.92, `seat-stack` 1.12, `seat-pot` 1.56. Tracking: `tracking-caps` 0.16em, `tracking-caps-tight` 0.1em, `tracking-caps-wide` 0.24em (`caps` and `caps-tight` relax under `:lang(zh)`).
- Spacing (4px base, role names work as utilities: `p-gutter`, `gap-snug`): `hair` 2, `tight` 4, `snug` 8, `group` 12, `gutter` 16, `section` 24, `major` 32. The 32px step is `major`, not `block`: `block` collides with the `inline-block` utility family. Avoid half steps (1.5 / 2.5 / 3.5).
- tailwind-merge: `src/lib/utils.ts` builds `cn` with `extendTailwindMerge` and registers `theme.text` (all type steps incl. `seat-*`), `theme.tracking` (`caps*`) and `theme.spacing` (the seven roles). A new token must be added there too, or `cn('text-text-2', 'text-body')` drops the color class.
- Radii: `--radius-stamp` 2px, `--radius-control` 4px, `--radius-panel` 6px (`rounded-panel`), `--radius-card` 0.24em. Shadows: `shadow-card` (em-based), `shadow-plate`, `shadow-float` (popovers). Motion: `--duration-fast` 120ms, `--duration-normal` 180ms, `ease-out` = cubic-bezier(0.23, 1, 0.32, 1).
- Utilities: `font-index` (Barlow Condensed + tabular lining numerals; use for every number and label), `label-index` (index face, uppercase, tracked 0.16em, 600), `felt-guilloche` (felt gradient + engraved rosette), `medallion-frame` (brass double-rule inset frame; set `--medallion-ground` to the fill color), `card-back-print` (engraved card back). `font-sans` = Manrope for prose (CJK falls back to PingFang SC / Hiragino Sans GB / Noto Sans CJK SC / Microsoft YaHei).
- Keyframes: `table-deal-in`, `table-fade-in`, `table-timer-drain` (brass → vermilion at 75%), `thinking-dot`.

### Primitives (`@/components/poker`; em-sized, static, no framer-motion)

- `Card { card?, size?: 'xs'|'sm'|'md'|'lg'|'xl', faceDown?, highlight?, dim?, label?, className?, style? }`; box 2.5em × 3.5em of its own font-size. Sizes set that font-size relative to the parent: `xs` 0.5em, `sm` 0.625em, `md` 0.875em, `lg` 1.125em, `xl` 1.5em. `xs` and `sm` are index-only print (`xs` also drops the inner frame); `md`+ add the center pip, the court panel and the engraved back lattice. `CardRank { rank, small?, className? }` is the exported rank glyph (at small print the Q is an authored glyph so it never reads as 0).
- `Chip { tone?: 'brass'|'vermilion' }` 1em SVG; `ChipBubble { amount, tone?, label?, className? }` (chip 1.5em + amount).
- `DealerButton { label?, className? }`, `BlindTag { kind: 'SB'|'BB', label?, className? }` (inherits plate ink), `ActionTag { kind, label, className?, style? }` (stamp; raise / all_in are rotated -3deg via `rotate`, not `transform`).
- `PotMedallion { total, sidePots?: { label, amount }[], label, className?, style? }` (`POT_MEDALLION_EM` 10.5em × 4.4em of its own font-size, side-pot line included; the label uses `text-seat-micro`, so it holds the 11px floor).
- `SuitIcon { suit: 's'|'h'|'d'|'c' }`, `SUIT_COLOR_CLASS`, `isSuitKey`. Never render Unicode suit glyphs.

### i18n (`@/i18n`)

- `const t = useT(); t('table.pot.label'); t('actionbar.action.call', { amount: 120 })`. Keys are `<namespace>.<key>` and type-checked. Numbers in vars are locale-formatted; pass a string (e.g. `formatChips(x)`) to keep a custom format.
- Add keys in your own file only: `src/i18n/messages/{common,table,actionbar,panel,lobby}.ts`. Add to `en`, then to `zh` (typed `Translation<typeof en>`, so a missing or extra key fails typecheck; `translate.test.ts` also checks placeholder parity).
- `useLocale()`, `useFormatNumber()`, `useLocaleStore` (`locale`, `setLocale`, `toggleLocale`), `<LocaleToggle />` from `@/components/LocaleToggle`. `<LocaleSync />` in the root layout restores the saved locale and sets `<html lang>`.
