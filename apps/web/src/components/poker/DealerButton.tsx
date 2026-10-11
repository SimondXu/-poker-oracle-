import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { BlindKind } from './types';

export interface DealerButtonProps {
  className?: string | undefined;
}

/** Small white "D" disc. Sized in em. */
export const DealerButton = memo(function DealerButton({ className }: DealerButtonProps) {
  return (
    <span
      role="img"
      aria-label="Dealer button"
      className={cn(
        'inline-flex size-[1.5em] items-center justify-center rounded-full bg-white',
        'text-[0.8em] font-extrabold leading-none text-plate-text shadow-[var(--shadow-card)]',
        className,
      )}
    >
      D
    </span>
  );
});

export interface BlindTagProps {
  kind: BlindKind;
  className?: string | undefined;
}

/** Small "SB" / "BB" tag for a seat plate. */
export const BlindTag = memo(function BlindTag({ kind, className }: BlindTagProps) {
  return (
    <span
      aria-label={kind === 'SB' ? 'Small blind' : 'Big blind'}
      className={cn(
        'inline-flex items-center rounded-full bg-panel-2 px-[0.45em] py-[0.15em]',
        'text-[0.65em] font-bold leading-none text-text-2',
        className,
      )}
    >
      {kind}
    </span>
  );
});
