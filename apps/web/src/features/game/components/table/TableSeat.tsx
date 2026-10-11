'use client';

import { memo, useState, type CSSProperties } from 'react';
import { ActionTag, BlindTag, Card } from '@/components/poker';
import { CARDS_BELOW_GAP_EM, getHoleCardsWidthEm, type SeatLayout, type TableGeometry } from '@/features/game/lib/seat-layout';
import type { OccupiedSeatViewModel, SeatTimer, SeatViewModel } from '@/features/game/lib/table-view-model';
import { cn, formatChips } from '@/lib/utils';

export interface TableSeatProps {
  seat: SeatViewModel;
  /** Layout for the current orientation (may differ from seat.layout, which is landscape). */
  layout: SeatLayout;
  geometry: TableGeometry;
  handNumber: number;
  isDealing: boolean;
  secondPassDelaySec: number;
  reducedMotion: boolean;
}

const DEAL_STAGGER_SEC = 0.14;
/** Hero hole cards fan out by ± this angle. */
const HERO_FAN_DEG = 4;

const STATUS_TEXT: Record<OccupiedSeatViewModel['status'], string> = {
  active: 'in hand',
  folded: 'folded',
  all_in: 'all in',
  out: 'out',
  sitting_out: 'sitting out',
};

function anchorStyle(layout: SeatLayout): CSSProperties {
  return { left: `${layout.seat.x}%`, top: `${layout.seat.y}%` };
}

export function getSeatAriaLabel(seat: OccupiedSeatViewModel): string {
  const parts = [
    seat.isHero ? `${seat.name} (you)` : seat.name,
    `stack ${formatChips(seat.stack)}`,
    STATUS_TEXT[seat.status],
  ];
  if (seat.isButton) parts.push('dealer');
  if (seat.isActor) parts.push('to act');
  if (seat.lastAction) parts.push(`last action ${seat.lastAction.label}`);
  if (seat.isWinner) parts.push(seat.payout !== null ? `wins ${formatChips(seat.payout)}` : 'winner');
  if (seat.handName) parts.push(seat.handName);
  return parts.join(', ');
}

/**
 * PokerNow-style seat: hole cards peeking out from behind a light name plate,
 * with the last action (or the shown hand's name) on the other side of the plate.
 */
export const TableSeat = memo(function TableSeat(props: TableSeatProps) {
  const { seat, layout, geometry } = props;

  if (seat.kind === 'empty' || seat.status === 'out' || seat.status === 'sitting_out') {
    return (
      <div
        role="group"
        aria-label={seat.kind === 'empty' ? `Seat ${seat.seatIndex + 1}, empty` : getSeatAriaLabel(seat)}
        className="absolute size-[2.6em] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/20"
        style={anchorStyle(layout)}
      />
    );
  }

  const { metrics } = geometry;
  const plate = layout.isAnchor ? metrics.heroPlate : metrics.plate;

  return (
    <div
      role="group"
      aria-label={getSeatAriaLabel(seat)}
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 transition-[filter] duration-150 motion-reduce:transition-none',
        seat.isFolded ? 'brightness-60' : seat.isDimmed && 'brightness-75',
      )}
      style={{ ...anchorStyle(layout), width: `${plate.w}em`, height: `${plate.h}em` }}
    >
      <SeatHoleCards {...props} seat={seat} />
      <SeatPlate seat={seat} geometry={geometry} reducedMotion={props.reducedMotion} />
      <SeatTag seat={seat} layout={layout} geometry={geometry} />
    </div>
  );
});

function SeatPlate({
  seat,
  geometry,
  reducedMotion,
}: {
  seat: OccupiedSeatViewModel;
  geometry: TableGeometry;
  reducedMotion: boolean;
}) {
  const { metrics } = geometry;
  const isThinking = seat.isActor && seat.isBot;

  return (
    <div
      className={cn(
        'relative z-10 flex h-full w-full flex-col justify-center overflow-hidden rounded-[var(--radius-panel)] bg-plate px-[0.6em] text-plate-text shadow-[var(--shadow-plate)]',
        'outline-offset-[0.06em]',
        seat.isWinner && 'bg-[color-mix(in_srgb,var(--color-plate)_82%,var(--color-raise))] outline-[0.16em] outline-solid outline-raise',
        !seat.isWinner && seat.isActor && 'outline-[0.14em] outline-solid outline-chip',
      )}
    >
      <div className="flex min-w-0 items-center gap-[0.3em]" style={{ fontSize: `${metrics.nameText}em` }}>
        <span className="min-w-0 flex-1 truncate font-semibold leading-[1.2]">{seat.name}</span>
        {isThinking && <ThinkingDots reducedMotion={reducedMotion} />}
        {seat.isSB && <BlindTag kind="SB" />}
        {seat.isBB && <BlindTag kind="BB" />}
      </div>
      <div
        className="flex items-center justify-between gap-[0.3em] leading-[1.2]"
        style={{ fontSize: `${metrics.stackText}em` }}
      >
        {seat.status === 'all_in' ? (
          <span className="rounded-full bg-fold px-[0.45em] py-[0.05em] text-[0.7em] font-extrabold tracking-wide text-white">
            ALL IN
          </span>
        ) : (
          <span className="font-bold tabular-nums">{formatChips(seat.stack)}</span>
        )}
        {seat.isWinner && seat.payout !== null && (
          <span className="text-[0.85em] font-extrabold tabular-nums text-raise">+{formatChips(seat.payout)}</span>
        )}
      </div>
      {seat.timer && <SeatTimerBar key={seat.timer.startedAt} timer={seat.timer} />}
    </div>
  );
}

/** Tag slot on the side of the plate away from the cards: shown-hand name at showdown, else last action. */
function SeatTag({ seat, layout, geometry }: { seat: OccupiedSeatViewModel; layout: SeatLayout; geometry: TableGeometry }) {
  const position = cn(
    'absolute left-1/2 z-20 -translate-x-1/2 animate-[table-fade-in_150ms_ease-out] motion-reduce:animate-none',
  );
  const offset: CSSProperties = layout.cardsAbove
    ? { top: `calc(100% + ${geometry.metrics.tagGap}em)` }
    : { bottom: `calc(100% + ${geometry.metrics.tagGap}em)` };

  if (seat.handName) {
    return (
      <span
        className={cn(
          position,
          'max-w-[13em] truncate whitespace-nowrap rounded-full px-[0.6em] py-[0.25em] text-[0.7em] font-semibold leading-none',
          seat.isWinner ? 'bg-raise text-white' : 'bg-black/55 text-text',
        )}
        style={offset}
        title={seat.handName}
      >
        {seat.handName}
      </span>
    );
  }

  if (seat.lastAction) {
    return <ActionTag kind={seat.lastAction.kind} label={seat.lastAction.label} className={position} style={offset} />;
  }

  return null;
}

function SeatHoleCards({
  seat,
  layout,
  geometry,
  handNumber,
  isDealing,
  secondPassDelaySec,
  reducedMotion,
}: TableSeatProps & { seat: OccupiedSeatViewModel }) {
  const { metrics, center } = geometry;
  // Compact (phone) layout: opponents are plate-only until their cards are shown.
  const cards = metrics.showFaceDownBacks || seat.showCards ? seat.holeCards : [];
  if (cards.length === 0) {
    return null;
  }

  const isAnchor = layout.isAnchor;
  const cardFont = isAnchor ? metrics.heroCard : metrics.seatCard;
  const tuck = isAnchor ? metrics.heroCardTuck : metrics.seatCardTuck;
  const bestCardSet = new Set(seat.bestCards);
  const hasBestCards = bestCardSet.size > 0;
  const dealDx = center.x - layout.seat.x;
  const dealDy = center.y - layout.seat.y;

  return (
    <div
      className="absolute left-1/2 z-0 flex -translate-x-1/2"
      style={{
        width: `${getHoleCardsWidthEm(metrics, isAnchor)}em`,
        gap: isAnchor ? undefined : `${metrics.seatCardGap}em`,
        ...(layout.cardsAbove ? { bottom: `calc(100% - ${tuck}em)` } : { top: `calc(100% + ${CARDS_BELOW_GAP_EM}em)` }),
      }}
    >
      {cards.map((card, index) => {
        const isHighlighted = card !== null && bestCardSet.has(card);
        const style: CSSProperties = { fontSize: `${cardFont}em` };
        if (isAnchor) {
          style.rotate = `${index === 0 ? -HERO_FAN_DEG : HERO_FAN_DEG}deg`;
          style.transformOrigin = '50% 100%';
          if (index > 0) style.marginLeft = `-${metrics.heroCardFanOverlap / cardFont}em`;
        }
        if (isDealing && !reducedMotion) {
          Object.assign(style, {
            '--deal-dx': `${dealDx}cqw`,
            '--deal-dy': `${dealDy}cqh`,
            animation: 'table-deal-in 180ms ease-out both',
            animationDelay: `${seat.dealOrder * DEAL_STAGGER_SEC + index * secondPassDelaySec}s`,
          });
        }

        return (
          <Card
            key={`${handNumber}-${seat.seatIndex}-${index}`}
            card={card}
            faceDown={card === null}
            highlight={isHighlighted}
            dim={hasBestCards && card !== null && !bestCardSet.has(card)}
            // Cards hanging below the plate drop toward the felt instead of lifting into the plate.
            className={isHighlighted && !layout.cardsAbove ? 'translate-y-[0.3em]' : undefined}
            style={style}
          />
        );
      })}
    </div>
  );
}

function ThinkingDots({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-[0.15em]">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-[0.32em] rounded-full bg-plate-text/70"
          style={
            reducedMotion
              ? undefined
              : { animation: 'thinking-dot 1.2s ease-in-out infinite', animationDelay: `${index * 0.15}s` }
          }
        />
      ))}
    </span>
  );
}

function SeatTimerBar({ timer }: { timer: SeatTimer }) {
  // Negative delay starts the CSS drain at the time already elapsed; remounted per turn via key.
  // Kept under reduced motion: it is a slow linear progress bar, not a slide.
  const [elapsedMs] = useState(() => Math.max(0, Date.now() - timer.startedAt));

  return (
    <div className="absolute inset-x-0 bottom-0 h-[0.24em] bg-black/10" aria-hidden>
      <div
        className="h-full w-full origin-left"
        style={{
          animation: `table-timer-drain ${timer.durationMs}ms linear forwards`,
          animationDelay: `-${elapsedMs}ms`,
        }}
      />
    </div>
  );
}
