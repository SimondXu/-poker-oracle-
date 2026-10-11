'use client';

import { memo, useState, type CSSProperties } from 'react';
import { ChipBubble } from '@/components/poker';
import type { LayoutPoint } from '@/features/game/lib/seat-layout';

export interface PotAwardChip {
  playerId: string;
  to: LayoutPoint;
  amount: number;
}

interface PotAwardLayerProps {
  chips: readonly PotAwardChip[];
  from: LayoutPoint;
  /** Same gating as v1 PotToWinnerAnimation: plays while active, replays when triggerKey changes. */
  active: boolean;
  triggerKey: string;
  reducedMotion: boolean;
}

/** Pot slides to each winner as a yellow chip bubble (220ms), then disappears. */
export const PotAwardLayer = memo(function PotAwardLayer({ chips, from, active, triggerKey, reducedMotion }: PotAwardLayerProps) {
  if (!active || reducedMotion || chips.length === 0) return null;
  return <PotAwardRun key={triggerKey} chips={chips} from={from} />;
});

function PotAwardRun({ chips, from }: { chips: readonly PotAwardChip[]; from: LayoutPoint }) {
  const [finished, setFinished] = useState<ReadonlySet<string>>(() => new Set());

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[11]">
      {chips.map((chip, index) => {
        if (finished.has(chip.playerId)) return null;
        const style = {
          '--deal-dx': `${from.x - chip.to.x}cqw`,
          '--deal-dy': `${from.y - chip.to.y}cqh`,
          animation: 'table-deal-in 220ms ease-out both',
          animationDelay: `${index * 60}ms`,
        } as CSSProperties;
        return (
          <div
            key={chip.playerId}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${chip.to.x}%`, top: `${chip.to.y}%` }}
          >
            <div
              style={style}
              onAnimationEnd={() =>
                // Hold the chip on the plate briefly, then drop it; the plate shows the payout.
                setTimeout(() => setFinished((current) => new Set(current).add(chip.playerId)), 250)
              }
            >
              <ChipBubble amount={chip.amount} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
