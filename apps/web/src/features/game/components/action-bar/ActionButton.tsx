import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/utils';

export type ActionButtonVariant = 'fold' | 'fold-secondary' | 'call' | 'raise' | 'neutral';

const VARIANT_CLASS: Record<ActionButtonVariant, string> = {
  fold: 'bg-fold text-white',
  'fold-secondary': 'border border-line bg-panel-2 text-text-2 hover:text-text',
  call: 'bg-call text-white',
  raise: 'bg-raise text-white',
  neutral: 'border border-line bg-panel-2 text-text',
};

interface ActionButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  variant: ActionButtonVariant;
  /** Keyboard hint shown in the corner on devices with a keyboard (md+). */
  hint?: string;
  children: React.ReactNode;
}

/** Flat, large-hit-area button used by every slot of the action bar. */
export function ActionButton({ variant, hint, className, children, type = 'button', ...rest }: ActionButtonProps) {
  return (
    <button
      type={type}
      aria-keyshortcuts={hint && hint.length === 1 ? hint : undefined}
      className={cn(
        'relative flex min-h-12 min-w-0 items-center justify-center rounded-[var(--radius-panel)] px-2 text-[15px] font-semibold leading-tight tabular-nums',
        'transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 active:brightness-90',
        'outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-chip)]',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100',
        'md:min-h-14 md:text-[16px]',
        VARIANT_CLASS[variant],
        className,
      )}
      {...rest}
    >
      {hint && (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute left-1.5 top-1 hidden font-mono text-[10px] font-normal uppercase leading-none opacity-60 md:block"
        >
          {hint}
        </kbd>
      )}
      <span className="flex flex-wrap items-center justify-center gap-x-1.5 text-center">{children}</span>
    </button>
  );
}
