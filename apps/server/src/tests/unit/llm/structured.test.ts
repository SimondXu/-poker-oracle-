import assert from 'node:assert/strict';
import test from 'node:test';

import { z } from 'zod';

import { extractJsonObject, lintStrictSchema, parseOutput, type OutputSchema } from '../../../llm/structured.ts';

const schema: OutputSchema<{ verdict: 'matched' | 'off'; note: string | null }> = {
  name: 'verdict',
  jsonSchema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['matched', 'off'] },
      note: { type: ['string', 'null'] },
    },
    required: ['verdict', 'note'],
    additionalProperties: false,
  },
  zod: z.object({ verdict: z.enum(['matched', 'off']), note: z.string().nullable() }),
};

test('extractJsonObject strips a code fence and ignores prose around it', () => {
  const reply = 'Sure! Here it is:\n```json\n{"verdict": "off", "note": "a } in a string"}\n```\nAnything else?';

  assert.equal(extractJsonObject(reply), '{"verdict": "off", "note": "a } in a string"}');
});

test('extractJsonObject takes the first top-level object from bare text', () => {
  assert.equal(extractJsonObject('{"a": {"b": "\\"}"}} {"c": 1}'), '{"a": {"b": "\\"}"}}');
  assert.equal(extractJsonObject('no object here'), null);
  assert.equal(extractJsonObject('{"truncated": '), null);
});

test('parseOutput reports zod issues by path and runs the caller validator', () => {
  assert.deepEqual(parseOutput('{"verdict": "close", "note": null}', schema), {
    ok: false,
    errors: ['verdict: Invalid option: expected one of "matched"|"off"'],
  });
  assert.deepEqual(parseOutput('{"verdict": "off", "note": null}', schema, () => ['verdict must be matched']), {
    ok: false,
    errors: ['verdict must be matched'],
  });
  assert.deepEqual(parseOutput('{"verdict": "off", "note": null}', schema), {
    ok: true,
    value: { verdict: 'off', note: null },
  });
});

test('lintStrictSchema accepts a strict schema, nested objects and arrays included', () => {
  assert.deepEqual(
    lintStrictSchema({
      type: 'object',
      properties: {
        verdict: { type: 'string' },
        cites: {
          type: 'array',
          items: {
            type: 'object',
            properties: { code: { type: 'string' } },
            required: ['code'],
            additionalProperties: false,
          },
        },
      },
      required: ['verdict', 'cites'],
      additionalProperties: false,
    }),
    [],
  );
  assert.deepEqual(lintStrictSchema(schema.jsonSchema), []);
});

test('lintStrictSchema reports optional properties and open objects at any depth', () => {
  assert.deepEqual(
    lintStrictSchema({
      type: 'object',
      properties: {
        verdict: { type: 'string' },
        detail: { type: 'object', properties: { why: { type: 'string' } }, required: ['why'] },
        options: { type: 'array', items: { anyOf: [{ type: 'object', properties: { a: { type: 'number' } } }] } },
      },
      required: ['detail', 'options'],
      additionalProperties: false,
    }),
    [
      '$: property "verdict" is not required',
      '$.detail: additionalProperties must be false',
      '$.options[].anyOf[0]: additionalProperties must be false',
      '$.options[].anyOf[0]: property "a" is not required',
    ],
  );
});
