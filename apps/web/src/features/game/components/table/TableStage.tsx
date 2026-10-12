'use client';

import { memo, useCallback, useId, useMemo, type CSSProperties } from 'react';
import { Card, ChipBubble, DealerButton, PotMedallion } from '@/components/poker';
import { useT } from '@/i18n';
import {
  TABLE_GEOMETRIES,
  fitTableStage,
  getBoardBox,
  getPotBox,
  getPotPoint,
  getSeatLayouts,
  type LayoutBox,
  type SeatLayout,
  type TableGeometry,
} from '@/features/game/lib/seat-layout';
import type { SeatViewModel, TableBoardViewModel, TablePotViewModel } from '@/features/game/lib/table-view-model';
import { cn, formatChips } from '@/lib/utils';
import type { TableStageProps } from '../slots';
import { FoldMuckLayer } from './FoldMuckLayer';
import { PotAwardLayer, type PotAwardChip } from './PotAwardLayer';
import { getCardName } from './table-copy';
import { TableSeat, hasSeatPlate, type TableSeatProps } from './TableSeat';
import { useElementSize } from './useElementSize';
import { useFoldMuckEvents } from './useFoldMuckEvents';
import { usePrefersReducedMotion } from './useMediaQuery';
import { useStaggeredBoardCards } from './useStaggeredBoardCards';

/** Box → absolute style in stage percent. */
function boxStyle(box: LayoutBox): CSSProperties {
  return { left: `${box.left}%`, top: `${box.top}%`, width: `${box.right - box.left}%`, height: `${box.bottom - box.top}%` };
}

/**
 * Table stage: fills its parent (the action dock and result banner live
 * outside it) and draws the table in the box `fitTableStage` picks
 * (landscape, square or portrait, stretched to the stage's aspect). Everything inside is positioned in percent
 * from `seat-layout` and sized in em of the box font-size, so one number scales
 * the whole table and the layout stays collision-free at any size.
 */
export const TableStage = memo(function TableStage({ viewModel, className }: TableStageProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const reducedMotion = usePrefersReducedMotion();
  const fit = size ? fitTableStage(size.w, size.h) : null;
  const t = useT();

  return (
    <div ref={ref} className={cn('relative h-full w-full overflow-hidden', className)}>
      {fit && fit.width > 0 && (
        <div
          role="region"
          aria-label={t('table.label')}
          className="absolute [container-type:size]"
          // --stage-em feeds the text-seat-* type tokens (globals.css).
          style={
            {
              left: fit.left,
              top: fit.top,
              width: fit.width,
              height: fit.height,
              fontSize: fit.fontPx,
              '--stage-em': `${fit.fontPx}px`,
            } as CSSProperties
          }
        >
          <TableContent viewModel={viewModel} geometry={TABLE_GEOMETRIES[fit.orientation]} reducedMotion={reducedMotion} />
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

  // A seat with a plate draws its own dealer disc (in em, beside the plate); this is the fallback for a dead button.
  const buttonSeat = seats[viewModel.buttonSeatIndex];
  const looseButtonLayout = buttonSeat && !hasSeatPlate(buttonSeat) ? layoutOf(viewModel.buttonSeatIndex) : undefined;
  const hasWinner = seats.some((seat) => seat.kind === 'player' && seat.isWinner);
  const hasActor = seats.some((seat) => seat.kind === 'player' && seat.isActor);
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

      <PotSlot pot={pot} hidden={hasWinner} geometry={geometry} />
      <Board board={board} isShowdown={viewModel.phase === 'hand_end'} geometry={geometry} />

      {seats.map((seat) => {
        const layout = layouts[seat.seatIndex];
        return seat.kind === 'player' && seat.streetCommitted > 0 && layout ? (
          <BetSlot key={`bet-${seat.seatIndex}`} seat={seat} layout={layout} geometry={geometry} />
        ) : null;
      })}

      {looseButtonLayout && <DealerSlot point={looseButtonLayout.button} geometry={geometry} />}

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
          hasActor={hasActor}
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

// ─────────────────────────────────────────────
// Felt
// ─────────────────────────────────────────────

/** Rosette: circles whose centers walk a smaller circle (the classic engraved guilloche). */
const ROSETTE_COUNT = 24;
const ROSETTE = Array.from({ length: ROSETTE_COUNT }, (_, index) => {
  const angle = (index / ROSETTE_COUNT) * Math.PI * 2;
  return { cx: 500 + 125 * Math.cos(angle), cy: 500 + 125 * Math.sin(angle) };
});
/** Frame rules just inside the felt edge (they follow the oval). */
const FRAME_RINGS = [440, 462];

const TableFelt = memo(function TableFelt({ geometry }: { geometry: TableGeometry }) {
  const { felt, railPct, aspect } = geometry;
  const maskId = useId();
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
  };
  return (
    <>
      <div
        aria-hidden
        className="absolute rounded-[50%] bg-rail shadow-[0_0.4em_1.2em_-0.3em_rgb(5_8_16/0.7),inset_0_0.1em_0.2em_rgb(236_231_219/0.06)]"
        style={railStyle}
      />
      <div
        aria-hidden
        className="absolute overflow-hidden rounded-[50%] bg-[radial-gradient(ellipse_at_50%_42%,color-mix(in_oklab,var(--color-felt)_90%,var(--color-ink-10))_0,var(--color-felt)_55%,var(--color-felt-deep)_100%)] shadow-[0_0_0_1px_rgb(184_154_94/0.45),inset_0_0_0_1px_rgb(184_154_94/0.2),inset_0_0.3em_1.6em_rgb(5_8_16/0.35)]"
        style={feltStyle}
      >
        {/* Engraved guilloche: ivory hairlines at 4% so it reads as print, not pattern. The rosette
            stays round (meet) and fades out toward the center, clear of the pot and board. */}
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 block size-full">
          <defs>
            <radialGradient id={`${maskId}-fade`} gradientUnits="userSpaceOnUse" cx="500" cy="500" r="340">
              <stop offset="0.47" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.75" stopColor="#fff" stopOpacity="1" />
            </radialGradient>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">
              <rect width="1000" height="1000" fill={`url(#${maskId}-fade)`} />
            </mask>
          </defs>
          <g fill="none" stroke="var(--color-ivory)" strokeWidth="1" strokeOpacity="0.04" mask={`url(#${maskId})`}>
            {ROSETTE.map((point, index) => (
              <circle key={index} cx={point.cx} cy={point.cy} r="215" vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        </svg>
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 block size-full">
          <g fill="none" stroke="var(--color-ivory)" strokeWidth="1" strokeOpacity="0.07">
            {FRAME_RINGS.map((radius) => (
              <circle key={radius} cx="500" cy="500" r={radius} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        </svg>
      </div>
    </>
  );
});

// ─────────────────────────────────────────────
// Pot, board, bets, dealer
// ─────────────────────────────────────────────

function PotSlot({ pot, hidden, geometry }: { pot: TablePotViewModel; hidden: boolean; geometry: TableGeometry }) {
  const t = useT();
  const isVisible = pot.total > 0 && !hidden;
  const sidePots = pot.sidePots.map((amount, index) => ({
    label: index === 0 ? t('table.pot.main') : t('table.pot.side', { index }),
    amount,
  }));

  return (
    <div
      data-layout-box={isVisible ? 'pot' : undefined}
      className={cn('absolute z-10 flex items-center justify-center', !isVisible && 'sr-only')}
      style={boxStyle(getPotBox(geometry))}
    >
      <PotMedallion
        total={pot.total}
        sidePots={isVisible ? sidePots : []}
        label={t('table.pot.label')}
        style={{ fontSize: `${geometry.metrics.potText}em` }}
      />
    </div>
  );
}

function Board({ board, isShowdown, geometry }: { board: TableBoardViewModel; isShowdown: boolean; geometry: TableGeometry }) {
  const t = useT();
  const visibleCards = useStaggeredBoardCards(board.cards);
  const winnerCardSet = useMemo(() => new Set(board.winnerCards), [board.winnerCards]);
  const hasWinnerCards = winnerCardSet.size > 0;
  const { boardCard, boardGap } = geometry.metrics;
  const label =
    visibleCards.length > 0
      ? t('table.board.label', { cards: visibleCards.map((card) => getCardName(t, card)).join(', ') })
      : t('table.board.empty');

  return (
    <div
      role="group"
      aria-label={label}
      data-layout-box="board"
      className="absolute z-10 flex items-end justify-center"
      style={{ ...boxStyle(getBoardBox(geometry)), gap: `${boardGap}em` }}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const card = visibleCards[index];
        if (!card) {
          return (
            <span
              key={`slot-${index}`}
              aria-hidden
              className="shrink-0 rounded-[var(--radius-card)] border border-ivory/30 bg-felt-deep/60 shadow-[inset_0_0.05em_0.15em_rgb(5_8_16/0.35)]"
              style={{ width: `${2.5 * boardCard}em`, height: `${3.5 * boardCard}em` }}
            />
          );
        }
        const isBest = winnerCardSet.has(card);
        return (
          <Card
            key={`${index}-${card}`}
            card={card}
            size="md"
            label={getCardName(t, card)}
            highlight={isBest}
            dim={isShowdown && hasWinnerCards && !isBest}
            className="animate-[table-fade-in_180ms_cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none"
            style={{ fontSize: `${boardCard}em` }}
          />
        );
      })}
    </div>
  );
}

function centeredBox(point: { x: number; y: number }, wEm: number, hEm: number): CSSProperties {
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
    width: `${wEm}em`,
    height: `${hEm}em`,
    marginLeft: `${-wEm / 2}em`,
    marginTop: `${-hEm / 2}em`,
  };
}

function BetSlot({ seat, layout, geometry }: { seat: SeatViewModel & { kind: 'player' }; layout: SeatLayout; geometry: TableGeometry }) {
  const t = useT();
  const { bet, betText } = geometry.metrics;
  const kind = seat.lastAction?.kind;
  const tone = kind === 'raise' || kind === 'all_in' ? 'vermilion' : 'brass';
  return (
    <div
      data-layout-box="bet-chip"
      className="absolute z-10 flex items-center justify-center animate-[table-fade-in_150ms_cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none"
      style={centeredBox(layout.bet, bet.w, bet.h)}
    >
      <span style={{ fontSize: `${betText}em` }} className="flex">
        <ChipBubble
          amount={seat.streetCommitted}
          tone={tone}
          label={t('table.bet.aria', { amount: formatChips(seat.streetCommitted) })}
        />
      </span>
    </div>
  );
}

function DealerSlot({ point, geometry }: { point: { x: number; y: number }; geometry: TableGeometry }) {
  const t = useT();
  const size = geometry.metrics.button;
  return (
    <div
      data-layout-box="dealer"
      className="absolute z-[15] flex items-center justify-center"
      style={centeredBox(point, size, size)}
    >
      {/* DealerButton is 1.6em of its font-size. */}
      <span className="flex" style={{ fontSize: `${size / 1.6}em` }}>
        <DealerButton label={t('table.dealer')} />
      </span>
    </div>
  );
}
