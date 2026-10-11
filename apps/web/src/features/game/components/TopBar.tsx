'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { cn, formatChips } from '@/lib/utils';
import { useGameStore } from '@/stores/gameStore';
import type { TopBarProps } from './slots';

type ConnectionStatus = ReturnType<typeof useGameStore.getState>['connectionStatus'];

const CONNECTION: Record<ConnectionStatus, { label: string; dot: string }> = {
  connected: { label: '已连接', dot: 'bg-raise' },
  connecting: { label: '连接中', dot: 'bg-chip' },
  reconnecting: { label: '重连中', dot: 'bg-chip' },
  disconnected: { label: '已断开', dot: 'bg-fold' },
};

/** Slim 40px top bar: wordmark, room code (click to copy), game label, hand number, connection dot. */
export function TopBar({ roomCode, handNumber, smallBlind, bigBlind, onBack }: TopBarProps) {
  const connectionStatus = useGameStore((state) => state.connectionStatus);
  const copyRoomCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      toast('已复制', { id: 'room-code-copied', duration: 1500 });
    } catch {
      toast.error('复制失败，请手动复制房间码', { id: 'room-code-copied' });
    }
  }, [roomCode]);

  const connection = CONNECTION[connectionStatus];
  const blinds = smallBlind !== null && bigBlind !== null ? `NLH ${formatChips(smallBlind)}/${formatChips(bigBlind)}` : 'NLH';

  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 text-[13px]">
      <button
        type="button"
        onClick={onBack}
        aria-label="返回大厅"
        className="-ml-1 flex size-8 items-center justify-center rounded-[var(--radius-panel)] text-text-2 hover:bg-panel-2 hover:text-text md:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      <span className="font-bold tracking-wide text-text">AiPoker</span>

      <button
        type="button"
        onClick={copyRoomCode}
        title="点击复制房间码"
        aria-label={`房间码 ${roomCode}，点击复制`}
        className="flex items-center gap-1.5 rounded-[var(--radius-panel)] bg-panel-2 px-2 py-0.5 font-mono text-[12px] font-semibold uppercase tracking-wider text-text-2 transition-colors hover:text-text"
      >
        {roomCode}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </svg>
      </button>

      <span className="hidden text-text-2 tabular-nums sm:inline">{blinds}</span>
      {handNumber !== null && <span className="text-text-2 tabular-nums">第 {handNumber} 手</span>}

      <span
        role="status"
        aria-label={connection.label}
        title={connection.label}
        className="ml-auto flex items-center gap-1.5 text-[12px] text-text-3"
      >
        <span className={cn('size-2 rounded-full', connection.dot)} aria-hidden />
        <span className="hidden sm:inline">{connection.label}</span>
      </span>
    </header>
  );
}
