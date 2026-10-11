---
name: Holdem Lab
description: A No-Limit Hold'em training table set like a premium printed deck, two inks, engraved line, index typography.
colors:
  ink-0: "#0b1120"
  ink-1: "#0f1524"
  ink-2: "#141c2e"
  ink-3: "#1b2640"
  ink-4: "#2a3654"
  ink-5: "#44506b"
  ink-6: "#606a82"
  ink-7: "#7d869a"
  ink-8: "#a2a6b1"
  ink-9: "#c9c7c1"
  ink-10: "#ece7db"
  felt: "#1d4a3c"
  felt-deep: "#163b2f"
  rail: "#0f2a21"
  vermilion: "#c8372d"
  vermilion-hi: "#e5584c"
  vermilion-ink: "#a8281f"
  ivory: "#f2ece0"
  ivory-shade: "#d6cab0"
  ivory-edge: "#cdbf9f"
  on-ivory-2: "#6b6450"
  brass: "#b89a5e"
  suit-diamond: "#2a5db0"
  suit-club: "#1f7a4a"
  caution: "#d9a441"
  positive: "#5aa77a"
typography:
  display:
    fontFamily: "Barlow Condensed, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1.05
  title:
    fontFamily: "Barlow Condensed, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.05
  value:
    fontFamily: "Barlow Condensed, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum, lnum"
  label:
    fontFamily: "Barlow Condensed, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.1em"
  lead:
    fontFamily: "Manrope, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Manrope, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  micro:
    fontFamily: "Barlow Condensed, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.16em"
  kbd:
    fontFamily: "Barlow Condensed, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
  input:
    fontFamily: "Manrope, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.25
rounded:
  stamp: "2px"
  control: "4px"
  panel: "6px"
  card: "0.24em"
spacing:
  hair: "2px"
  tight: "4px"
  snug: "8px"
  group: "12px"
  gutter: "16px"
  section: "24px"
  major: "32px"
components:
  action-fold:
    backgroundColor: "transparent"
    textColor: "{colors.ink-8}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "56px"
  action-call:
    backgroundColor: "{colors.ink-3}"
    textColor: "{colors.ink-10}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "56px"
  action-raise:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.ivory}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "56px"
  button-primary:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.ivory}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.vermilion-hi}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-10}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 20px"
  input-field:
    backgroundColor: "{colors.ink-1}"
    textColor: "{colors.ink-10}"
    typography: "{typography.input}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 14px"
  seat-plate:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.panel}"
  seat-plate-folded:
    backgroundColor: "{colors.ivory-shade}"
    textColor: "{colors.on-ivory-2}"
    rounded: "{rounded.panel}"
  playing-card:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.card}"
    width: "2.5em"
    height: "3.5em"
  action-stamp-all-in:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.stamp}"
  dealer-disc:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.ink-1}"
    size: "1.6em"
  pot-medallion:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.ink-10}"
    width: "10.5em"
    height: "4.4em"
  action-dock:
    backgroundColor: "{colors.ink-1}"
    textColor: "{colors.ink-10}"
    padding: "12px 16px"
  result-banner:
    backgroundColor: "{colors.ink-1}"
    textColor: "{colors.ink-10}"
    rounded: "{rounded.panel}"
    height: "72px"
    padding: "0 16px"
  room-code-chip:
    backgroundColor: "transparent"
    textColor: "{colors.brass}"
    rounded: "{rounded.stamp}"
    height: "28px"
    padding: "0 8px"
---

# Design System: Holdem Lab

## Overview

**Creative North Star: "Card-Room Print"**

The table is set like a premium printed deck: two inks (ink-navy and court-card vermilion), engraved line (brass hairlines, a guilloche rosette in the felt, the card-back lattice reused as the pot medallion), and index typography (a condensed face for every number and label). It refuses the category default of flat neon-green felt with white plates and yellow bubbles, and equally the navy-and-gold casino glow. Depth is printed, not glowed: double rules inset into surfaces, soft offset shadows under cards and plates, no halos.

The product is a training table played under a 30-second clock, so the system is built for reading at a glance. Everything neutral comes from one tinted navy ramp. One loud ink, vermilion, says "act here": the seat to act, the raise button, the timer's last quarter, the all-in stamp, errors. Everything on the table is sized in `em` of the stage, so the whole table scales as one print; chrome (top bar, rail, dock, panel, lobby) uses a fixed seven-step type scale.

The memorable moment is the pot printed inside a card-back medallion at table center, with the acting seat ringed in vermilion.

**Key Characteristics:**
- One 11-step tinted ink ramp for every neutral; semantic aliases (`page`, `panel`, `line`, `text`) are what components use.
- Vermilion is the single loud ink; brass is the quiet one (hairlines, dealer disc, winner rule, focus ring).
- Ivory card stock for playing cards, seat plates and action stamps; nothing else is ivory fill.
- Condensed index face (Barlow Condensed, tabular lining numerals) for numbers and labels; Manrope for prose.
- Seat state vocabulary is fixed: to-act (vermilion ring, timer, lifts), waiting (ivory), folded (sunk one ink step), all-in (vermilion stamp), winner (brass rule and payout).
- Dark only (`color-scheme: dark`); no light theme exists.

## Colors

A navy ground, a baize-green table, ivory stock, one vermilion, one brass. Neutral steps are tinted toward navy (hue about 265); the top steps warm to ivory (hue about 88) so text never goes cold white.

### Primary
- **Court Vermilion** (#c8372d): the one loud ink. To-act ring and timer, the Raise button and lobby primary button, all-in stamp, hearts, selection highlight, slider range, error borders.
- **Vermilion Lifted** (#e5584c): vermilion as text on navy (5.1:1 on panel) and the primary button's hover. Also the `error` state color.
- **Vermilion Print** (#a8281f): vermilion as text on ivory (6.0:1): bet and raise stamps.

### Secondary
- **Muted Brass** (#b89a5e): engraved hairlines (use `brass/25` to `brass/70` for rules), the dealer disc, winner rule and payout, focus ring (2px, 2px offset), caret, room-code text, the timer's first three quarters. 6.8:1 on panel.

### Tertiary
- **Baize Felt** (#1d4a3c), **Felt Deep** (#163b2f), **Rail Green** (#0f2a21): the table. Felt carries the faint guilloche; the rail is the darker band around it.
- **Card Blue** (#2a5db0) and **Card Green** (#1f7a4a): diamonds and clubs of the four-color deck (spades are ink-2, hearts vermilion).
- **Caution Amber** (#d9a441) and **Signal Green** (#5aa77a): states only, where the state is the message: connecting/reconnecting, connected, equity clears the price.

### Neutral
- **Ink ramp** `ink-0` (#0b1120) to `ink-10` (#ece7db): eleven steps, navy to warm ivory-grey.
  - `page` = ink-2 (page and stage ground), `panel` = ink-1 (top bar, rail, side panel, dock, inputs), `panel-2` = ink-3 (raised control, hover, selected tab).
  - `line` = ink-3 (1px dividers), `line-2` = ink-4 (control borders, stronger rules).
  - `text` = ink-10 (14.8:1 on panel), `text-2` = ink-8 (7.4:1), `text-3` = ink-7 (5.0:1 on panel, 4.1:1 on panel-2; labels and hints).
- **Ivory stock** `ivory` (#f2ece0), `ivory-shade` (#d6cab0, inner rule and the folded plate), `ivory-edge` (#cdbf9f, outer edge), `on-ivory` = ink-2 (text, 14.5:1), `on-ivory-2` (#6b6450, secondary text, 5.0:1).

### Named Rules
**The One Loud Ink Rule.** Vermilion marks action and consequence: whose turn, what raises, what is wrong. It is not decoration and it is not a brand wash; on a quiet screen it should appear on one or two things.

**The Ink Ramp Rule.** Never introduce a grey. Every neutral is a step of the ink ramp or a semantic alias of one; a new surface picks the nearest step.

**The Stock Rule.** Ivory fill belongs to things that are printed paper: playing cards, seat plates, action stamps (and the hand-result mini cards). Ivory otherwise appears only as text on vermilion and as the slider thumb.

**The State-Only Color Rule.** Amber and signal green appear only where the state itself is the message, never as accents.

## Typography

**Index Font:** Barlow Condensed (500/600/700) with CJK system sans fallbacks, via `font-index` / `label-index`
**Prose Font:** Manrope with PingFang SC / Hiragino Sans GB / Noto Sans CJK SC / Microsoft YaHei fallbacks, via `font-sans`

**Character:** a condensed, engraved index face for everything that is a number or a label, so stacks, bets and pots line up and read like card indices; a quiet humanist sans for sentences. `font-index` turns on tabular lining numerals; `label-index` is the same face uppercase, 600, tracked.

### Hierarchy

Chrome and lobby: seven steps, one role each. The face is chosen separately from the step. Each `text-*` utility sets size and line-height, so put any `leading-*` after it.
- **Display** (700, 44px, 1.05): coach strength figure, home headline (sm and up), seated count (sm and up). Index face.
- **Title** (700, 28px, 1.05): page titles, coach suggestion, invite code, home headline on phones. Index face.
- **Value** (600-700, 22px, 1): amounts and stats, large lobby button label. Index face, right-aligned and tabular where they reconcile.
- **Label** (600, 18px, 1): control labels (Fold, Call, Raise), wordmark, section heads, lobby button labels. Index face, uppercase, `tracking-caps-tight` (0.1em).
- **Lead** (600, 15px, 1.35): names, emphasised prose, small index values; also the action-button label below `sm`.
- **Body** (400, 13px, 1.5): status, notes, log rows, captions, tabs. Prose face.
- **Micro** (600, 11px, 1): tracked caps labels beside a value or on a field, stamps, stat labels. Index face, uppercase, `tracking-caps` (0.16em). 11px is the legibility floor for the whole product.
- **Exceptions:** `text-kbd` 10px (keyboard hint chips only); `text-input` 16px (text inputs, the iOS no-zoom floor).

Tracking tokens: `caps` 0.16em (micro labels), `caps-tight` 0.1em (15px and larger caps: buttons, stamps), `caps-wide` 0.24em (wordmark and codes, which stay Latin in every locale). Under `:lang(zh)` `caps` becomes 0.04em and `caps-tight` 0.02em, since CJK has no case; `caps-wide` is never relaxed.

Table type (inside the stage, in stage em, each with a pixel floor): `seat-micro` 0.62em (floor 11px), `seat-tag` 0.78em (11px), `seat-name` 0.82em (11px), `seat-amount` 0.92em (11px), `seat-stack` 1.12em (12px), `seat-pot` 1.56em (16px). The stage sets `--stage-em`; the utilities are `@theme inline` so each evaluates on the element that uses it.

### Named Rules
**The Index Face Rule.** Every number and every label is `font-index`. Prose is `font-sans`. A figure in the prose face is a defect.

**The Fixed Scale Rule.** Use a `text-*` step; do not write `text-[13px]`. The two exceptions (`kbd`, `input`) are the whole list. Reading-size floor: 11px.

**The Merge Rule.** `src/lib/utils.ts` registers every type, tracking and spacing token with tailwind-merge (`extendTailwindMerge` with `theme.text`, `theme.tracking`, `theme.spacing`). A new token must be added there too, or `cn('text-text-2', 'text-body')` silently drops the color class.

## Layout

**Game screen.** One CSS grid at the viewport (`h-dvh`): rows `3rem` (48px top bar) then the rest; columns: one below `md`; `3.5rem` (56px icon rail) plus the table column at `md` (768px); a third `21.25rem` (340px) side-panel column at `xl` (1280px), which the rail's panel button collapses. Below `xl` the panel is a sheet inside the stage region (bottom sheet under `md`, right drawer at `md`), ending where the dock starts. Below `md` the rail is hidden and the top bar carries the back and panel buttons.

**Table column.** A flex column: connection banner strip, the stage region (`flex-1`), the action dock. The dock is a full-width row below the stage, never over the felt. There is no bottom reserve inside the stage: `TableStage` fills the free space exactly. When the raise sizing row opens, the dock grows upward and the stage shrinks.

**The dock.** Border-top `brass/25` on panel; content centred, max 640px wide, at least 72px tall. Action buttons are 56px high, equal-width grid slots (Fold | Call | Raise). The hand-result banner lives in the dock (a 72px in-flow row, up to 30rem wide), not floating over the table, so it never covers cards or seats and never needs a stage reserve.

**Table stage.** `fitTableStage` fits a fixed-aspect box into the stage and picks one of three orientations: landscape 16:9 (em = 1.45% of box width, max 20px), square 6:5 (1.9%, max 20px), portrait 3:5 (2.9%, max 16px). The box may stretch up to 1.35x from its aspect to fill the stage; a later orientation replaces an earlier one only when its em is 1.12x larger; stages narrower than 560px are always portrait, which uses the compact plate-only opponents. Every element is placed in percent of the box and sized in em of the box font-size, so the table scales by one factor and cannot collide at any size (asserted by `seat-layout.test.ts` for 2 to 10 seats, every orientation, aspects 9:16 to 21:9). Visual slot 0 (hero, or seat 0 when spectating) is bottom center; seats continue clockwise.

**Spacing rhythm: 4px base, named roles.** `hair` 2 (label to its value inside one stat), `tight` 4 (icon to text), `snug` 8 (sibling controls, field to its label), `group` 12 (items inside a group), `gutter` 16 (panel and page inset, card padding), `section` 24 (between sections of one surface), `major` 32 (between major blocks; named `major` rather than `block` because `block` collides with the `inline-block` utility family). Use the role names or the matching numeric steps; avoid half steps (1.5, 2.5, 3.5).

**Lobby.** Home and waiting room are a 1280px max-width page: a 56px header, then a two-column composition at `lg` (form 380-460px, table scene filling the rest, centered vertically), single column below. Both use the same felt-oval scene as the game, scaled by `cqw`.

**The layout-box convention.** Every element that must never overlap another carries `data-layout-box="<name>"`: seat plates, hole-card groups, bet chips, dealer disc, action tags, hand-name labels, pot, board, top bar, rail, locale toggle, panel tabs and sheet, action bar and each action button, sizing-row controls, result banner, and on the lobby the home form, hero scene, room panel, room table and room seats. A browser check collects these for each viewport and fails on any pair that intersect by more than 1px (nested boxes excepted), any box outside the viewport, and any box whose text overflows (`scrollWidth > clientWidth + 1`). When adding an element that sits on the table or in the chrome, give it a box name.

### Named Rules
**The One Scale Rule.** The table is one print scaled by one number. Never position a table element in px or give it its own font-size outside the metrics in `seat-layout.ts`.

**The Dock Rule.** Anything the hero must act on or read between hands (actions, sizing, status, the result) lives in the dock. The felt shows the game; the dock shows the decision.

## Elevation & Depth

Layered by tone and by print, lifted only for cards, plates and popovers. Surfaces step up the ink ramp (page, panel, panel-2); panels are separated by 1px `line` rules, never by shadow. Depth on the table comes from inset double rules (the medallion frame, the card-back border, the call and raise button rules, the result banner), which read as engraving. Shadows are an offset plus a soft blur and never a halo or glow; the actor's lift is a 0.25em translate, not a shadow.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 0.05em 0.1em rgb(5 8 16 / 0.35), 0 0.16em 0.4em -0.06em rgb(5 8 16 / 0.45)`): playing cards and the dealer disc; in em of the card.
- **Plate** (`box-shadow: 0 2px 3px rgb(5 8 16 / 0.32), 0 6px 14px -4px rgb(5 8 16 / 0.5)`): seat plates, result banner.
- **Float** (`box-shadow: 0 2px 6px rgb(5 8 16 / 0.4), 0 12px 28px -8px rgb(5 8 16 / 0.6)`): popovers, tooltips, the side-panel sheet.
- **Highlight raise** (card): a raised card (`-0.3em`) with a `0.06em` brass edge ring marks the winning five.

### Named Rules
**The No Halo Rule.** No blurred colored glow, ever. State is carried by a ring (vermilion outline 0.16em, 0.08em offset on the plate), a rule (brass line across the winner plate), a lift, or a one-step ink change.

**The Engraved Rule.** A surface that should feel printed gets a double rule painted with inset `box-shadow` (outer rule, ground-colored gap, inner rule at lower opacity), which never changes the box size.

## Shapes

Small, square-shouldered corners, like a cut deck. Radius tokens: `stamp` 2px (printed tags, blind tags, kbd chips), `control` 4px (buttons, inputs, sizing chips), `panel` 6px (panels, seat plates, popovers, the result banner), `card` 0.24em of the card's own font-size (playing cards, so every size keeps the same corner). Circles only for the dealer disc, chips, slider thumb and connection dot. The table is an ellipse: the felt oval, a rail band around it, the seat ring on the rail.

Recurring silhouettes: the playing card (5:7, 2.5em by 3.5em), the seat plate (ivory, fine inner rule, state ring outside), the stamp (rotated -3deg for raise, all-in and the all-in plate label), the pot medallion (a lattice band between brass rules around a navy oval).

## Components

### Playing card (`Card`)
Ivory stock, a fine inner frame, the rank in the index face top-left and mirrored bottom-right with its suit beneath, a center pip on number cards and a framed court panel on J, Q, K. Box is 2.5em by 3.5em of its own font-size. Sizes are font-size steps relative to the parent: `xs` 0.5em, `sm` 0.625em, `md` 0.875em, `lg` 1.125em, `xl` 1.5em. `xs` and `sm` print the index only (and `xs` drops the inner frame); `md` and up add the pip or court panel and the engraved lattice on the back. Face-down is the engraved navy back (`card-back-print`). Highlight raises the card and adds a brass edge; dim sinks the stock one step (ivory to ivory-shade, ink muted), never a grey wash or transparency. `CardRank` is the exported rank glyph; at small print the Q is an authored glyph with a tail that breaks out of the bowl so it never reads as 0.

### Seat plate
Ivory stock with a fine printed inner rule. Name on top (index face, `seat-name`), stack on the right (`seat-stack`, bold), state label on the left of the stack row (Stack, Folded, personality stamp, SB/BB, all-in stamp, or the winner's payout). To-act: vermilion outline ring plus a draining timer bar, and the seat lifts 0.25em. Folded: ivory-shade ground, on-ivory-2 text. Winner: brass outline and a brass rule across the top. Opponent hole cards sit above the plate (below for the top row, toward the felt) at `sm`-index print; the hero's are large over the plate. On the portrait table opponents are plate-only.

### Action buttons (`ActionButton`)
Fixed 56px height, width from the grid slot, label then amount on one baseline in the index face (`lead` below `sm`, `label` from `sm`), then the keyboard hint chip from `md`. Fold: quiet outlined ink. Call: panel-2 fill, ivory-grey text, a printed double rule. Raise: vermilion with a printed double rule. Hover: brightness (Fold: panel-2 fill); focus: 2px brass outline, 2px offset; press: scale 0.97 in 120ms; disabled: 40% opacity. Amount truncates inside its slot, never wraps.

### Lobby buttons and fields
Primary: vermilion fill, ivory text, 48px (56px large), index face uppercase `caps-tight`, hover to vermilion-hi, disabled panel-2 with text-3. Secondary: 1px line-2 outline, hover brass/60 border and panel-2 fill. Fields: 48px, panel fill, line-2 border, 16px text, focus border turns brass; the room-code field is index face, spaced `caps-wide`. Field labels are micro index caps in text-3.

### Pot medallion (`PotMedallion`)
The signature: the pot printed inside the card-back medallion, 10.5em by 4.4em of its own font-size. A brass-ruled lattice band around a navy oval holding the tracked label (`seat-micro`, brass) and the amount (index face, bold, `1.9em`; `1.6em` when a side-pot line is printed under it in ivory/85). The amount is `aria-live`.

### Chips, dealer disc, stamps
`Chip`: 1em engraved bet chip, navy face with eight brass edge notches (vermilion face with ivory notches for a raise or all-in). `ChipBubble`: chip at 1.5em plus the amount in the index face at 1.15em. `DealerButton`: 1.6em brass disc with a "D", ink-1 text. `ActionTag`: an ivory stamp with a hairline border and index-face tracked caps; raise and all-in are rotated -3deg with a heavier border (all-in is vermilion-filled). `BlindTag`: SB/BB, hairline border in the plate's secondary ink.

### Navigation chrome
Top bar 48px on panel: wordmark and spade mark, a room-code chip (28px, 2px radius, brass/50 border, copies on click), NLHE and blinds, hand number, connection dot, locale toggle (EN / 中文). Icon rail 56px on panel. Side panel 340px with three tabs (Log, Coach, Opponents); Coach opens on the hero's turn.

### Hand result banner
72px in-flow row in the dock, up to 30rem wide: ink-1 ground, brass/70 border, double inset rule, plate shadow. Best-five mini cards, winner and what they won, hand name, one line about the hero's own result (labelled net), and the gross pot in brass. Never takes pointer events, never a modal; it leaves on the phase timers.

### Motion
Under 200ms, ease-out family: `--ease-out` cubic-bezier(0.23, 1, 0.32, 1), `--ease-in-out` cubic-bezier(0.77, 0, 0.175, 1); durations `fast` 120ms (press, hover), `normal` 180ms (card highlight, banner entry). Keyframes: `table-deal-in` (dealt from center), `table-fade-in` (board cards, bets, tags, banner), `table-timer-drain` (brass, then vermilion in the last 25%), `thinking-dot` (bot thinking). Table and button animations carry `motion-reduce` variants or a reduced-motion flag (no global `prefers-reduced-motion` rule exists yet). No modal or animation blocks the next decision.

## Do's and Don'ts

### Do:
- **Do** take every neutral from the ink ramp through the semantic aliases (`bg-panel`, `border-line`, `text-text-2`).
- **Do** set every number and label in `font-index` / `label-index`, and every sentence in `font-sans`.
- **Do** use a `text-*` scale step and a spacing role (`p-gutter`, `gap-snug`); register any new token in `src/lib/utils.ts`.
- **Do** keep the seat state vocabulary exact: vermilion ring and lift for to-act, sunk ivory-shade for folded, vermilion stamp for all-in, brass rule and payout for winner.
- **Do** size every table element in `em` of the stage and place it in percent of the box via `seat-layout.ts`; add `data-layout-box` to anything new on the table or in the chrome.
- **Do** keep text at 11px or more, and body text at 4.5:1 or better on its ground.
- **Do** put decisions and the hand result in the dock, and keep keyboard parity: every action has a hotkey.
- **Do** keep depth to offset-and-blur shadows and inset double rules.

### Don't:
- **Don't** add flat neon-green felt, white plates, yellow chip bubbles, or navy-and-gold casino glow (the confirmed category defaults this system refuses).
- **Don't** use vermilion as decoration or a second accent color; don't add a new hue for a new feature.
- **Don't** put a blurred colored glow or halo on any state.
- **Don't** render Unicode suit glyphs; use `SuitIcon`.
- **Don't** use arbitrary pixel type (`text-[13px]`) or half-step spacing (`p-1.5`, `px-2.5`, `px-3.5`).
- **Don't** lay a modal, toast, or floating banner over the felt; the felt is for the game.
- **Don't** let the stage reserve space for the dock, or position table elements in px.
- **Don't** use `block` as a spacing role; the 32px step is `major`.
