import { createHash } from 'node:crypto';

import type { AgentPersonaId } from '@aipoker/shared';

import type { MenuOption } from './menu.ts';
import type { ToolName } from './tools/catalog.ts';
import type { AgentDecision } from './types.ts';

/** A provider-neutral chat message, as the trace stores what was sent. */
export interface BotChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolRun {
  tool: ToolName;
  args: { seat: number | null; option: string | null };
  ms: number;
  ok: boolean;
  error: string | null;
  resultHash: string;
  /** JSONL only. */
  result: unknown | null;
}

export type BotTraceArm = 'live' | 'A0' | 'A1' | 'A2' | 'A3' | 'A3n' | 'A4';

export type BotFallbackReason =
  | 'timeout'
  | 'breaker_open'
  | 'budget'
  | 'http_error'
  | 'invalid_json'
  | 'invalid_choice'
  | 'tool_loop_exceeded'
  | 'stale'
  | 'disabled';

/** One bot decision, end to end. Evals, replay and debugging read only these. */
export interface BotDecisionTrace {
  traceId: string;
  at: string;
  promptVersion: string;
  mode: 'realtime' | 'deep';
  arm: BotTraceArm;
  room: string;
  handNumber: number;
  actionIndex: number;
  stateVersion: number;
  seat: number;
  persona: AgentPersonaId;
  profileId: string;
  model: string;

  input: {
    briefHash: string;
    memoryHash: string;
    menu: MenuOption[];
    promptTokensEst: number;
    /** JSONL only. */
    messages: BotChatMessage[] | null;
  };
  brief: { ms: number; tools: ToolRun[] };

  rounds: Array<{
    round: number;
    requestHash: string;
    latencyMs: number;
    status: 'ok' | 'http_error' | 'timeout' | 'aborted' | 'breaker_open' | 'budget';
    httpStatus: number | null;
    usage: { input: number; output: number; cachedInput: number | null; reasoning: number | null } | null;
    costUsd: number;
    costEstimated: boolean;
    /** At most 4 KB. */
    raw: string;
    parsed: unknown | null;
    validation: { ok: boolean; errors: string[] };
    toolCalls: ToolRun[];
  }>;

  decision: {
    source: 'llm' | 'fallback';
    fallbackReason: BotFallbackReason | null;
    choice: string | null;
    action: AgentDecision;
    stale: boolean;
  };

  talk: { en: string; zh: string; emitted: boolean; blockedBy: string | null } | null;
  note: { en: string; zh: string; /** Set at hand end. */ shown: boolean } | null;
  timings: { snapshotMs: number; briefMs: number; llmMs: number; pacingMs: number; totalMs: number };
  totals: { costUsd: number; inputTokens: number; outputTokens: number; calls: number; toolCalls: number };
}

/** JSON with object keys sorted and Maps as sorted entries, so equal values hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Map) {
      return [...item.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)));
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
    }
    return item;
  });
}

export function hashJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
