'use client';

import { memo, useCallback, useMemo, type CSSProperties } from 'react';
import { Card, ChipBubble, DealerButton, getCardLabel } from '@/components/poker';
import {
  TABLE_GEOMETRIES,
  getBoardSizeEm,
  getPotPoint,
  getSeatLayouts,
  type SeatLayout,
  type TableGeometry,
  type TableOrientation,
} from '@/features/game/lib/seat-layout';
import type { SeatViewModel, TableBoardViewModel, TablePotViewModel } from '@/features/game/lib/table-view-model';
import { cn, formatChips } from '@/lib/utils';
import type { TableStageProps } from '../slots';
import { FoldMuckLayer } from './FoldMuckLayer';
import { PotAwardLayer, type PotAwardChip } from './PotAwardLayer';
import { TableSeat, type TableSeatProps } from './TableSeat';
import { useElementSize, type ElementSize } from './useElementSize';
import { useFoldMuckEvents } from './useFoldMuckEvents';
import { useMediaQuery, usePrefersReducedMotion } from './useMediaQuery';
import { useStaggeredBoardCards } from './useStaggeredBoardCards';

/**
 * Space kept free at the bottom of the stage for the action bar: fixed
 * full-width bar below md, floating bottom-right bar (≈136px + 12px inset) on md+.
 * Dropped when the stage is too short to afford it (then the bar overlaps nothing
 * of ours anyway: e.g. a short aspect-video stage above a fixed bar).
 */
export const ACTION_BAR_RESERVE_PX = { mobile: 84, desktop: 148 } as const;
/** The table turns portrait when the free area is this much taller than wide. */
const PORTRAIT_THRESHOLD = 1.15;

interface StageBox {
  orientation: TableOrientation;
  left: number;
  top: number;
  width: number;
  height: number;
  fontPx: number;
}

function fitStage(size: ElementSize, reservePx: number): StageBox {
  const reserve = size.h - reservePx >= size.h * 0.45 ? reservePx : 0;
  const areaW = size.w;
  const areaH = Math.max(0, size.h - reserve);
  const orientation: TableOrientation = areaH > areaW * PORTRAIT_THRESHOLD ? 'portrait' : 'landscape';
  const geometry = TABLE_GEOMETRIES[orientation];
  const width = Math.min(areaW, areaH * geometry.aspect);
  const height = width / geometry.aspect;
  const fontPx = Math.min(geometry.fontPx.max, Math.max(geometry.fontPx.min, (width * geometry.emPct) / 100));
  return {
    orientation,
    width,
    height,
    left: (areaW - width) / 2,
    // Centered in the whole stage when that still clears the reserve, else flush above it.
    top: Math.max(0, Math.min((size.h - height) / 2, areaH - height)),
    fontPx,
  };
}

/**
 * Table stage: fills its parent, reserves room for the action bar, and keeps a
 * fixed-aspect box (16:9 landscape, 3:5 portrait on phones) centered in the rest.
 * Everything inside is sized in em of the box font-size (≈1.45% of its width
 * landscape, 2.6% portrait), positioned in percent from `seat-layout`.
 */
export const TableStage = memo(function TableStage({ viewModel, className }: TableStageProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const reducedMotion = usePrefersReducedMotion();
  const box = size ? fitStage(size, isMobile ? ACTION_BAR_RESERVE_PX.mobile : ACTION_BAR_RESERVE_PX.desktop) : null;

  return (
    <div ref={ref} className={cn('relative h-full w-full overflow-hidden', className)}>
      {box && box.width > 0 && (
        <div
          className="absolute [container-type:size]"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height, fontSize: box.fontPx }}
        >
          <TableContent viewModel={viewModel} geometry={TABLE_GEOMETRIES[box.orientation]} reducedMotion={reducedMotion} />
        </div>
      )}
    </div>
  );
});

const TableContent = memo(function TableContent({
  viewModel,
  geometry,
  reducedMotion,
}: {
  viewModel: TableStageProps['viewModel'];
  geometry: TableGeometry;
  reducedMotion: boolean;
}) {
  const { seats, board, pot, deal, folds, handId, handNumber } = viewModel;

  // The view model carries landscape layouts; other orientations re-derive them by seat index.
  const layouts = useMemo(
    () =>
      geometry.orientation === 'landscape'
        ? seats.map((seat) => seat.layout)
        : getSeatLayouts(viewModel.seatCount, viewModel.heroSeatIndex, geometry.orientation),
    [geometry.orientation, seats, viewModel.seatCount, viewModel.heroSeatIndex],
  );
  const layoutOf = useCallback((seatIndex: number): SeatLayout | undefined => layouts[seatIndex], [layouts]);

  const buttonLayout = layoutOf(viewModel.buttonSeatIndex);
  const hasWinner = seats.some((seat) => seat.kind === 'player' && seat.isWinner);
  const potPoint = getPotPoint(geometry);
  const muck = useFoldMuckEvents(handId, handNumber, folds);
  const muckPositionOf = useCallback((seatIndex: number) => layoutOf(seatIndex)?.seat, [layoutOf]);

  const awardChips = useMemo(() => {
    const chips: PotAwardChip[] = [];
    for (const target of pot.awardTargets) {
      const seat = seats.find((candidate) => candidate.kind === 'player' && candidate.id === target.playerId);
      const to = seat ? layouts[seat.seatIndex]?.seat : undefined;
      if (seat?.kind === 'player' && to) {
        chips.push({ playerId: target.playerId, to, amount: seat.payout ?? pot.total });
      }
    }
    return chips;
  }, [layouts, pot.awardTargets, pot.total, seats]);

  return (
    <div className="absolute inset-0">
      <TableFelt geometry={geometry} />

      <PotPill pot={pot} hidden={hasWinner} geometry={geometry} />
      <Board board={board} isShowdown={viewModel.phase === 'hand_end'} geometry={geometry} />

      {seats.map((seat) => {
        const layout = layouts[seat.seatIndex];
        return seat.kind === 'player' && seat.streetCommitted > 0 && layout ? (
          <BetAnchor key={`bet-${seat.seatIndex}`} layout={layout} amount={seat.streetCommitted} />
        ) : null;
      })}

      {buttonLayout && (
        <div
          className="absolute z-[15] -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-200 ease-out motion-reduce:transition-none"
          style={{ left: `${buttonLayout.button.x}%`, top: `${buttonLayout.button.y}%` }}
        >
          <DealerButton />
        </div>
      )}

      {seats.map((seat) => (
        <SeatSlot
          key={seat.seatIndex}
          seat={seat}
          layout={layouts[seat.seatIndex]}
          geometry={geometry}
          handNumber={handNumber}
          isDealing={deal.isDealing}
          secondPassDelaySec={deal.secondPassDelaySec}
          reducedMotion={reducedMotion}
        />
      ))}

      <PotAwardLayer
        chips={awardChips}
        from={potPoint}
        active={pot.isAwarding}
        triggerKey={pot.awardKey}
        reducedMotion={reducedMotion}
      />
      <FoldMuckLayer
        events={muck.events}
        positionOf={muckPositionOf}
        muck={geometry.center}
        cardFontEm={geometry.metrics.seatCard}
        reducedMotion={reducedMotion}
        onDone={muck.onDone}
      />
    </div>
  );
});

function SeatSlot(props: Omit<TableSeatProps, 'layout'> & { seat: SeatViewModel; layout: SeatLayout | undefined }) {
  const { layout, ...rest } = props;
  return layout ? <TableSeat {...rest} layout={layout} /> : null;
}

const TableFelt = memo(function TableFelt({ geometry }: { geometry: TableGeometry }) {
  const { felt, railPct, aspect } = geometry;
  const railStyle: CSSProperties = {
    left: `${felt.cx - felt.rx - railPct}%`,
    width: `${2 * (felt.rx + railPct)}%`,
    top: `${felt.cy - felt.ry - railPct * aspect}%`,
    height: `${2 * (felt.ry + railPct * aspect)}%`,
  };
  const feltStyle: CSSProperties = {
    left: `${felt.cx - felt.rx}%`,
    width: `${2 * felt.rx}%`,
    top: `${felt.cy - felt.ry}%`,
    height: `${2 * felt.ry}%`,
    background: 'radial-gradient(ellipse at center, var(--color-felt-hi) 0%, var(--color-felt) 62%)',
  };
  return (
    <>
      <div aria-hidden className="absolute rounded-[50%] bg-rail" style={railStyle} />
      <div aria-hidden className="absolute rounded-[50%]" style={feltStyle} />
    </>
  );
});

function BetAnchor({ layout, amount }: { layout: SeatLayout; amount: number }) {
  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 animate-[table-fade-in_150ms_ease-out] motion-reduce:animate-none"
      style={{ left: `${layout.bet.x}%`, top: `${layout.bet.y}%` }}
    >
      <ChipBubble amount={amount} />
    </div>
  );
}

function PotPill({ pot, hidden, geometry }: { pot: TablePotViewModel; hidden: boolean; geometry: TableGeometry }) {
  const point = getPotPoint(geometry);
  const isVisible = pot.total > 0 && !hidden;

  return (
    <div
      className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[0.25em]"
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
    >
      {/* Always mounted so screen readers get polite updates of the pot total. */}
      <div aria-live="polite" aria-atomic="true" className={cn(!isVisible && 'sr-only')}>
        {pot.total > 0 && (
          <span className="block rounded-full bg-black/35 px-[0.8em] py-[0.25em] text-[0.95em] font-bold leading-none tabular-nums text-text">
            <span className="sr-only">Pot </span>
            {formatChips(pot.total)}
          </span>
        )}
      </div>
      {isVisible && pot.sidePots.length > 0 && (
        <div className="absolute top-full mt-[0.25em] flex gap-[0.3em]">
          {pot.sidePots.map((amount, index) => (
            <span
              key={index}
              className="whitespace-nowrap rounded-full bg-black/25 px-[0.6em] py-[0.15em] text-[0.7em] tabular-nums text-text-2"
            >
              {index === 0 ? 'Main' : `Side ${index}`} {formatChips(amount)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Board({ board, isShowdown, geometry }: { board: TableBoardViewModel; isShowdown: boolean; geometry: TableGeometry }) {
  const visibleCards = useStaggeredBoardCards(board.cards);
  const winnerCardSet = useMemo(() => new Set(board.winnerCards), [board.winnerCards]);
  const hasWinnerCards = winnerCardSet.size > 0;
  const { boardCard, boardGap } = geometry.metrics;
  const size = getBoardSizeEm(geometry.metrics);
  const label = visibleCards.length > 0 ? `Board: ${visibleCards.map(getCardLabel).join(', ')}` : 'Board: no cards yet';

  return (
    <div
      role="group"
      aria-label={label}
      className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-end"
      style={{ left: `${geometry.center.x}%`, top: `${geometry.center.y}%`, width: `${size.w}em`, gap: `${boardGap}em` }}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const card = visibleCards[index];
        if (!card) {
          return (
            <span
              key={`slot-${index}`}
              aria-hidden
              className="shrink-0 rounded-[var(--radius-card)] border border-white/10"
              style={{ width: `${2.5 * boardCard}em`, height: `${3.5 * boardCard}em` }}
            />
          );
        }
        return (
          <Card
            key={`${index}-${card}`}
            card={card}
            highlight={winnerCardSet.has(card)}
            dim={isShowdown && hasWinnerCards && !winnerCardSet.has(card)}
            className="animate-[table-fade-in_180ms_ease-out] motion-reduce:animate-none"
            style={{ fontSize: `${boardCard}em` }}
          />
        );
      })}
    </div>
  );
}
