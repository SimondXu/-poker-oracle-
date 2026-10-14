import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeck } from '@aipoker/game-engine';

import { findCardLeaks, generateCoachSamples } from '../../../tools/coach-samples.ts';

const OPTIONS = { seed: 20261013, hands: 12 };
const generated = generateCoachSamples(OPTIONS);

test('the same seed gives the same samples, each a production record with its line', () => {
  assert.equal(JSON.stringify(generateCoachSamples(OPTIONS).samples), JSON.stringify(generated.samples));
  assert.ok(generated.samples.length >= 12, `${generated.samples.length} hero decisions in ${OPTIONS.hands} hands`);
  for (const { id, handNumber, decision } of generated.samples) {
    assert.equal(id, `${handNumber}:${decision.advice.actionIndex}`);
    assert.equal(decision.line.length, decision.advice.actionIndex);
  }
});

test('the card-leak check passes the samples and catches a card the hero could not see', () => {
  const lines = generated.samples.map((sample) => JSON.stringify(sample));
  assert.deepEqual(findCardLeaks(lines, generated.visible), []);

  const sample = generated.samples[0]!;
  const hidden = createDeck(() => 0).find((card) => !generated.visible.get(sample.id)!.has(card))!;
  const { advice } = sample.decision;
  const planted = { ...sample, decision: { ...sample.decision, advice: { ...advice, spot: { ...advice.spot, board: [...advice.spot.board, hidden] } } } };
  assert.deepEqual(findCardLeaks([JSON.stringify(planted)], generated.visible), [`${sample.id}: ${hidden}`]);
});
