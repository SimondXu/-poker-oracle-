/**
 * Props contracts for the GameView slots. GameView imports each slot from a
 * fixed path and passes exactly these props; a slot owner may replace the
 * implementation freely but should only change a props type here (additively)
 * together with the GameView wiring. See ./README.md.
 */
import type { ActionType, HandState, ValidActions } from '@aipoker/shared';
import type { GameFooterMode, GameScreenState } from '../lib/game-screen-state';
import type { TableViewModel } from '../lib/table-view-model';

/** `./table/TableStage.tsx` — owner: table agent (`table/**`). */
export interface TableStageProps {
  viewModel: TableViewModel;
  className?: string | undefined;
}

/** `./action-bar/ActionBar.tsx` — owner: action-bar agent (`action-bar/**`). Same data GameFooter takes today. */
export interface ActionBarProps {
  mode: GameFooterMode;
  validActions: ValidActions | null;
  /** getHandPotTotal (same number as TableViewModel.pot.total). */
  pot: number;
  isMyTurn: boolean;
  isBotsOnlyContinuation: boolean;
  championName: string | null;
  championStack: number | null;
  /** Hero's chips when the table finished; `net` is null when the session start was not seen (page reloaded). */
  heroResult: { stack: number; net: number | null } | null;
  /** Coach analysis on the hero's turn; shown as one line below xl, where the panel is a closed sheet. */
  coachHint: GameScreenState['trainingData'];
  handNumber: number | null;
  onAction: (type: ActionType, amount?: number) => void;
  onSpectate: () => void;
  onStartNextHand: () => void;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

/** `./side-panel/SidePanel.tsx` — owner: panel agent (`side-panel/**`). */
export interface SidePanelProps {
  hand: HandState | null;
  trainingData: GameScreenState['trainingData'];
  isTrainingHUDVisible: boolean;
  isActionHistoryVisible: boolean;
  onToggleTrainingHUD: () => void;
  className?: string | undefined;
}

/** `./TopBar.tsx` — owner: action-bar agent. The panel button shows below `md` only (the rail has it from md). */
export interface TopBarProps {
  roomCode: string;
  handNumber: number | null;
  smallBlind: number | null;
  bigBlind: number | null;
  onBack: () => void;
  onToggleHUD: () => void;
  onTogglePanel: () => void;
  isPanelOpen: boolean;
}

/** `./IconRail.tsx` — owner: action-bar agent. Hidden below `md`. */
export interface IconRailProps {
  isPanelOpen: boolean;
  isTrainingHUDVisible: boolean;
  onTogglePanel: () => void;
  onToggleHUD: () => void;
  onBack: () => void;
  className?: string | undefined;
}
