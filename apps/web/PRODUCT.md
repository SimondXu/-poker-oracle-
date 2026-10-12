# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: a solo No-Limit Texas Hold'em learner practicing against AI opponents (rule-based bots now, LLM personas later). They open the app to play a session of hands, want feedback while they play, and want to understand why opponents acted the way they did. Sessions are tens of hands long; desktop is the main device, phone is supported.

Secondary (confirmed as supported, not the design center): friends joining the same room through a 6-character invite code; a technical reviewer of the author's portfolio who opens the app briefly.

## Product Purpose

A real-time NLHE training table: server-authoritative game engine, bot opponents with distinct personalities, and a training coach that shows equity / pot odds / a suggested action on the hero's turn. Success: the learner gets into a hand fast, can read the table at a glance, and leaves each hand knowing something about their decision.

## Positioning

Unlike PokerNow (a neutral table for human home games), Holdem Lab's opponents are AI with visible personalities and reasoning, and the table itself coaches you. The AI is the product, not a seat filler.

## Operating Context

- Flow: home (create or join) → waiting room (seat bots: Fish / TAG / LAG, ready, start) → table (hands auto-advance; hero acts with buttons or hotkeys) → hand result → next hand, elimination/spectate, or table finished.
- Long sessions of repeated decisions under a 30s action timer; readability and speed of input dominate.
- Reference product the user named: PokerNow (pokernow.com). Goal stated by the user: inspired by PokerNow, but more beautiful, with a better overall UX flow.

## Capabilities and Constraints

- Stack: Next.js 15 App Router, React 19, Tailwind v4, Zustand, socket.io-client; shared contracts in `packages/shared`.
- Up to 10 seats (room UI currently caps at 6); blinds 10/20 default; 1,000 starting stacks.
- Bots: Fish, TAG, LAG personalities. The shared contract defines `bot:status`, `bot:reasoning`, and `table:chat` events, but the web client does not consume them yet and the server does not emit bot reasoning yet.
- Training data available on hero turn: preflop percentile or postflop equity, pot odds, required equity, position, deterministic TAG-baseline suggestion with reason.
- No accounts, no persistence: hand history lives only in the client session.
- Language: the user asked for both English and Chinese with a toggle (i18n). Poker terms follow standard English usage; Chinese strings mirror them.
- Undecided: full EV-based hand review (needs backend analysis); LLM persona opponents in the UI.

## Brand Commitments

- Name: Holdem Lab (chosen by the user 2026-10-11, replacing the working name AiPoker; same brand string in English and Chinese UI). No logo asset exists.
- Reference: PokerNow's clarity (flat felt, big readable cards, bet chips between seat and pot, fixed action slots) is the floor; the user explicitly wants it more beautiful.

## Evidence on Hand

- Working game loop with real bot play; screenshots of the current build can be captured from the dev server.
- No user metrics, testimonials, win-rate data, or benchmarks exist; do not fabricate any.

## Product Principles

1. The table is the product: everything else (lobby, panels) gets the hero into a hand and out of the way.
2. Readable at a glance, under time pressure: stack sizes, bets, pot, and whose turn it is never require searching.
3. The AI should feel present: opponents have identity and their thinking is visible where it helps learning.
4. Teach without nagging: coaching is available at the decision point and quiet otherwise.
5. Fast hands: no modal or animation may block the next decision.

## Accessibility & Inclusion

Keyboard play is first-class (hotkeys for every action). Four-color deck by default for suit legibility. Respect reduced motion.
