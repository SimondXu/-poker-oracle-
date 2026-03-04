import type { EngineResult } from '../state/types.ts';

export function ok<T, E = never>(value: T): EngineResult<T, E> {
  return { ok: true, value };
}

export function err<T = never, E = string>(error: E): EngineResult<T, E> {
  return { ok: false, error };
}
