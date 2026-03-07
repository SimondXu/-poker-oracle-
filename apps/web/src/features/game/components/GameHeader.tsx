'use client';

interface GameHeaderProps {
  roomName?: string | undefined;
  handNumber?: number | undefined;
  smallBlind?: number | undefined;
  bigBlind?: number | undefined;
  onToggleHUD: () => void;
  onBack: () => void;
}

export function GameHeader({
  roomName,
  handNumber,
  smallBlind,
  bigBlind,
  onToggleHUD,
  onBack,
}: GameHeaderProps) {
  return (
    <header className="relative z-20 border-b border-white/8 bg-[rgba(7,12,22,0.72)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={onBack}
            className="rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[12px] font-semibold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-gold)]/46 hover:text-[var(--color-text-primary)]"
          >
            返回大厅
          </button>

          <div className="rounded-xl border border-white/10 bg-[rgba(8,14,24,0.7)] px-3 py-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-base text-[var(--color-gold)]">♠</span>
                <span className="font-display text-[17px] leading-none text-[var(--color-text-primary)]">
                  AiPoker
                </span>
              </div>
              {roomName && (
                <>
                  <div className="h-3.5 w-px bg-white/10" />
                  <span className="hidden max-w-[200px] truncate text-[12px] text-[var(--color-text-secondary)] sm:inline">
                    {roomName}
                  </span>
                </>
              )}
              {smallBlind !== undefined && bigBlind !== undefined && (
                <span className="rounded-md border border-white/10 bg-[rgba(0,0,0,0.32)] px-2 py-0.5 text-[11px] font-chips text-[var(--color-text-secondary)]">
                  {smallBlind}/{bigBlind}
                </span>
              )}
              {handNumber !== undefined && (
                <span className="text-[11px] text-[var(--color-text-dim)]">#{handNumber}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[rgba(7,12,22,0.62)] p-1.5 backdrop-blur-xl">
          <button
            onClick={onToggleHUD}
            className="rounded-lg bg-white/[0.04] p-1.5 text-[13px] text-[var(--color-text-muted)] transition-all hover:bg-white/[0.10] hover:text-[var(--color-text-primary)]"
            title="切换训练提示"
          >
            📊
          </button>
          <button
            className="rounded-lg bg-white/[0.04] p-1.5 text-[13px] text-[var(--color-text-muted)] transition-all hover:bg-white/[0.10] hover:text-[var(--color-text-primary)]"
            title="设置"
          >
            ⚙️
          </button>
        </div>
      </div>
    </header>
  );
}
