import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeStream } from '../../../tools/cli-canary.ts';

// Synthetic stream-json: hand-written to the event shape, not recorded.
const stream = (...events: unknown[]) => events.map((event) => JSON.stringify(event)).join('\n');
const toolUse = (name: string) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input: {} }] } });

test('synthetic: a clean run shows only StructuredOutput, no denial and no token', () => {
  const analysis = analyzeStream(
    stream({ type: 'system', subtype: 'init' }, toolUse('StructuredOutput'), { type: 'result', permission_denials: [] }),
    'CANARY-abc',
  );
  assert.deepEqual([analysis.leaked, analysis.tools, analysis.denials], [false, ['StructuredOutput'], 0]);
});

test('synthetic: a token anywhere in the output, another tool or a denial is caught', () => {
  const leaked = analyzeStream(stream({ type: 'user', message: { content: [{ type: 'tool_result', content: 'deck CANARY-abc-As' }] } }), 'CANARY-abc');
  assert.equal(leaked.leaked, true);

  const read = analyzeStream(stream(toolUse('Read'), toolUse('StructuredOutput'), { type: 'result', permission_denials: [{ tool_name: 'Read' }] }), 'CANARY-abc');
  assert.deepEqual([read.tools, read.denials], [['Read', 'StructuredOutput'], 1]);
});

test('lines that are not JSON are skipped', () => {
  assert.deepEqual(analyzeStream('warning: something\n{broken', 'CANARY-abc').tools, []);
});
