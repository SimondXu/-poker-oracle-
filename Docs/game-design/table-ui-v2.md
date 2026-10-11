# Table UI v2 — PokerNow-style redesign

Status: in progress (branch `feat/pokernow-ui`). Supersedes the visual parts of `ui-spec.md` §2 once merged.

## Goal

Replace the current "Private Room" look (navy + gold glow, wood rail, glassmorphism, seats as floating cards) with a flat, legible, professional online-poker table in the style of PokerNow. Information density and readability first; decoration last.

Reference observed from public pokernow.com marketing screenshots (2026-10-11), design language only — no logos, names or assets copied:

- Page: dark charcoal, nearly flat (`#1c1d21`–`#26272b`). Thin left icon rail, small blinds/game label top-right.
- Table: one flat saturated green oval (`#2f8f46`-ish), thick dark-grey rail (`#3a3c41`), no wood, no gradient beyond a very subtle radial lighten in the middle. Faint watermark text in the center is optional.
- Pot: dark translucent pill above the board with the number only.
- Board cards: large, white, flat. Huge rank on top, huge suit glyph under it. 4-color deck (♠ black, ♥ red, ♦ blue, ♣ green).
- Seats: hole cards peek out above a light name plate (name on top, stack under it). Card backs are flat salmon/red. Folded seats dim.
- Bets: yellow round "chip bubble" with the amount, placed between the seat and the pot (toward table center).
- Dealer button: small white circle "D" next to the seat, toward the center.
- Last action: small white pill ("check", "call 40", "raise 120") near the seat, fades out at the next street.
- Animation: minimal and quick (≤200ms slides/fades). No glows, springs, or shimmer.

## Design tokens (replace `@theme` in `apps/web/src/styles/globals.css`)

| token | value | use |
|---|---|---|
| `--color-page` | `#1d1e22` | page background |
| `--color-panel` | `#26282d` | side panel, top bar, action bar |
| `--color-panel-2` | `#30333a` | inputs, hover, tabs |
| `--color-line` | `#3a3d44` | 1px borders |
| `--color-rail` | `#3a3c41` | table rail |
| `--color-felt` | `#2f8f46` | table felt (configurable later) |
| `--color-felt-hi` | `#37a051` | felt center lighten |
| `--color-plate` | `#f3f4f6` | seat name plate |
| `--color-plate-text` | `#1d1e22` | text on plate |
| `--color-chip` | `#f2d94e` | bet bubble |
| `--color-card` | `#ffffff` | card face |
| `--color-card-back` | `#e0645c` | card back |
| `--color-suit-s` / `-h` / `-d` / `-c` | `#1d1e22` / `#d63c3c` / `#2f6fd6` / `#2a8f3e` | 4-color deck |
| `--color-text` / `-2` / `-3` | `#eceef1` / `#a9adb6` / `#6f747e` | text tiers |
| `--color-accent` | `#2f8f46` | primary CTA (green) |
| `--color-fold` / `--color-call` / `--color-raise` | `#c94a4a` / `#2f6fd6` / `#2f8f46` | action buttons, last-action color tags |
| `--color-timer` | `#f2d94e` → `#c94a4a` under 25% | turn timer |

Font: keep the existing sans (Manrope) and use `tabular-nums` for every number. Radii: 6px panels/buttons, 8px cards, full for chips/pills. No `backdrop-blur`, no glow shadows; one soft shadow on cards and the plate only.

## Layout (desktop ≥1024px)

```
┌─┬──────────────────────────────────────────────┬──────────────┐
│ │ top bar: room code · NLH 10/20 · hand #12     │ side panel   │
│i│                                               │ [Log][Coach] │
│c│          seats around a flat green oval       │              │
│o│        pot pill · 5 board cards · bets        │  hand log /  │
│n│                                               │  training    │
│ │              hero seat (bottom center)        │  HUD         │
│r│                          ┌─ action bar ─────┐ │              │
│a│                          │presets · slider  │ │              │
│i│                          │FOLD CHECK RAISE  │ │              │
│l│                          └──────────────────┘ │              │
└─┴──────────────────────────────────────────────┴──────────────┘
```

- Table stage keeps a fixed aspect (≈ 16:9 oval inside), scales with container via CSS (`container-type: size` + `cqw/cqh` or a measured scale factor). Seat/bet/button positions are percentages from a hand-tuned lookup table per player count (2–9), hero always bottom center — not even angular spacing.
- Action bar: bottom-right of the table stage. Fold always in the same left slot; Check/Call middle; Bet/Raise right. Raise row above: presets `1/3`, `1/2`, `3/4`, `Pot`, `All-in`, a number input, and a slider. Keyboard: `F` fold, `C` check/call, `R` focus raise, `Enter` confirm, `Esc` cancel — ignored when focus is in any input/textarea/contenteditable or a Radix control.
- Side panel (320px): tabs `Log` (PokerNow-style lines, newest at bottom, street separators, colored verbs) and `Coach` (existing training HUD data, re-skinned). `L` toggles the panel.
- Mobile (<768px): table on top scaled to width, seats compressed (plate only), action bar fixed full-width bottom, side panel becomes a bottom sheet behind a button.

## Data seams (unchanged logic)

Keep: `features/game/lib/*`, `features/game/hooks/*` (socket, screen state, timers), `stores/*`, `lib/utils.ts` helpers. New presentational code consumes them through one view-model hook (`useTableViewModel`) so components receive flat, memoized props.

## Verification

`pnpm --filter @aipoker/web typecheck`, `lint`, `test`; then drive a 4–6 player bot game in the browser at 1440×900 and 390×844 and check: every seat readable and inside the stage, bets between seat and pot, pot and board centered, action bar usable by mouse and keyboard, log updates, showdown highlights winner and best five cards.
