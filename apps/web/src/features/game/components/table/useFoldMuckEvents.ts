'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FoldViewModel } from '@/features/game/lib/table-view-model';

export interface FoldMuckEvent {
  id: string;
  seatIndex: number;
  /** Hero's own cards (face-up while mucking), else []. */
  cards: readonly string[];
  faceDown: boolean;
}

/** Turns view-model folds into one-shot muck animation events (each fold id plays once per hand). */
export function useFoldMuckEvents(handId: string, handNumber: number, folds: readonly FoldViewModel[]) {
  const [events, setEvents] = useState<FoldMuckEvent[]>([]);
  const seenRef = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });

  useEffect(() => {
    const handKey = `${handId}-${handNumber}`;
    if (seenRef.current.key !== handKey) {
      seenRef.current = { key: handKey, ids: new Set() };
      setEvents([]);
    }

    const seen = seenRef.current.ids;
    const next: FoldMuckEvent[] = [];
    for (const fold of folds) {
      if (seen.has(fold.id)) continue;
      seen.add(fold.id);
      next.push({ id: fold.id, seatIndex: fold.seatIndex, cards: fold.cards, faceDown: fold.faceDown });
    }
    if (next.length > 0) {
      setEvents((current) => [...current, ...next]);
    }
  }, [folds, handId, handNumber]);

  const onDone = useCallback((id: string) => {
    setEvents((current) => current.filter((event) => event.id !== id));
  }, []);

  return { events, onDone };
}
