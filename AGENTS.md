# AiPoker — Codex Agent Instructions

> This file is auto-loaded by Codex. Keep it short. Detailed references live in `Docs/`.

## 0. Codex Startup

- If Superpowers is not bootstrapped in this environment, run:
  - `~/.codex/superpowers/.codex/superpowers-codex bootstrap`
- Use skills when applicable:
  - Creative work → `superpowers:brainstorming` first
  - game-engine changes → tests first (TDD)
- OpenAI API/Codex/Responses/Agents SDK questions: use `openaiDeveloperDocs` MCP first.
- Third-party library docs/examples: use `context7` MCP first.

## 1. Non-Negotiables (Architecture)

1. `packages/game-engine` is **pure + deterministic**:
   - No I/O, no `Date` / `Date.now()`, no `Math.random()`, no global mutable state.
   - Randomness via injected `rng`, time via explicit `nowMs`.
2. **One-way deps**: `game-engine` ← `bot-engine` ← `server`. `web` must not import `server`.
3. **Server-authoritative**: clients only send intent; server validates and broadcasts.
4. **Privacy**: server snapshots must remove other players' `holeCards` (except showdown/replay rules).
5. `game-engine` must **not throw**. Return `Result<T, E>` for all recoverable failures.

## 2. MVP Constraints

- Single instance on a personal server.
- No distributed consistency / horizontal scaling in MVP.
- Default concurrency control: **per-room serialized action queue + `stateVersion`**.
- Redis/BullMQ are optional later, only if you can prove you need them.

## 3. Tech Stack (Baseline)

- Monorepo: pnpm workspace + Turborepo
- Web: Next.js 15 / React 19 / TypeScript / Zustand / Framer Motion / Tailwind + shadcn/ui
- Server: Node.js 22 / Fastify / Socket.io / Zod / Drizzle ORM
- DB: PostgreSQL (self-host default; Supabase optional)
- Optional: Redis (self-host/Upstash), BullMQ (only if needed)

## 4. Doc Authority Order

1. `Docs/gameplay-rules.md` — **single source of truth for rules**
2. `Docs/data-models.md` — contracts/types/DB/API
3. `Docs/tech-architecture.md` — tech decisions + deployment
4. `Docs/ui-spec.md` — UI/UX spec
5. `Docs/engineering-styleguide.md` — engineering reference

## 5. Working Rules

- If rules change: update `Docs/gameplay-rules.md` first, then align `Docs/data-models.md`.
- Keep diffs focused. Avoid drive-by refactors.
- Before claiming “done”: run lint/typecheck/tests (once the tooling exists).
