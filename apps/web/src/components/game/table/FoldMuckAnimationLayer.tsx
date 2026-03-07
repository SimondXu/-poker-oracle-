'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { PlayingCard } from '../cards/PlayingCard';

export interface FoldMuckEvent {
  id: string;
  xPct: number;
  yPct: number;
  cards: string[];
  faceDown: boolean;
}

interface FoldMuckAnimationLayerProps {
  events: FoldMuckEvent[];
  onDone: (id: string) => void;
}

const MUCK_POSITION = { xPct: 52, yPct: 47.5 };

export const FoldMuckAnimationLayer = memo(function FoldMuckAnimationLayer({
  events,
  onDone,
}: FoldMuckAnimationLayerProps) {
  if (events.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[12]">
      {events.map((event, index) => (
        <motion.div
          key={event.id}
          initial={{
            left: `${event.xPct}%`,
            top: `${event.yPct}%`,
            opacity: 0.98,
            rotate: -8,
            scale: 1,
          }}
          animate={{
            left: [
              `${event.xPct}%`,
              `${(event.xPct + MUCK_POSITION.xPct) / 2}%`,
              `${MUCK_POSITION.xPct}%`,
            ],
            top: [
              `${event.yPct}%`,
              `calc(${Math.min(event.yPct, MUCK_POSITION.yPct)}% - 14px)`,
              `${MUCK_POSITION.yPct}%`,
            ],
            opacity: [0.98, 1, 0.26, 0],
            rotate: [-8, 8, -18],
            scale: [1, 0.96, 0.68],
          }}
          transition={{
            duration: 0.78,
            delay: index * 0.05,
            times: [0, 0.52, 1],
            ease: [0.18, 0.84, 0.34, 1],
          }}
          onAnimationComplete={() => onDone(event.id)}
          className="absolute -translate-x-1/2 -translate-y-1/2"
        >
          <div className="relative">
            <motion.div
              initial={{ rotate: -7 }}
              animate={{ rotate: [-7, -16] }}
              transition={{ duration: 0.74, ease: 'easeOut' }}
              className="absolute left-0 top-0"
            >
              <PlayingCard
                {...(event.cards[0] ? { card: event.cards[0] } : {})}
                size="xs"
                faceDown={event.faceDown || !event.cards[0]}
              />
            </motion.div>
            <motion.div
              initial={{ rotate: 8, x: 20, y: 4 }}
              animate={{ rotate: [8, 18], x: [20, 16], y: [4, 6] }}
              transition={{ duration: 0.74, ease: 'easeOut' }}
            >
              <PlayingCard
                {...(event.cards[1] ? { card: event.cards[1] } : {})}
                size="xs"
                faceDown={event.faceDown || !event.cards[1]}
              />
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0.3, scale: 1 }}
            animate={{ opacity: [0.3, 0.12, 0], scale: [1, 1.2, 1.32] }}
            transition={{ duration: 0.7 }}
            className="absolute inset-0 rounded-full bg-black/40 blur-md"
          />
        </motion.div>
      ))}
    </div>
  );
});
