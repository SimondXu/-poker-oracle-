'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ActionType } from '@aipoker/shared';
import type { GameScreen } from '@/features/game/hooks/useGameScreenState';
import { useTableViewModel } from '@/features/game/hooks/useTableViewModel';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { ActionBar } from './action-bar/ActionBar';
import { ConnectionBanner } from './ConnectionBanner';
import { IconRail } from './IconRail';
import { SidePanel } from './side-panel/SidePanel';
import { TableStage } from './table/TableStage';
import { TopBar } from './TopBar';

export interface GameViewProps {
  roomId: string;
  currentUserId: string;
  screen: GameScreen;
  onAction: (type: ActionType, amount?: number) => void;
  onReturnToLobby: () => void;
}

/**
 * Game page layout, one CSS grid so nothing is positioned over the felt:
 *
 *   rows    48px top bar | the rest
 *   cols    md: 56px rail | table column;  xl: + 340px side panel
 *
 * The table column is a flex column: [connection strip] [stage, flex-1] [action dock].
 * The stage box is therefore exactly the free space; the dock sits below it at the
 * full column width and, when the raise row opens, grows upward by shrinking the stage.
 * Below xl the side panel is a sheet inside the stage region (right drawer on md,
 * bottom sheet below md), so it can never cover the dock.
 */
export function GameView({ roomId, currentUserId, screen, onAction, onReturnToLobby }: GameViewProps) {
  const t = useT();
  const {
    hand,
    handResult,
    validActions,
    timerStartedAt,
    timerDurationMs,
    isWinning,
    winnerCards,
    winnerIds,
    connectionStatus,
    isBotsOnlyContinuation,
    championInfo,
    footerMode,
    screenState,
    handleStartNextHand,
    handleSpectate,
  } = screen;

  const isTrainingHUDVisible = useUIStore((state) => state.isTrainingHUDVisible);
  const toggleTrainingHUD = useUIStore((state) => state.toggleTrainingHUD);
  const isActionHistoryVisible = useUIStore((state) => state.isActionHistoryVisible);
  // xl+: the panel is a column that can be collapsed; below xl it is a sheet that starts closed.
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isPanelSheetOpen, setIsPanelSheetOpen] = useState(false);
  const closePanelSheet = useCallback(() => setIsPanelSheetOpen(false), []);
  const togglePanel = useCallback(() => {
    if (window.matchMedia(XL_MEDIA_QUERY).matches) {
      setIsPanelCollapsed((collapsed) => !collapsed);
    } else {
      setIsPanelSheetOpen((open) => !open);
    }
  }, []);

  // Growing past xl turns the sheet into the docked column; drop the open sheet state.
  useEffect(() => {
    const query = window.matchMedia(XL_MEDIA_QUERY);
    const onChange = () => {
      if (query.matches) setIsPanelSheetOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const viewModel = useTableViewModel({
    hand,
    currentUserId,
    timerStartedAt,
    timerDurationMs,
    winnerIds,
    winnerCards,
    winnerBestCardsByPlayer: screenState.winnerBestCardsByPlayer,
    payoutAmountsByPlayer: screenState.payoutAmountsByPlayer,
    handResultPhase: handResult?.phase,
    isWinning,
  });

  const sidePanelProps = {
    hand,
    trainingData: screenState.trainingData,
    isTrainingHUDVisible,
    isActionHistoryVisible,
    onToggleTrainingHUD: toggleTrainingHUD,
  };

  return (
    <div
      className={cn(
        'grid h-dvh w-full grid-cols-[minmax(0,1fr)] grid-rows-[3rem_minmax(0,1fr)] overflow-hidden bg-page text-text',
        'md:grid-cols-[3.5rem_minmax(0,1fr)]',
        !isPanelCollapsed && 'xl:grid-cols-[3.5rem_minmax(0,1fr)_21.25rem]',
      )}
    >
      <TopBar
        roomCode={roomId.slice(0, 6)}
        handNumber={hand?.handNumber ?? null}
        smallBlind={hand?.smallBlind ?? null}
        bigBlind={hand?.bigBlind ?? null}
        onBack={onReturnToLobby}
        onToggleHUD={toggleTrainingHUD}
        onTogglePanel={togglePanel}
        isPanelOpen={isPanelSheetOpen}
      />

      <IconRail
        className="col-start-1 row-start-2 hidden md:flex"
        isPanelOpen={isPanelSheetOpen || !isPanelCollapsed}
        isTrainingHUDVisible={isTrainingHUDVisible}
        onTogglePanel={togglePanel}
        onToggleHUD={toggleTrainingHUD}
        onBack={onReturnToLobby}
      />

      <main className="col-start-1 row-start-2 flex min-h-0 min-w-0 flex-col md:col-start-2">
        <ConnectionBanner status={connectionStatus} />

        {/* Stage region: exactly the space left above the dock. The sheet lives inside it. */}
        <section
          aria-label={t('common.game.region.table')}
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <div className="absolute inset-0">
            {viewModel ? (
              <TableStage viewModel={viewModel} />
            ) : (
              <div className="flex h-full items-center justify-center text-lead text-text-2">
                {t('common.game.waitingStart')}
              </div>
            )}
          </div>

          {isPanelSheetOpen && (
            <div className="absolute inset-0 z-40 xl:hidden" onClick={closePanelSheet}>
              <div className="absolute inset-0 bg-black/45" aria-hidden />
              <div
                role="dialog"
                aria-label={t('common.panel.sheetTitle')}
                data-layout-box="panel-sheet"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    closePanelSheet();
                  }
                }}
                className="absolute inset-x-0 bottom-0 flex max-h-[85%] flex-col rounded-t-[var(--radius-panel)] border-t border-brass/30 bg-panel shadow-float md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[21.25rem] md:rounded-none md:border-l md:border-t-0"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-1.5">
                  <span className="label-index text-micro text-text-3">{t('common.panel.sheetTitle')}</span>
                  <button
                    type="button"
                    onClick={closePanelSheet}
                    className="label-index h-9 touch-manipulation px-2 text-micro text-text-2 outline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-[var(--color-brass)]"
                  >
                    {t('common.button.close')}
                  </button>
                </div>
                <SidePanel {...sidePanelProps} className={cn(PANEL_CLASS, 'min-h-0 flex-1')} />
              </div>
            </div>
          )}
        </section>

        <ActionBar
          mode={footerMode}
          validActions={validActions}
          pot={screenState.pot}
          isMyTurn={screenState.isMyTurn}
          isBotsOnlyContinuation={isBotsOnlyContinuation}
          championName={championInfo?.name ?? null}
          championStack={screenState.championStack}
          handNumber={hand?.handNumber ?? null}
          onAction={onAction}
          onSpectate={handleSpectate}
          onStartNextHand={handleStartNextHand}
          onPlayAgain={onReturnToLobby}
          onBackToLobby={onReturnToLobby}
        />
      </main>

      {!isPanelCollapsed && (
        <div className="col-start-3 row-start-2 hidden min-h-0 min-w-0 border-l border-line bg-panel xl:flex xl:flex-col">
          <SidePanel {...sidePanelProps} className={PANEL_CLASS} />
        </div>
      )}
    </div>
  );
}

const XL_MEDIA_QUERY = '(min-width: 1280px)';

/** Strip the v1 sidebar's card chrome so it fills the panel column. */
const PANEL_CLASS = 'block h-full rounded-none border-0 bg-transparent backdrop-blur-none';
