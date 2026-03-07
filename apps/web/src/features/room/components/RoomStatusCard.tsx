'use client';

import { Stat } from './Stat';

interface RoomStatusCardProps {
  playerCount: number;
  readyCount: number;
  activeStackPlayerCount: number;
  isPlaying: boolean;
}

export function RoomStatusCard({
  playerCount,
  readyCount,
  activeStackPlayerCount,
  isPlaying,
}: RoomStatusCardProps) {
  return (
    <section
      className="rounded-[24px] border border-white/12 bg-[rgba(10,18,30,0.85)] p-5 sm:p-6"
      style={{ boxShadow: 'var(--shadow-panel), var(--shadow-hairline)' }}
    >
      <h2 className="text-[12px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">房间状态</h2>
      <div className="mt-4 grid grid-cols-4 gap-2">
        <Stat label="玩家数" value={playerCount} />
        <Stat label="已准备" value={readyCount} color="var(--color-success)" />
        <Stat label="有效筹码" value={activeStackPlayerCount} color="var(--color-gold)" />
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">状态</div>
          <div
            className="mt-2 text-[17px] font-semibold"
            style={{ color: isPlaying ? 'var(--color-gold)' : 'var(--color-text-secondary)' }}
          >
            {isPlaying ? '游戏中' : '等待中'}
          </div>
        </div>
      </div>
    </section>
  );
}
