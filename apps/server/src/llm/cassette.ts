import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type CassetteConfig = { mode: 'off' } | { mode: 'record' | 'replay'; dir: string };

/** What a cassette file holds: the request body and the raw response, never headers or keys. */
interface CassetteEntry {
  model: string;
  request: unknown;
  response: string;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function cassetteKey(model: string, body: unknown): string {
  return createHash('sha256').update(`${model}\n${canonicalJson(body)}`).digest('hex');
}

export async function readCassette(dir: string, key: string): Promise<string | null> {
  try {
    const entry = JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8')) as CassetteEntry;
    return entry.response;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeCassette(dir: string, key: string, entry: CassetteEntry): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${key}.json`), `${JSON.stringify(entry, null, 2)}\n`);
}
