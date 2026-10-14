import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { getPersona, minThinkMs, PERSONA_IDS } from './personas.ts';
import {
  BOT_PROMPT_VERSION,
  botPromptDigest,
  buildBotMessages,
  buildSystemPrompt,
  COMMON_SECTIONS,
  PROMPT_VERSIONS,
  PROMPTS,
} from './prompt.ts';

/**
 * Pins the prompt text to its version, so traces and evals can tell prompts apart. When the text
 * changes on purpose, bump BOT_PROMPT_VERSION and update both values here in the same commit.
 */
const PINNED = { version: 'bot-2026-10-13.1', digest: '4645f1f608e5135b6e2f132ed5e3d6d726fcecb017a675ea5b3654c651260789' };
/** Prompt v1 (the exploit layer) is frozen the same way: its text, the Exploiter and the thresholds it describes do not change without a v2. */
const PINNED_V1 = { version: 'bot-2026-10-14.1', digest: '71b03519f1fd47ebef74c374a5d2005bef6a1e94b123ddc5b08361e4af40bc7f' };

test('the prompt digest is pinned to BOT_PROMPT_VERSION', () => {
  assert.equal(BOT_PROMPT_VERSION, PINNED.version);
  assert.equal(botPromptDigest(), PINNED.digest);
  assert.equal(botPromptDigest('v0'), PINNED.digest);
});

test('the v1 prompt digest is pinned to its bot version', () => {
  assert.equal(PROMPTS.v1.botVersion, PINNED_V1.version);
  assert.equal(botPromptDigest('v1'), PINNED_V1.digest);
});

test('v1 is v0 with the exploit edits: the same sections, the persona texts and the v0 deep tools, plus the new lines', () => {
  const sections = (text: string) => text.split('\n').filter((line) => line.startsWith('## '));
  assert.deepEqual(sections(PROMPTS.v1.common), [...sections(PROMPTS.v0.common).slice(0, -2), '## Playing to win chips', ...sections(PROMPTS.v0.common).slice(-2)]);
  assert.ok(!PROMPTS.v1.common.includes('fewer than 30 opportunities'));
  assert.ok(PROMPTS.v1.common.includes('stack-off size'));
  assert.ok(PROMPTS.v1.deep.includes('opponent_read(seat)') && PROMPTS.v1.deep.includes('bet_estimates()'));
  assert.ok(!PROMPTS.v0.deep.includes('bet_estimates'));
  // The digest of v0 does not cover the Exploiter, so adding it moved nothing; v1 covers it.
  assert.ok(!PROMPTS.v0.personas.includes('exploiter') && PROMPTS.v1.personas.includes('exploiter'));
  assert.equal(PROMPTS.v1.brief, 'brief-1');
  assert.ok(buildSystemPrompt('exploiter', { deep: true, maxRounds: 3, withAdvisor: true }, 'v1').includes('## Persona: the Exploiter'));
});

test('the Analyst system prompt the first CLI runs used (cli-proto-0) is byte-stable', () => {
  const text = buildSystemPrompt('analyst', { deep: false });
  assert.equal(createHash('sha256').update(text).digest('hex'), 'f5a054b314bddb33a38ad3023e7e98c47cc954b05e89d41f3a4bdfbd4963b962');
  assert.equal(buildSystemPrompt('analyst', { deep: false }, 'v0'), text);
});

test('every prompt version has its own text, digest and bot version, and names a brief format', () => {
  const versions = PROMPT_VERSIONS.map((version) => PROMPTS[version]);
  assert.equal(new Set(versions.map((texts) => texts.botVersion)).size, versions.length);
  assert.equal(new Set(PROMPT_VERSIONS.map((version) => botPromptDigest(version))).size, versions.length);
  for (const texts of versions) {
    assert.ok(texts.common.startsWith('## Role') && texts.brief.startsWith('brief-'), texts.id);
  }
});

test('system holds the common sections first, then deep mode, then the persona; user holds the spot', () => {
  const realtime = buildSystemPrompt('bully', { deep: false });
  assert.ok(realtime.startsWith(COMMON_SECTIONS));
  assert.ok(realtime.endsWith(getPersona('bully').prompt));
  assert.ok(!realtime.includes('## Tools'));

  const deep = buildSystemPrompt('analyst', { deep: true, maxRounds: 3, withAdvisor: false });
  assert.ok(deep.indexOf('## Tools') < deep.indexOf('## Persona'));
  assert.ok(deep.includes('at most 3 rounds') && !deep.includes('advisor()'));
  assert.ok(buildSystemPrompt('analyst', { deep: true, maxRounds: 3, withAdvisor: true }).includes('advisor()'));

  const messages = buildBotMessages('showman', { deep: false }, 'HAND 1');
  assert.deepEqual(messages.map((message) => message.role), ['system', 'user']);
  assert.equal(messages[1]!.content, 'HAND 1');
});

test('every persona has a prompt, bands and a fallback; analyst, bully and showman ship first', () => {
  assert.deepEqual(PERSONA_IDS.filter((id) => getPersona(id).enabled).sort(), ['analyst', 'bully', 'showman']);
  assert.equal(getPersona('exploiter').enabled, false);
  assert.deepEqual(getPersona('exploiter').talkRate, { min: 0, max: 0 });
  for (const id of PERSONA_IDS) {
    const persona = getPersona(id);
    assert.ok(persona.prompt.startsWith(`## Persona: ${persona.label}`), id);
    assert.ok(persona.bands.vpip.min < persona.bands.vpip.max, id);
    assert.ok(persona.talkRate.max <= 0.5, id);
  }
  assert.equal(minThinkMs('analyst'), 1100);
  assert.equal(minThinkMs('bully'), 950);
});
