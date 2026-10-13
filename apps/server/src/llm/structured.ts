import type { z } from 'zod';

import type { StructuredMode } from './profiles.ts';

export type JsonSchema = Record<string, unknown>;

/** A static output schema: the JSON Schema sent to the provider and the zod schema that checks the reply. */
export interface OutputSchema<T> {
  name: string;
  jsonSchema: JsonSchema;
  zod: z.ZodType<T>;
}

export function responseFormat(mode: StructuredMode, schema: OutputSchema<unknown>): JsonSchema | undefined {
  switch (mode) {
    case 'json_schema':
      return { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.jsonSchema } };
    case 'json_object':
      return { type: 'json_object' };
    case 'prompt':
      return undefined;
  }
}

/** For modes the provider doesn't enforce; JSON mode also needs the word "JSON" in the prompt. */
export function schemaInstruction(schema: OutputSchema<unknown>): string {
  return `Reply with one JSON object and nothing else. It must match this JSON Schema:\n${JSON.stringify(schema.jsonSchema)}`;
}

/** The first top-level JSON object in a reply, inside a code fence if there is one. */
export function extractJsonObject(text: string): string | null {
  const fenced = /```(?:json)?[^\n]*\n([\s\S]*?)```/i.exec(text);
  const source = fenced ? fenced[1]! : text;
  const start = source.indexOf('{');
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  return null;
}

export type ParsedOutput<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseOutput<T>(
  content: string,
  schema: OutputSchema<T>,
  validate?: (value: T) => string[],
): ParsedOutput<T> {
  const json = extractJsonObject(content);
  if (json === null) {
    return { ok: false, errors: ['no JSON object in the reply'] };
  }

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    return { ok: false, errors: [`invalid JSON: ${(error as Error).message}`] };
  }

  const parsed = schema.zod.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }

  const errors = validate?.(parsed.data) ?? [];
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: parsed.data };
}

/**
 * Strict-mode compatibility: every object schema lists all its properties in `required`
 * and sets `additionalProperties: false`. Returns one message per violation.
 */
export function lintStrictSchema(schema: JsonSchema, path = '$'): string[] {
  const errors: string[] = [];
  const properties = schema.properties as Record<string, JsonSchema> | undefined;

  if (schema.type === 'object' || properties) {
    if (schema.additionalProperties !== false) {
      errors.push(`${path}: additionalProperties must be false`);
    }
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    for (const key of Object.keys(properties ?? {})) {
      if (!required.has(key)) {
        errors.push(`${path}: property "${key}" is not required`);
      }
    }
  }

  for (const [key, child] of Object.entries(properties ?? {})) {
    errors.push(...lintStrictSchema(child, `${path}.${key}`));
  }
  if (isSchema(schema.items)) {
    errors.push(...lintStrictSchema(schema.items, `${path}[]`));
  }
  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    const variants = schema[keyword];
    if (Array.isArray(variants)) {
      variants.forEach((variant, index) => errors.push(...lintStrictSchema(variant, `${path}.${keyword}[${index}]`)));
    }
  }
  for (const keyword of ['$defs', 'definitions'] as const) {
    const definitions = schema[keyword];
    if (isSchema(definitions)) {
      for (const [name, definition] of Object.entries(definitions)) {
        errors.push(...lintStrictSchema(definition as JsonSchema, `${path}.${keyword}.${name}`));
      }
    }
  }
  return errors;
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
