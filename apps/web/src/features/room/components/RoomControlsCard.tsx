'use client';

import { cn } from '@/lib/utils';

interface RoomControlsCardProps {
  isPlaying: boolean;
  isConnected: boolean;
  isReady: boolean;
  canSelfStart: boolean;
  canStart: boolean;
  hasEnoughPlayers: boolean;
  allHumansReady: boolean;
  isTableFinished: boolean;
  onMarkReady: () => void;
  onStartGame: () => void;
  onEnterGame: () => void;
}

const primaryClass =
  'h-12 w-full rounded-panel bg-accent text-[16px] font-semibold text-white transition-colors hover:bg-felt-hi disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-text-3';
const secondaryClass =
  'h-11 w-full rounded-panel border border-line bg-panel-2 text-[14px] font-medium text-text hover:bg-line disabled:cursor-not-allowed disabled:opacity-50';

export function RoomControlsCard({
  isPlaying,
  isConnected,
  isReady,
  canSelfStart,
  canStart,
  hasEnoughPlayers,
  allHumansReady,
  isTableFinished,
  onMarkReady,
  onStartGame,
  onEnterGame,
}: RoomControlsCardProps) {
  const statusMessage = isTableFinished
    ? '本场已结束，当前房间不再继续自动开局'
    : !canSelfStart
      ? '你已淘汰，可进入牌桌观战或返回大厅重新建局。'
      : !hasEnoughPlayers
        ? '至少需要 2 名玩家（可添加机器人）'
        : !allHumansReady
          ? '等待所有真人玩家点击“我已准备”'
          : '全部就绪，可直接开始游戏';

  return (
    <section aria-label="开局控制" className="space-y-3 p-4">
      {isTableFinished && (
        <div className="rounded-panel border border-line bg-page px-3 py-2 text-[13px] text-chip">
          本场已结束，请返回大厅重新建局。
        </div>
      )}

      {!isPlaying && (
        <button
          type="button"
          onClick={onMarkReady}
          disabled={isReady || !isConnected || !canSelfStart}
          className={cn(secondaryClass, isReady && 'cursor-default border-accent text-accent opacity-100')}
        >
          {canSelfStart ? (isReady ? '✓ 已准备' : '我已准备') : '已淘汰'}
        </button>
      )}

      {!isPlaying ? (
        <button type="button" onClick={onStartGame} disabled={!canStart || !isConnected} className={primaryClass}>
          开始游戏
        </button>
      ) : (
        <button type="button" onClick={onEnterGame} className={primaryClass}>
          进入游戏
        </button>
      )}

      {!isPlaying && !canSelfStart && (
        <button type="button" onClick={onEnterGame} className={secondaryClass}>
          进入牌桌观战
        </button>
      )}

      {!isPlaying && <p className="text-[13px] leading-[1.6] text-text-3">{statusMessage}</p>}
    </section>
  );
}
