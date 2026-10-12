import { useFormatNumber, useT } from '@/i18n';
import { HandResultBanner } from '../result/HandResultBanner';
import { ActionButton } from './ActionButton';

/** Between-hand and end-of-game bars. They sit in the same dock as the action buttons. */

/** The hand-result banner lives in the dock while the result is shown (it reads the store itself). */
export function ResultPresentationBar() {
  const t = useT();
  return (
    <>
      <p className="sr-only">{t('actionbar.result.playing')}</p>
      <HandResultBanner className="relative inset-x-0 bottom-0 z-auto w-full" />
    </>
  );
}

/** The result banner stays up next to the button; the next hand also starts on its own. */
export function NextHandBar({ onStartNextHand }: { onStartNextHand: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-snug sm:gap-4">
      <p className="sr-only">{t('actionbar.next.hint')}</p>
      <HandResultBanner compactOnPhone className="relative inset-x-0 bottom-0 z-auto min-w-0 flex-1" />
      <ActionButton
        variant="raise"
        hint="Space"
        onClick={onStartNextHand}
        title={t('actionbar.next.hint')}
        className="w-28 shrink-0 sm:w-56"
      >
        {t('actionbar.next.button')}
      </ActionButton>
    </div>
  );
}

function PanelText({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="min-w-0">
      <h3 className="label-index text-lead text-text">{title}</h3>
      <p className="text-body text-text-2">{subtitle}</p>
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
  const t = useT();
  return (
    <div className="flex flex-col gap-group md:flex-row md:items-center md:justify-between md:gap-4">
      <PanelText title={t('actionbar.out.title')} subtitle={t('actionbar.out.subtitle')} />
      <div className="grid shrink-0 grid-cols-2 gap-2 md:w-80">
        <ActionButton variant="raise" onClick={onSpectate}>
          {t('actionbar.out.spectate')}
        </ActionButton>
        <ActionButton variant="neutral" onClick={onBackToLobby}>
          {t('actionbar.out.lobby')}
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
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3">
      <p role="status" className="min-w-0 text-body text-text-2">
        {isBotsOnlyContinuation ? t('actionbar.spectating.bots') : t('actionbar.spectating.survivors')}
      </p>
      <ActionButton variant="neutral" onClick={onBackToLobby} className="h-11 w-40 shrink-0">
        {t('actionbar.out.lobby')}
      </ActionButton>
    </div>
  );
}

export function TableFinishedBar({
  championName,
  championStack,
  heroResult,
  handNumber,
  onPlayAgain,
  onBackToLobby,
}: {
  championName: string | null;
  championStack: number | null;
  heroResult: { stack: number; net: number | null } | null;
  handNumber: number | null;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}) {
  const t = useT();
  const fmt = useFormatNumber();
  const handsPlayed =
    typeof handNumber === 'number' && handNumber > 0
      ? handNumber === 1
        ? t('actionbar.finished.hands_one')
        : t('actionbar.finished.hands', { count: handNumber })
      : null;
  return (
    <div className="flex flex-col gap-group md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="min-w-0">
        <h3 className="label-index text-lead text-brass">{t('actionbar.finished.title')}</h3>
        <p className="truncate text-body text-text-2">
          {t('actionbar.finished.champion')}{' '}
          <span className="font-semibold text-text">{championName ?? t('actionbar.finished.player')}</span>
          {typeof championStack === 'number' && <span className="font-index"> · {fmt(championStack)}</span>}
          {handsPlayed && <span> · {handsPlayed}</span>}
        </p>
        {heroResult && (
          <p className="truncate text-body font-semibold text-text">
            {heroResult.net === null
              ? t('actionbar.finished.you', { stack: fmt(heroResult.stack) })
              : t('actionbar.finished.youNet', {
                  stack: fmt(heroResult.stack),
                  net: `${heroResult.net > 0 ? '+' : heroResult.net < 0 ? '−' : ''}${fmt(Math.abs(heroResult.net))}`,
                })}
          </p>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 md:w-80">
        <ActionButton variant="raise" onClick={onPlayAgain}>
          {t('actionbar.finished.playAgain')}
        </ActionButton>
        <ActionButton variant="neutral" onClick={onBackToLobby}>
          {t('actionbar.finished.lobby')}
        </ActionButton>
      </div>
    </div>
  );
}
