import { cn } from '@/lib/utils';
import type { PreActionKind } from '../../lib/action-bar-preaction';

interface WaitingBarProps {
  /** Null when hero can't pre-act (folded, all-in, spectating): plain "Waiting…". */
  preAction: PreActionKind | null;
  canPreAct: boolean;
  onPreActionChange: (kind: PreActionKind | null) => void;
}

const OPTIONS: Array<{ kind: PreActionKind; label: string; title: string }> = [
  { kind: 'check_fold', label: 'Check/Fold', title: 'When it is your turn: check if free, otherwise fold' },
  { kind: 'call_any', label: 'Call any', title: 'When it is your turn: check if free, otherwise call any amount' },
];

/** Not hero's turn: muted status plus optional pre-select toggles (client-side only). */
export function WaitingBar({ preAction, canPreAct, onPreActionChange }: WaitingBarProps) {
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 md:min-h-14">
      <p role="status" className="text-[13px] text-text-2">
        Waiting for other players…
      </p>
      {canPreAct && (
        <div role="group" aria-label="Pre-select action" className="flex items-center gap-1">
          {OPTIONS.map((option) => {
            const checked = preAction === option.kind;
            return (
              <label
                key={option.kind}
                title={option.title}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-panel)] px-2.5 text-[13px] transition-colors duration-[var(--duration-fast)] hover:bg-panel-2',
                  checked ? 'text-text' : 'text-text-2',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => onPreActionChange(event.target.checked ? option.kind : null)}
                  className="size-4 cursor-pointer accent-[var(--color-accent)]"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
