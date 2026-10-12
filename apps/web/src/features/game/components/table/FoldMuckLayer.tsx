'use client';

import { memo, useEffect, type CSSProperties } from 'react';
import { Card } from '@/components/poker';
import type { LayoutPoint } from '@/features/game/lib/seat-layout';
import type { FoldMuckEvent } from './useFoldMuckEvents';

interface FoldMuckLayerProps {
  events: readonly FoldMuckEvent[];
  /** Where each seat's cards start (stage percent). */
  positionOf: (seatIndex: number) => LayoutPoint | undefined;
  /** Muck point (table center). */
  muck: LayoutPoint;
  cardFontEm: number;
  reducedMotion: boolean;
  onDone: (id: string) => void;
}

/**
 * Folded cards slide from the seat into the middle and fade (200ms). Uses the
 * shared `table-deal-in` keyframe played in reverse: the element sits at the
 * seat and the keyframe's `from` offset points at the muck.
 */
export const FoldMuckLayer = memo(function FoldMuckLayer({
  events,
  positionOf,
  muck,
  cardFontEm,
  reducedMotion,
  onDone,
}: FoldMuckLayerProps) {
  useEffect(() => {
    if (reducedMotion) {
      for (const event of events) onDone(event.id);
    }
  }, [events, onDone, reducedMotion]);

  if (reducedMotion || events.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[12]">
      {events.map((event) => {
        const from = positionOf(event.seatIndex);
        if (!from) return null;
        const style = {
          '--deal-dx': `${muck.x - from.x}cqw`,
          '--deal-dy': `${muck.y - from.y}cqh`,
          animation: 'table-deal-in 200ms ease-in reverse both',
        } as CSSProperties;
        return (
          <div
            key={event.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${from.x}%`, top: `${from.y}%` }}
          >
            <div className="flex gap-[0.1em]" style={style} onAnimationEnd={() => onDone(event.id)}>
              {[0, 1].map((index) => (
                <Card
                  key={index}
                  card={event.cards[index]}
                  size="sm"
                  faceDown={event.faceDown || !event.cards[index]}
                  style={{ fontSize: `${cardFontEm}em` }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
});
