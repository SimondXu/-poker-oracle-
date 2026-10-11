'use client';

import type { CSSProperties } from 'react';
import { Card, Chip, DealerButton } from '@/components/poker';
import { useT } from '@/i18n';

/** Slot outline for an undealt board card (same box as a Card, dashed brass). */
function EmptySlot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[3.5em] w-[2.5em] rounded-[var(--radius-card)] border border-dashed border-brass/40 ${className ?? ''}`}
    />
  );
}

function pos(left: number, top: number, rotate = 0): CSSProperties {
  return { left: `${left}%`, top: `${top}%`, transform: `translate(-50%, -50%) rotate(${rotate}deg)` };
}

/**
 * A composed table scene for the home page: felt oval, a flop, the hero's two cards fanned over the rail,
 * face-down opponents, chips and the dealer disc. All real Card/Chip components, no numbers, no copy.
 * Everything is sized in em of a container-relative font size, so it scales with its box.
 */
export function HomeScene() {
  const t = useT();

  return (
    <div
      role="img"
      aria-label={t('lobby.home.sceneLabel')}
      data-layout-box="home-hero"
      className="@container relative isolate w-full"
    >
      <div className="relative aspect-[7/4] w-full text-[3.4cqw] lg:aspect-[5/4] lg:text-[3.3cqw]" aria-hidden>
        {/* Felt oval with its rail, cropped by the box like a photograph of the table. */}
        <div className="absolute inset-x-[2%] inset-y-[4%] rounded-[50%] border-[0.9em] border-rail bg-felt felt-guilloche shadow-[0_1.2em_2.4em_-0.6em_rgb(0_0_0/0.55)]" />
        <div className="absolute inset-x-[2%] inset-y-[4%] rounded-[50%] shadow-[inset_0_0_0_0.12em_rgb(184_154_94/0.35)]" />

        {/* Opponents' hands, face down, tucked under the rail at the top. */}
        <div className="absolute" style={pos(27, 20, -10)}>
          <Card faceDown size="md" className="-mr-[1.1em] -rotate-6" />
          <Card faceDown size="md" className="rotate-[7deg]" />
        </div>
        <div className="absolute" style={pos(73, 20, 10)}>
          <Card faceDown size="md" className="-mr-[1.1em] -rotate-6" />
          <Card faceDown size="md" className="rotate-[7deg]" />
        </div>

        {/* Flop and two empty slots. */}
        <div className="absolute flex items-center gap-[0.5em]" style={pos(50, 43)}>
          <Card card="Kc" size="lg" />
          <Card card="9d" size="lg" />
          <Card card="4c" size="lg" />
          <EmptySlot className="text-[1.125em]" />
          <EmptySlot className="text-[1.125em]" />
        </div>

        {/* Chips: a brass stack and one vermilion raise. */}
        <div className="absolute flex flex-col items-center" style={pos(20, 55)}>
          <Chip className="-mb-[0.62em] text-[2.1em]" />
          <Chip className="-mb-[0.62em] text-[2.1em]" />
          <Chip className="text-[2.1em]" />
        </div>
        <div className="absolute" style={pos(80, 55)}>
          <Chip tone="vermilion" className="text-[2.4em]" />
        </div>

        <div className="absolute" style={pos(33, 76)}>
          <DealerButton className="text-[1.2em]" />
        </div>

        {/* The hero's hand, fanned, hanging over the bottom rail. */}
        <div className="absolute flex items-end" style={pos(54, 85)}>
          <Card card="As" size="xl" className="-mr-[1.7em] origin-bottom -rotate-[8deg]" />
          <Card card="Kh" size="xl" className="origin-bottom rotate-[7deg]" />
        </div>
      </div>
    </div>
  );
}
