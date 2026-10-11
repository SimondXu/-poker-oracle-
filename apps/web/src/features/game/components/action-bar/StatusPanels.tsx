import { formatAmount } from '../../lib/action-bar-sizing';
import { ActionButton } from './ActionButton';

/** Compact, flat equivalents of the v1 footer panels. Callbacks and copy are unchanged. */

export function ResultPresentationBar() {
  return (
    <p role="status" className="flex min-h-12 items-center justify-center text-[13px] text-text-2 md:min-h-14">
      正在播放结算动画
    </p>
  );
}

export function NextHandBar({ onStartNextHand }: { onStartNextHand: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <ActionButton variant="raise" hint="Space" onClick={onStartNextHand} className="w-full">
        发下一手牌
      </ActionButton>
      <p className="text-[11px] text-text-3">若未手动开始，系统会自动推进下一手</p>
    </div>
  );
}

function PanelText({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="min-w-0">
      <h3 className="text-[15px] font-semibold text-text">{title}</h3>
      <p className="text-[12px] leading-snug text-text-2">{subtitle}</p>
    </div>
  );
}

export function EliminatedChoiceBar({
  onSpectate,
  onBackToLobby,
}: {
  onSpectate: () => void;
  onBackToLobby: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-4">
      <PanelText
        title="你已淘汰"
        subtitle="桌上仍有玩家持筹码，选择返回大厅或继续观战。"
      />
      <div className="grid shrink-0 grid-cols-2 gap-2 md:w-72">
        <ActionButton variant="raise" onClick={onSpectate}>
          继续观战
        </ActionButton>
        <ActionButton variant="neutral" onClick={onBackToLobby}>
          返回大厅
        </ActionButton>
      </div>
    </div>
  );
}

export function EliminatedSpectatingBar({
  isBotsOnlyContinuation,
  onBackToLobby,
}: {
  isBotsOnlyContinuation: boolean;
  onBackToLobby: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p role="status" className="text-[13px] text-text-2">
        {isBotsOnlyContinuation ? '观战中 · Bot 自动续局' : '观战中 · 存活玩家控制续局'}
      </p>
      <ActionButton variant="neutral" onClick={onBackToLobby} className="min-h-11 shrink-0 px-4 text-[13px] md:min-h-11 md:text-[13px]">
        返回大厅
      </ActionButton>
    </div>
  );
}

export function TableFinishedBar({
  championName,
  championStack,
  handNumber,
  onPlayAgain,
  onBackToLobby,
}: {
  championName: string | null;
  championStack: number | null;
  handNumber: number | null;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}) {
  const handsPlayed = typeof handNumber === 'number' && handNumber > 0 ? `${handNumber} 手` : null;
  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="text-[22px] leading-none text-chip">
          &#9819;
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-text">本场结束</h3>
          <p className="truncate text-[12px] text-text-2">
            冠军 <span className="font-semibold text-text">{championName ?? '玩家'}</span>
            {typeof championStack === 'number' && (
              <span className="tabular-nums"> · {formatAmount(championStack)}</span>
            )}
            {handsPlayed && <span> · {handsPlayed}</span>}
          </p>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 md:w-72">
        <ActionButton variant="raise" onClick={onPlayAgain}>
          再来一局
        </ActionButton>
        <ActionButton variant="neutral" onClick={onBackToLobby}>
          返回大厅
        </ActionButton>
      </div>
    </div>
  );
}
