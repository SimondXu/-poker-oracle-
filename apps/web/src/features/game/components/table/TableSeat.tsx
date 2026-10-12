'use client';

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ActionTag, BlindTag, Card, DealerButton } from '@/components/poker';
import { useT } from '@/i18n';
import {
  BUTTON_GAP_EM,
  PLATE_RING_EM,
  getHoleCardsHeightEm,
  getHoleCardsWidthEm,
  getTagWidthEm,
  type SeatLayout,
  type TableGeometry,
} from '@/features/game/lib/seat-layout';
import { DEAL_STAGGER_SEC } from '@/features/game/lib/table-animation';
import type { OccupiedSeatViewModel, SeatTimer, SeatViewModel } from '@/features/game/lib/table-view-model';
import { cn, formatChips } from '@/lib/utils';
import { getActionLabel, getCardName, getSeatAriaLabel } from './table-copy';

export interface TableSeatProps {
  seat: SeatViewModel;
  /** Layout for the current orientation (may differ from seat.layout, which is landscape). */
  layout: SeatLayout;
  geometry: TableGeometry;
  handNumber: number;
  isDealing: boolean;
  secondPassDelaySec: number;
  reducedMotion: boolean;
  /** Some seat is acting now: the others dim one step. */
  hasActor: boolean;
}

const BLIND_TAG_CLASS = 'shrink-0 text-seat-micro';
const QUIET_LABEL_CLASS = 'label-index truncate text-seat-micro text-on-ivory-2';
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * One seat on the rail: ivory plate, hole cards on the side away from the
 * felt edge, and a tag slot on the other side (last-action stamp, the hero's
 * turn label, or the shown hand at showdown). Every part has a fixed em box
 * from `seat-layout`, tagged with `data-layout-box` for the overlap checker.
 *
 * State vocabulary: to-act = vermilion ring, lift, timer; waiting = ivory;
 * folded = plate sunk one ink step; all-in = vermilion stamp; winner = brass
 * rule + payout. While someone acts, every other seat dims one step.
 */
/** The seat draws an ivory plate (and so carries its own dealer disc); empty / out seats draw a dashed ring. */
export function hasSeatPlate(seat: SeatViewModel): boolean {
  return seat.kind === 'player' && seat.status !== 'out' && seat.status !== 'sitting_out';
}

/** The plate shows its state ring (to-act vermilion, winner brass); cards and tag step out by PLATE_RING_EM. */
function hasRing(seat: OccupiedSeatViewModel): boolean {
  return seat.isWinner || seat.isActor;
}

export const TableSeat = memo(function TableSeat(props: TableSeatProps) {
  const { seat, layout, geometry, hasActor, reducedMotion } = props;
  const t = useT();

  if (seat.kind === 'empty' || !hasSeatPlate(seat)) {
    return (
      <div
        role="group"
        aria-label={seat.kind === 'empty' ? t('table.seat.empty', { index: seat.seatIndex + 1 }) : getSeatAriaLabel(t, seat)}
        data-layout-box="empty-seat"
        className="absolute size-[2.4em] rounded-full border border-dashed border-ivory/15"
        style={{ left: `${layout.seat.x}%`, top: `${layout.seat.y}%`, marginLeft: '-1.2em', marginTop: '-1.2em' }}
      />
    );
  }

  const { metrics } = geometry;
  const plate = layout.isAnchor ? metrics.heroPlate : metrics.plate;
  const lifted = seat.isActor;
  // One ink step: losers / out at showdown sink further than "waiting while someone else acts".
  const dimStep = seat.isDimmed
    ? 'brightness-[0.7] saturate-[0.8]'
    : hasActor && !seat.isActor
      ? 'brightness-[0.82] saturate-[0.9]'
      : undefined;

  return (
    <div
      role="group"
      aria-label={getSeatAriaLabel(t, seat)}
      className={cn(
        'absolute',
        seat.isActor ? 'z-20' : 'z-[16]',
        !reducedMotion && 'transition-[translate,filter] duration-180',
        dimStep,
      )}
      style={{
        left: `${layout.seat.x}%`,
        top: `${layout.seat.y}%`,
        width: `${plate.w}em`,
        height: `${plate.h}em`,
        marginLeft: `${-plate.w / 2}em`,
        marginTop: `${-plate.h / 2}em`,
        translate: lifted ? `0 ${-metrics.actorLift}em` : '0 0',
        transitionTimingFunction: EASE_OUT,
      }}
    >
      <SeatHoleCards {...props} seat={seat} />
      <SeatPlate seat={seat} geometry={geometry} reducedMotion={reducedMotion} />
      <SeatTag seat={seat} layout={layout} geometry={geometry} />
      {seat.isButton && <SeatDealerDisc side={layout.buttonSide} size={metrics.button} />}
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
  const t = useT();
  const { metrics } = geometry;
  const isThinking = seat.isActor && seat.isBot;

  return (
    <div
      data-layout-box="seat-plate"
      className={cn(
        'relative z-10 flex h-full w-full flex-col justify-center gap-[0.12em] overflow-hidden rounded-[var(--radius-panel)] px-[0.62em]',
        seat.isFolded ? 'bg-ivory-shade text-on-ivory-2' : 'bg-ivory text-on-ivory',
        // Fine printed rule inside the stock; the state ring sits outside it.
        'shadow-[inset_0_0_0_1px_var(--color-ivory-edge),inset_0_0_0_0.18em_var(--plate-ground),inset_0_0_0_calc(0.18em+1px)_rgb(107_100_80/0.28),var(--shadow-plate)]',
        seat.isFolded ? '[--plate-ground:var(--color-ivory-shade)]' : '[--plate-ground:var(--color-ivory)]',
        // Ring = outline 0.16em + offset 0.08em = PLATE_RING_EM.
        'outline-offset-[0.08em]',
        seat.isWinner && 'outline-[0.16em] outline-solid outline-brass',
        !seat.isWinner && seat.isActor && 'outline-[0.16em] outline-solid outline-vermilion',
      )}
    >
      {/* Fixed row heights keep the name and stack on the same line on every plate; text truncates inside. */}
      <div className="text-seat-name flex h-[1.2em] min-w-0 items-center gap-[0.3em]">
        <span className="min-w-0 flex-1 truncate font-semibold" title={seat.name}>
          {seat.name}
        </span>
        {isThinking && <ThinkingDots reducedMotion={reducedMotion} label={t('table.seat.thinking')} />}
        {!geometry.compact && <SeatBlindTag seat={seat} />}
      </div>
      <div
        className="flex h-[1.25em] min-w-0 items-center justify-between gap-[0.4em]"
        style={{ fontSize: `${metrics.stackText}em` }}
      >
        <span className="flex min-w-0 items-center">
          <PlateStateLabel seat={seat} compact={geometry.compact} />
        </span>
        <span className="font-index text-seat-stack shrink-0 font-bold">{formatChips(seat.stack)}</span>
      </div>
      {seat.isWinner && <span aria-hidden className="absolute inset-x-[0.62em] top-[0.24em] h-[0.1em] bg-brass" />}
      {seat.timer && <SeatTimerBar key={seat.timer.startedAt} timer={seat.timer} />}
    </div>
  );
}

function SeatBlindTag({ seat }: { seat: OccupiedSeatViewModel }) {
  const t = useT();
  if (seat.isSB) return <BlindTag kind="SB" label={t('table.seat.sb')} className={BLIND_TAG_CLASS} />;
  if (seat.isBB) return <BlindTag kind="BB" label={t('table.seat.bb')} className={BLIND_TAG_CLASS} />;
  return null;
}

/**
 * Left of the stack: winner payout, else the all-in stamp, folded label, the
 * bot's personality stamp, or the quiet "Stack" label. Phone plates have no
 * room for a word beside the name, so there the blind tag moves here first.
 */
function PlateStateLabel({ seat, compact }: { seat: OccupiedSeatViewModel; compact: boolean }) {
  const t = useT();
  if (seat.isWinner && seat.payout !== null) {
    return <span className="font-index text-seat-amount font-bold text-on-ivory">+{formatChips(seat.payout)}</span>;
  }
  if (seat.status === 'all_in') {
    return (
      <span className="label-index text-seat-micro tracking-caps-tight inline-block rotate-[-3deg] rounded-[var(--radius-stamp)] bg-vermilion px-[0.4em] py-[0.08em] font-bold leading-none text-ivory">
        {t('table.seat.allIn')}
      </span>
    );
  }
  // Phone plates are too narrow for a word next to the stack: the sunk plate says "folded" there.
  if (seat.isFolded) {
    return compact ? null : <span className={QUIET_LABEL_CLASS}>{t('table.seat.folded')}</span>;
  }
  if (compact && (seat.isSB || seat.isBB)) {
    return <SeatBlindTag seat={seat} />;
  }
  // Phone plates have no room for the stamp beside the stack (it truncated to "L…"); the Opponents tab names the style.
  if (seat.personality && !compact) {
    return (
      <span
        title={t(`table.personality.${seat.personality}.full`)}
        className="label-index text-seat-micro tracking-caps-tight truncate rounded-[var(--radius-stamp)] border border-on-ivory-2/70 px-[0.34em] py-[0.08em] font-bold italic leading-none text-on-ivory-2"
      >
        {t(`table.personality.${seat.personality}`)}
      </span>
    );
  }
  return compact ? null : <span className={QUIET_LABEL_CLASS}>{t('table.seat.stack')}</span>;
}

/** Tag slot on the side away from the cards: shown hand at showdown, the hero's turn, else the last action. */
function SeatTag({ seat, layout, geometry }: { seat: OccupiedSeatViewModel; layout: SeatLayout; geometry: TableGeometry }) {
  const t = useT();
  const { tag } = geometry.metrics;
  const tagW = getTagWidthEm(geometry.metrics, layout.isAnchor);
  const gap = geometry.metrics.tagGap + (hasRing(seat) ? PLATE_RING_EM : 0);
  const position: CSSProperties = {
    width: `${tagW}em`,
    height: `${tag.h}em`,
    marginLeft: `${-tagW / 2}em`,
    ...(layout.cardsAbove ? { top: `calc(100% + ${gap}em)` } : { bottom: `calc(100% + ${gap}em)` }),
  };
  // Ink hugs the edge facing the plate, so every stamp sits tagGap from it whatever its height.
  const slot = cn('absolute left-1/2 z-20 flex justify-center', layout.cardsAbove ? 'items-start' : 'items-end');
  // Rotated stamps pivot on the corner nearest the plate, so the tilt swings away from it.
  const pivot = layout.cardsAbove ? 'origin-top-right' : 'origin-bottom-left';
  const enter = 'animate-[table-fade-in_150ms_cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none';

  if (seat.handCategory) {
    return (
      <div data-layout-box="hand-name" className={cn(slot, enter)} style={position}>
        <span
          className={cn(
            'label-index text-seat-tag tracking-caps-tight max-w-full truncate rounded-[var(--radius-stamp)] px-[0.6em] py-[0.32em] font-bold',
            seat.isWinner ? 'bg-brass text-ink-1' : 'bg-ink-1/85 text-ivory',
          )}
        >
          {t(`table.hand.${seat.handCategory}`)}
        </span>
      </div>
    );
  }

  if (seat.isHero && seat.timer) {
    return (
      <div data-layout-box="action-tag" className={cn(slot, enter)} style={position}>
        <span className="label-index text-seat-tag tracking-caps flex max-w-full items-baseline gap-[0.5em] overflow-hidden whitespace-nowrap font-bold text-vermilion-hi">
          <span className="truncate">{t('table.seat.yourTurn')}</span>
          <TimerSeconds key={seat.timer.startedAt} timer={seat.timer} />
        </span>
      </div>
    );
  }

  if (seat.lastAction) {
    return (
      <div data-layout-box="action-tag" className={cn(slot, enter)} style={position}>
        <ActionTag
          kind={seat.lastAction.kind}
          label={getActionLabel(t, seat.lastAction)}
          className={cn('text-seat-tag max-w-full overflow-hidden', pivot)}
        />
      </div>
    );
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
  const t = useT();
  const { metrics, center } = geometry;
  // Compact (phone) layout: opponents are plate-only until their cards are shown.
  const cards = metrics.showFaceDownBacks || seat.showCards || seat.isHero ? seat.holeCards : [];
  if (cards.length === 0) {
    return null;
  }

  const isAnchor = layout.isAnchor;
  const cardFont = isAnchor ? metrics.heroCard : metrics.seatCard;
  const cardGap = metrics.cardGap + (hasRing(seat) ? PLATE_RING_EM : 0);
  const bestCardSet = new Set(seat.bestCards);
  const hasBestCards = bestCardSet.size > 0;
  const dealDx = center.x - layout.seat.x;
  const dealDy = center.y - layout.seat.y;

  return (
    <div
      data-layout-box="hole-cards"
      className={cn(
        'absolute left-1/2 z-0 flex justify-center',
        layout.cardsAbove ? 'items-end' : 'items-start',
        !reducedMotion && 'transition-[top,bottom] duration-180',
      )}
      style={{
        width: `${getHoleCardsWidthEm(metrics, isAnchor)}em`,
        height: `${getHoleCardsHeightEm(metrics, isAnchor)}em`,
        marginLeft: `${-getHoleCardsWidthEm(metrics, isAnchor) / 2}em`,
        gap: `${isAnchor ? metrics.heroCardGap : metrics.seatCardGap}em`,
        ...(layout.cardsAbove ? { bottom: `calc(100% + ${cardGap}em)` } : { top: `calc(100% + ${cardGap}em)` }),
        transitionTimingFunction: EASE_OUT,
      }}
    >
      {cards.map((card, index) => {
        const isHighlighted = card !== null && bestCardSet.has(card);
        const style: CSSProperties = { fontSize: `${cardFont}em` };
        if (isDealing && !reducedMotion) {
          Object.assign(style, {
            '--deal-dx': `${dealDx}cqw`,
            '--deal-dy': `${dealDy}cqh`,
            animation: `table-deal-in 200ms ${EASE_OUT} both`,
            animationDelay: `${seat.dealOrder * DEAL_STAGGER_SEC + index * secondPassDelaySec}s`,
          });
        }

        return (
          <Card
            key={`${handNumber}-${seat.seatIndex}-${index}`}
            card={card}
            size={isAnchor ? 'xl' : 'sm'}
            faceDown={card === null}
            label={card === null ? t('table.card.faceDown') : getCardName(t, card)}
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

/** Dealer disc beside the plate, BUTTON_GAP_EM clear and vertically centered on it; lifts and dims with the seat. */
function SeatDealerDisc({ side, size }: { side: SeatLayout['buttonSide']; size: number }) {
  const t = useT();
  const offset = `calc(100% + ${BUTTON_GAP_EM}em)`;
  return (
    <div
      data-layout-box="dealer"
      className="absolute top-1/2 z-[15] flex -translate-y-1/2 items-center justify-center"
      style={{ width: `${size}em`, height: `${size}em`, ...(side === 'right' ? { left: offset } : { right: offset }) }}
    >
      {/* DealerButton is 1.6em of its font-size. */}
      <span className="flex" style={{ fontSize: `${size / 1.6}em` }}>
        <DealerButton label={t('table.dealer')} />
      </span>
    </div>
  );
}

function ThinkingDots({ reducedMotion, label }: { reducedMotion: boolean; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex shrink-0 items-center gap-[0.15em]">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-[0.3em] rounded-full bg-vermilion-ink/80"
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

function remainingMs(timer: SeatTimer): number {
  return Math.max(0, timer.startedAt + timer.durationMs - Date.now());
}

/** Whole seconds left on the turn clock, ticking 4× a second. Remounted per turn via key. */
function TimerSeconds({ timer }: { timer: SeatTimer }) {
  const [seconds, setSeconds] = useState(() => Math.ceil(remainingMs(timer) / 1000));
  useEffect(() => {
    const id = setInterval(() => setSeconds(Math.ceil(remainingMs(timer) / 1000)), 250);
    return () => clearInterval(id);
  }, [timer]);
  const t = useT();
  // The unit stays lowercase ("29s") inside the tracked-caps label.
  return <span className="font-index shrink-0 tracking-normal normal-case tabular-nums">{t('table.seat.seconds', { seconds })}</span>;
}

/**
 * Turn clock: a 3–4px vermilion bar along the plate's bottom edge draining
 * left to right. WAAPI from the fraction already left (linear: it is a clock);
 * kept under reduced motion since it is a slow progress bar, not a slide.
 */
function SeatTimerBar({ timer }: { timer: SeatTimer }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof element.animate !== 'function') return;
    const left = remainingMs(timer);
    const fraction = timer.durationMs > 0 ? left / timer.durationMs : 0;
    const animation = element.animate([{ transform: `scaleX(${fraction})` }, { transform: 'scaleX(0)' }], {
      duration: Math.max(1, left),
      easing: 'linear',
      fill: 'forwards',
    });
    return () => animation.cancel();
  }, [timer]);

  return (
    <div className="absolute inset-x-0 bottom-0 h-[clamp(3px,0.32em,4px)] bg-vermilion/20" aria-hidden>
      <div ref={ref} className="h-full w-full origin-left bg-vermilion" />
    </div>
  );
}
