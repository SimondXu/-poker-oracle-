import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { BlindKind } from './types';

export interface DealerButtonProps {
  /** Accessible name override (e.g. translated). */
  label?: string | undefined;
  className?: string | undefined;
}

/** Brass dealer disc with an engraved inner rule and "D" in the index face. 1.6em, sized in em. */
export const DealerButton = memo(function DealerButton({ label, className }: DealerButtonProps) {
  return (
    <span
      role="img"
      aria-label={label ?? 'Dealer button'}
      className={cn(
        'font-index inline-flex size-[1.6em] items-center justify-center rounded-full bg-brass',
        'text-[1em] font-bold leading-none text-ink-1',
        'shadow-[inset_0_0_0_0.12em_var(--color-brass),inset_0_0_0_0.17em_rgb(15_21_36/0.35),0_0_0_0.1em_var(--color-ink-1),var(--shadow-card)]',
        className,
      )}
    >
      <span aria-hidden className="translate-y-[0.03em]">
        D
      </span>
    </span>
  );
});

export interface BlindTagProps {
  kind: BlindKind;
  /** Accessible name override (e.g. translated). */
  label?: string | undefined;
  className?: string | undefined;
}

/**
 * "SB" / "BB" printed tag for an ivory seat plate: index face, tracked caps,
 * thin border in the plate's secondary ink. Inherits color via currentColor.
 */
export const BlindTag = memo(function BlindTag({ kind, label, className }: BlindTagProps) {
  return (
    <span
      aria-label={label ?? (kind === 'SB' ? 'Small blind' : 'Big blind')}
      className={cn(
        'label-index inline-flex items-center rounded-[var(--radius-stamp)] border border-current px-[0.4em] py-[0.08em]',
        'text-[0.7em] font-bold leading-none tracking-caps-tight text-on-ivory-2',
        className,
      )}
    >
      {kind}
    </span>
  );
});
