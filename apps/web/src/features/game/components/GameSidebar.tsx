'use client';

import { ActionHistory, TrainingHUD } from '@/components/game/hud';
import type { HandState, ValidActions } from '@aipoker/shared';
import type { GameScreenState } from '../lib/game-screen-state';

interface GameSidebarProps {
  hand: HandState | null;
  isTrainingHUDVisible: boolean;
  isActionHistoryVisible: boolean;
  onToggleTrainingHUD: () => void;
  validActions: ValidActions | null;
  pot: number;
  trainingData: GameScreenState['trainingData'];
}

export function GameSidebar({
  hand,
  isTrainingHUDVisible,
  isActionHistoryVisible,
  onToggleTrainingHUD,
  validActions,
  pot,
  trainingData,
}: GameSidebarProps) {
  return (
    <aside className="hidden min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-[rgba(7,12,21,0.65)] p-3 backdrop-blur-xl lg:block">
      <div className="space-y-3">
        {isTrainingHUDVisible && (
          <TrainingHUD
            isVisible={isTrainingHUDVisible}
            onToggle={onToggleTrainingHUD}
            {...(validActions?.callAmount !== undefined ? { callAmount: validActions.callAmount } : {})}
            potTotal={pot}
            {...(trainingData ? { data: trainingData } : {})}
            className="w-full"
          />
        )}

        {isActionHistoryVisible && hand && hand.actions.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[rgba(7,12,22,0.76)]">
            <ActionHistory actions={hand.actions} />
          </div>
        )}
      </div>
    </aside>
  );
}
