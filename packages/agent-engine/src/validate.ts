import type { BotDecisionPhase } from '@aipoker/shared';
import { z } from 'zod';

import { MENU_IDS, toDecision, type MenuId, type MenuOption } from './menu.ts';
import { TOOLS, type ToolArgs, type ToolName } from './tools/index.ts';
import type { AgentDecision } from './types.ts';

export const TALK_LIMITS = { en: 80, zh: 40 } as const;
export const NOTE_LIMITS = { en: 160, zh: 80 } as const;
export const MAX_TOOL_CALLS_PER_ROUND = 3;

/** Tools the deep schema names; the validator still rejects the advisor outside the consultant arm. */
const DEEP_SCHEMA_TOOLS = (Object.values(TOOLS))
  .filter((spec) => spec.mode !== 'eager')
  .map((spec) => spec.name);

const bilingualSchema = {
  anyOf: [
    { type: 'null' },
    { type: 'object', additionalProperties: false, required: ['en', 'zh'], properties: { en: { type: 'string' }, zh: { type: 'string' } } },
  ],
};

/**
 * The response formats sent to providers: every property required, optional ones nullable, no
 * length or numeric keywords (zod checks those), an object at the root. Static, so providers can
 * cache the compiled grammar.
 */
export const REALTIME_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['choice', 'talk', 'note'],
  properties: {
    choice: { type: 'string', enum: [...MENU_IDS] },
    talk: bilingualSchema,
    note: bilingualSchema,
  },
} as const;

export const DEEP_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['step', 'calls', 'choice', 'talk', 'note'],
  properties: {
    step: { type: 'string', enum: ['tools', 'act'] },
    calls: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tool', 'seat', 'option'],
        properties: {
          tool: { type: 'string', enum: DEEP_SCHEMA_TOOLS },
          seat: { anyOf: [{ type: 'null' }, { type: 'integer' }] },
          option: { anyOf: [{ type: 'null' }, { type: 'string', enum: [...MENU_IDS] }] },
        },
      },
    },
    choice: { anyOf: [{ type: 'null' }, { type: 'string', enum: [...MENU_IDS] }] },
    talk: bilingualSchema,
    note: bilingualSchema,
  },
} as const;

const bilingual = z.strictObject({ en: z.string(), zh: z.string() });
const realtimeAnswer = z.strictObject({ choice: z.string(), talk: bilingual.nullable(), note: bilingual.nullable() });
const deepAnswer = z.strictObject({
  step: z.enum(['tools', 'act']),
  calls: z.array(z.strictObject({ tool: z.string(), seat: z.number().int().nullable(), option: z.string().nullable() })),
  choice: z.string().nullable(),
  talk: bilingual.nullable(),
  note: bilingual.nullable(),
});

export interface Bilingual {
  en: string;
  zh: string;
}

const CARD_TOKEN = /(^|[^A-Za-z0-9])[2-9TJQKA][hdcs](?![A-Za-z0-9])/;
const SUIT_GLYPH = /[♠♣♥♦♤♧♡♢]/;
const URL = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ai|gg|cn|co|me|app|xyz)\b)/i;
const ABOUT_INSTRUCTIONS = /\b(prompt|instructions?|system)\b|提示词|指令|系统/i;
// A floor, not moderation: the persona prompt asks for no insults, and these catch the worst slips.
const BLOCKLIST = /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|retard\w*|whore\w*|slut\w*|rape\w*|kys|kill yourself)\b|傻逼|操你|去死|妈的|婊子|贱人/i;

const length = (text: string) => [...text].length;

/** Why a line can't be shown, or null: limits, then cards, links, instructions and abuse. */
function screen(text: Bilingual, limits: { en: number; zh: number }, allowCards: boolean): string | null {
  const both = `${text.en}\n${text.zh}`;
  if (text.en.trim() === '' || text.zh.trim() === '') {
    return 'empty';
  }
  if (length(text.en) > limits.en || length(text.zh) > limits.zh) {
    return 'too_long';
  }
  if (!allowCards && (CARD_TOKEN.test(both) || SUIT_GLYPH.test(both))) {
    return 'cards';
  }
  if (URL.test(both)) {
    return 'url';
  }
  if (ABOUT_INSTRUCTIONS.test(both)) {
    return 'instructions';
  }
  return BLOCKLIST.test(both) ? 'blocklist' : null;
}

/** A note is required when the bot bets, raises or calls after the flop. */
export function noteRequired(phase: BotDecisionPhase, option: MenuOption): boolean {
  return phase !== 'preflop' && option.kind !== 'fold' && option.kind !== 'check';
}

export interface ValidAct {
  ok: true;
  step: 'act';
  choice: MenuId;
  action: AgentDecision;
  /** Kept for the trace even when blocked; only an unblocked line is shown. */
  talk: (Bilingual & { blockedBy: string | null }) | null;
  /** Null when absent or blocked. */
  note: Bilingual | null;
  /** Problems that don't void the decision: a blocked talk line, a missing or dropped note. */
  errors: string[];
}

export interface ValidToolRequest {
  ok: true;
  step: 'tools';
  calls: Array<{ tool: ToolName; args: ToolArgs }>;
  errors: string[];
}

export interface Invalid {
  ok: false;
  reason: 'invalid_json' | 'invalid_choice';
  errors: string[];
}

function zodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'answer'}: ${issue.message}`);
}

function validateAct(
  answer: { choice: string | null; talk: Bilingual | null; note: Bilingual | null },
  menu: readonly MenuOption[],
  phase: BotDecisionPhase,
): ValidAct | Invalid {
  const option = menu.find((candidate) => candidate.id === answer.choice);
  if (!option) {
    return { ok: false, reason: 'invalid_choice', errors: [`choice ${answer.choice} is not on the menu`] };
  }
  const errors: string[] = [];
  const talkBlock = answer.talk ? screen(answer.talk, TALK_LIMITS, false) : null;
  if (talkBlock) {
    errors.push(`talk blocked: ${talkBlock}`);
  }
  const noteBlock = answer.note ? screen(answer.note, NOTE_LIMITS, true) : null;
  if (noteBlock) {
    errors.push(`note dropped: ${noteBlock}`);
  } else if (!answer.note && noteRequired(phase, option)) {
    errors.push('note missing');
  }
  return {
    ok: true,
    step: 'act',
    choice: option.id,
    action: toDecision(option),
    talk: answer.talk ? { ...answer.talk, blockedBy: talkBlock } : null,
    note: answer.note && !noteBlock ? answer.note : null,
    errors,
  };
}

/** Checks a realtime answer against this decision's menu. */
export function validateRealtime(parsed: unknown, menu: readonly MenuOption[], phase: BotDecisionPhase): ValidAct | Invalid {
  const answer = realtimeAnswer.safeParse(parsed);
  return answer.success
    ? validateAct(answer.data, menu, phase)
    : { ok: false, reason: 'invalid_json', errors: zodErrors(answer.error) };
}

/** Checks a deep-mode answer: a tool request (one to three known calls) or an act. */
export function validateDeep(
  parsed: unknown,
  menu: readonly MenuOption[],
  phase: BotDecisionPhase,
  allowedTools: readonly ToolName[],
): ValidAct | ValidToolRequest | Invalid {
  const result = deepAnswer.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: 'invalid_json', errors: zodErrors(result.error) };
  }
  const answer = result.data;
  if (answer.step === 'act') {
    return answer.calls.length > 0
      ? { ok: false, reason: 'invalid_json', errors: ['an act carries no tool calls'] }
      : validateAct(answer, menu, phase);
  }

  const errors: string[] = [];
  if (answer.choice !== null || answer.talk !== null || answer.note !== null) {
    errors.push('a tool request has choice, talk and note null');
  }
  if (answer.calls.length < 1 || answer.calls.length > MAX_TOOL_CALLS_PER_ROUND) {
    errors.push(`a tool request has 1 to ${MAX_TOOL_CALLS_PER_ROUND} calls`);
  }
  for (const call of answer.calls) {
    if (!allowedTools.includes(call.tool as ToolName)) {
      errors.push(`unknown tool ${call.tool}`);
    }
    if (call.option !== null && !menu.some((option) => option.id === call.option)) {
      errors.push(`option ${call.option} is not on the menu`);
    }
  }
  return errors.length > 0
    ? { ok: false, reason: 'invalid_json', errors }
    : {
        ok: true,
        step: 'tools',
        calls: answer.calls.map((call) => ({ tool: call.tool as ToolName, args: { seat: call.seat, option: call.option as MenuId | null } })),
        errors: [],
      };
}
