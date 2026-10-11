import { useT, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';
import type { PreActionKind } from '../../lib/action-bar-preaction';

interface WaitingBarProps {
  /** Null when hero can't pre-act (folded, all-in, spectating): plain "Waiting…". */
  preAction: PreActionKind | null;
  canPreAct: boolean;
  onPreActionChange: (kind: PreActionKind | null) => void;
}

const OPTIONS: Array<{ kind: PreActionKind; label: MessageKey; title: MessageKey }> = [
  { kind: 'check_fold', label: 'actionbar.pre.checkFold', title: 'actionbar.pre.checkFoldHint' },
  { kind: 'call_any', label: 'actionbar.pre.callAny', title: 'actionbar.pre.callAnyHint' },
];

/** Not hero's turn: muted status plus optional pre-select switches (client-side only). */
export function WaitingBar({ preAction, canPreAct, onPreActionChange }: WaitingBarProps) {
  const t = useT();
  return (
    <div className="flex flex-col gap-snug sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p role="status" className="min-w-0 truncate text-body text-text-2">
        {t('actionbar.waiting.status')}
      </p>
      {canPreAct && (
        <div role="group" aria-label={t('actionbar.pre.group')} className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          {OPTIONS.map((option) => {
            const on = preAction === option.kind;
            return (
              <button
                key={option.kind}
                type="button"
                role="switch"
                aria-checked={on}
                title={t(option.title)}
                onClick={() => onPreActionChange(on ? null : option.kind)}
                className={cn(
                  'flex h-11 min-w-0 touch-manipulation select-none items-center gap-snug rounded-[var(--radius-control)] border px-3 text-body font-semibold',
                  'outline-offset-2 transition-colors duration-[var(--duration-fast)] [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-[var(--color-brass)]',
                  on ? 'border-vermilion/60 bg-vermilion/10 text-text' : 'border-line-2 text-text-2 hover:text-text',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-[var(--duration-fast)]',
                    on ? 'border-vermilion bg-vermilion' : 'border-line-2 bg-ink-0',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-px size-3.5 rounded-full transition-[left,background-color] duration-[var(--duration-fast)] ease-out',
                      on ? 'left-[15px] bg-ivory' : 'left-px bg-text-3',
                    )}
                  />
                </span>
                <span className="min-w-0 truncate">{t(option.label)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
