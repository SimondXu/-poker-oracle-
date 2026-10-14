import { fileURLToPath } from 'node:url';

import { buildBrief, createToolContext } from '@aipoker/agent-engine';

import { buildBotTurnInput } from '../game-loop/bot-view.ts';
import { seededBotSpots } from './bot-spots.ts';

/** The realtime brief must fit the event loop at about the coach's cost (`llm-bots.md`, step B2a). */
const P95_BUDGET_MS = 200;

/**
 * Times the full realtime brief on seeded spots. A script rather than a test, because a timing bound
 * on a shared CI runner is noise. `pnpm -s bench:bot-brief [spots] [seed]`; exits 1 over budget.
 */
export function benchBotBrief(spots: number, seed: string): { p50: number; p95: number; max: number } {
  const timings = seededBotSpots(spots, seed).map(({ room, botId }) => {
    const ctx = createToolContext(buildBotTurnInput(room, botId)!);
    return buildBrief(ctx, 'full').ms;
  }).sort((left, right) => left - right);
  return {
    p50: timings[Math.floor(timings.length * 0.5)]!,
    p95: timings[Math.floor(timings.length * 0.95)]!,
    max: timings.at(-1)!,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const spots = Number(process.argv[2] ?? 300);
  const seed = process.argv[3] ?? 'bot-brief-bench';
  const { p50, p95, max } = benchBotBrief(spots, seed);
  console.log(`brief on ${spots} spots: p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${max.toFixed(1)} ms (budget p95 ${P95_BUDGET_MS} ms)`);
  process.exitCode = p95 <= P95_BUDGET_MS ? 0 : 1;
}
