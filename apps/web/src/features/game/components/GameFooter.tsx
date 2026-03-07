'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ActionPanel } from '@/components/game/actions/ActionPanel';
import { EliminatedChoicePanel, TableFinishedPanel } from '@/components/game/hud';
import type { ActionType, ValidActions } from '@aipoker/shared';
import type { GameFooterMode } from '../lib/game-screen-state';

interface GameFooterProps {
  mode: GameFooterMode;
  validActions: ValidActions | null;
  pot: number;
  isMyTurn: boolean;
  isBotsOnlyContinuation: boolean;
  championName: string | null;
  championStack: number | null;
  handNumber: number | null;
  onAction: (type: ActionType, amount?: number) => void;
  onSpectate: () => void;
  onStartNextHand: () => void;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

export function GameFooter({
  mode,
  validActions,
  pot,
  isMyTurn,
  isBotsOnlyContinuation,
  championName,
  championStack,
  handNumber,
  onAction,
  onSpectate,
  onStartNextHand,
  onPlayAgain,
  onBackToLobby,
}: GameFooterProps) {
  return (
    <footer className="relative z-30 h-[122px] border-t border-white/8 bg-[rgba(7,12,22,0.78)] px-3 py-2.5 backdrop-blur-xl sm:h-[132px] sm:px-5 sm:py-3">
      <div className="mx-auto flex h-full w-full max-w-[980px] items-center">
        <AnimatePresence mode="wait">
          {mode === 'actions' && validActions ? (
            <motion.div
              key="actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="w-full"
            >
              <ActionPanel
                validActions={validActions}
                pot={pot}
                isMyTurn={isMyTurn}
                onAction={onAction}
                className="w-full"
              />
            </motion.div>
          ) : mode === 'eliminated-choice' ? (
            <motion.div
              key="eliminated-choice"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="w-full"
            >
              <EliminatedChoicePanel
                mode="decision"
                isBotsOnlyContinuation={isBotsOnlyContinuation}
                onSpectate={onSpectate}
                onBackToLobby={onBackToLobby}
              />
            </motion.div>
          ) : mode === 'result-presentation' ? (
            <motion.div
              key="result-presentation"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex w-full justify-center"
            >
              <div className="rounded-full border border-[var(--color-gold)]/18 bg-[rgba(11,18,28,0.82)] px-4 py-1.5 text-[11px] text-[var(--color-text-secondary)] sm:text-[12px]">
                正在播放结算动画
              </div>
            </motion.div>
          ) : mode === 'next-hand' ? (
            <motion.div
              key="next-hand"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex w-full flex-col items-center justify-center gap-2"
            >
              <button
                type="button"
                onClick={onStartNextHand}
                className="rounded-xl border border-[var(--color-gold)]/40 bg-gradient-to-r from-[#c6a33d] via-[#dfbe65] to-[#efcf7e] px-5 py-2 text-[14px] font-semibold text-[#241600] shadow-[0_10px_26px_rgba(214,178,84,0.28)] transition-all hover:brightness-105"
              >
                发下一手牌（Space）
              </button>
              <p className="text-[11px] text-[var(--color-text-dim)]">若未手动开始，系统会自动推进下一手</p>
            </motion.div>
          ) : mode === 'eliminated-spectating' ? (
            <motion.div
              key="eliminated-spectating"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="w-full"
            >
              <EliminatedChoicePanel
                mode="spectating"
                isBotsOnlyContinuation={isBotsOnlyContinuation}
                onBackToLobby={onBackToLobby}
              />
            </motion.div>
          ) : mode === 'table-finished' ? (
            <motion.div
              key="table-finished"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="w-full"
            >
              <TableFinishedPanel
                championName={championName}
                championStack={championStack}
                handNumber={handNumber}
                onPlayAgain={onPlayAgain}
                onBackToLobby={onBackToLobby}
              />
            </motion.div>
          ) : mode === 'waiting' ? (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex w-full justify-center"
            >
              <div className="rounded-full border border-white/10 bg-[rgba(7,13,22,0.76)] px-4 py-1.5 text-[11px] text-[var(--color-text-dim)] sm:text-[12px]">
                等待当前玩家行动
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </footer>
  );
}
