'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ActionType } from '@aipoker/shared';
import type { GameScreen } from '@/features/game/hooks/useGameScreenState';
import { useTableViewModel } from '@/features/game/hooks/useTableViewModel';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { ActionBar } from './action-bar/ActionBar';
import { ConnectionBanner } from './ConnectionBanner';
import { HandResultBanner } from './result/HandResultBanner';
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
 * v2 game page layout. Desktop (lg): icon rail | top bar + table stage (action
 * bar floats bottom-right) | 320px side panel. Below lg the panel opens as a
 * sheet; below md the rail is hidden and the action bar is fixed to the bottom.
 */
export function GameView({ roomId, currentUserId, screen, onAction, onReturnToLobby }: GameViewProps) {
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
  // lg+: the panel is a column that can be collapsed; below lg it is a sheet that starts closed.
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isPanelSheetOpen, setIsPanelSheetOpen] = useState(false);
  const togglePanelSheet = useCallback(() => setIsPanelSheetOpen((open) => !open), []);
  const closePanelSheet = useCallback(() => setIsPanelSheetOpen(false), []);
  const togglePanel = useCallback(() => {
    if (window.matchMedia(LG_MEDIA_QUERY).matches) {
      setIsPanelCollapsed((collapsed) => !collapsed);
    } else {
      setIsPanelSheetOpen((open) => !open);
    }
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
    <div className="relative flex h-dvh w-full overflow-hidden bg-page text-text">
      <AnimatePresence>
        <ConnectionBanner status={connectionStatus} />
      </AnimatePresence>

      <IconRail
        className="hidden md:flex"
        isPanelOpen={isPanelSheetOpen || !isPanelCollapsed}
        isTrainingHUDVisible={isTrainingHUDVisible}
        onTogglePanel={togglePanel}
        onToggleHUD={toggleTrainingHUD}
        onBack={onReturnToLobby}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          roomCode={roomId.slice(0, 6)}
          handNumber={hand?.handNumber ?? null}
          smallBlind={hand?.smallBlind ?? null}
          bigBlind={hand?.bigBlind ?? null}
          onBack={onReturnToLobby}
          onToggleHUD={toggleTrainingHUD}
        />

        <main className="flex min-h-0 flex-1">
          <section
            aria-label="Table"
            className="relative min-h-0 w-full flex-1"
          >
            {viewModel ? (
              <TableStage viewModel={viewModel} />
            ) : (
              <div className="flex h-full items-center justify-center text-[14px] text-text-2">等待游戏开始...</div>
            )}
            <HandResultBanner />

            <button
              type="button"
              onClick={togglePanelSheet}
              className="absolute right-3 top-3 z-30 rounded-[var(--radius-panel)] bg-panel px-3 py-1.5 text-[12px] font-semibold text-text-2 lg:hidden"
              aria-expanded={isPanelSheetOpen}
            >
              记录 / 教练
            </button>

            <div className="fixed inset-x-0 bottom-0 z-40 md:absolute md:inset-x-auto md:bottom-3 md:right-3 md:w-[min(640px,calc(100%-24px))]">
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
            </div>
          </section>

          {!isPanelCollapsed && (
            <div className="hidden w-[320px] shrink-0 border-l border-line bg-panel lg:flex lg:flex-col">
              <SidePanel {...sidePanelProps} className={PANEL_CLASS} />
            </div>
          )}
        </main>
      </div>

      {isPanelSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:hidden" onClick={closePanelSheet}>
          <div
            role="dialog"
            aria-label="记录 / 教练"
            className="flex max-h-[75dvh] w-full flex-col rounded-t-[var(--radius-panel)] border-t border-line bg-panel md:ml-auto md:h-full md:max-h-none md:w-[320px] md:rounded-none md:border-l md:border-t-0"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-end border-b border-line px-3 py-2">
              <button type="button" onClick={closePanelSheet} className="text-[13px] text-text-2 hover:text-text">
                关闭
              </button>
            </div>
            <SidePanel {...sidePanelProps} className={cn(PANEL_CLASS, 'min-h-0 flex-1')} />
          </div>
        </div>
      )}

    </div>
  );
}

const LG_MEDIA_QUERY = '(min-width: 1024px)';

/** Strip the v1 sidebar's card chrome so it fills the panel column. */
const PANEL_CLASS = 'block h-full rounded-none border-0 bg-transparent backdrop-blur-none';
