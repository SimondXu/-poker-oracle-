import assert from 'node:assert/strict';
import test from 'node:test';

import { getPersona, minThinkMs, PERSONA_IDS } from './personas.ts';
import { BOT_PROMPT_VERSION, botPromptDigest, buildBotMessages, buildSystemPrompt, COMMON_SECTIONS } from './prompt.ts';

/**
 * Pins the prompt text to its version, so traces and evals can tell prompts apart. When the text
 * changes on purpose, bump BOT_PROMPT_VERSION and update both values here in the same commit.
 */
const PINNED = { version: 'bot-2026-10-13.1', digest: '4645f1f608e5135b6e2f132ed5e3d6d726fcecb017a675ea5b3654c651260789' };

test('the prompt digest is pinned to BOT_PROMPT_VERSION', () => {
  assert.equal(BOT_PROMPT_VERSION, PINNED.version);
  assert.equal(botPromptDigest(), PINNED.digest);
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
  for (const id of PERSONA_IDS) {
    const persona = getPersona(id);
    assert.ok(persona.prompt.startsWith(`## Persona: ${persona.label}`), id);
    assert.ok(persona.bands.vpip.min < persona.bands.vpip.max, id);
    assert.ok(persona.talkRate.max <= 0.5, id);
  }
  assert.equal(minThinkMs('analyst'), 1100);
  assert.equal(minThinkMs('bully'), 950);
});
