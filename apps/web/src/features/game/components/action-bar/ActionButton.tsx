import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ActionButtonVariant = 'fold' | 'fold-secondary' | 'call' | 'raise' | 'neutral';

/**
 * Card-Room Print: Fold is quiet ink, Call is outlined ink with ivory text and a fine printed double rule,
 * Raise is the vermilion ink. The inset rules are painted with box-shadow so they never
 * change the box size.
 */
const VARIANT_CLASS: Record<ActionButtonVariant, string> = {
  fold: 'border border-line-2 bg-transparent text-text-2 hover:bg-panel-2 hover:text-text',
  'fold-secondary': 'border border-line bg-transparent text-text-3 hover:text-text-2',
  call: 'border border-text/55 bg-panel-2 text-text shadow-[inset_0_0_0_3px_var(--color-ink-3),inset_0_0_0_4px_rgb(236_231_219/0.3)] hover:brightness-125',
  raise:
    'bg-vermilion text-ivory shadow-[inset_0_0_0_3px_var(--color-vermilion),inset_0_0_0_4px_rgb(242_236_224/0.4)] hover:brightness-110',
  neutral: 'border border-line-2 bg-panel-2 text-text hover:brightness-110',
};

interface ActionButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  variant: ActionButtonVariant;
  /** Keyboard hint, shown beside the label from md up. */
  hint?: string;
  /** Amount, set in the index face on the label's baseline ("Call 20"). */
  amount?: ReactNode;
  /** Shorter label used below `sm`, so "Raise to 1,000" fits a phone slot as "Raise 1,000". */
  shortLabel?: ReactNode;
  children: ReactNode;
}

/**
 * Fixed-height button for every slot of the action bar. Every button has the same
 * anatomy: one line, label then amount on one baseline, then the keyboard chip. A long
 * amount truncates inside the slot instead of wrapping or pushing its neighbours.
 * Width comes from the grid, never from the content.
 */
export function ActionButton({
  variant,
  hint,
  amount,
  shortLabel,
  className,
  children,
  type = 'button',
  ...rest
}: ActionButtonProps) {
  const hasValue = amount !== undefined && amount !== null && amount !== '';
  return (
    <button
      type={type}
      aria-keyshortcuts={hint && hint.length === 1 ? hint : undefined}
      className={cn(
        'relative flex h-14 w-full min-w-0 touch-manipulation select-none items-center justify-center rounded-[var(--radius-control)] px-2',
        'transition-[transform,filter,background-color,color] duration-[var(--duration-fast)] ease-out [-webkit-tap-highlight-color:transparent] active:scale-[0.97]',
        'outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-brass)]',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 disabled:active:scale-100',
        VARIANT_CLASS[variant],
        className,
      )}
      {...rest}
    >
      <span className="flex min-w-0 max-w-full items-baseline justify-center gap-snug">
        <span className="label-index min-w-0 truncate text-lead tracking-caps-tight sm:text-label">
          {shortLabel ? (
            <>
              <span className="sm:hidden">{shortLabel}</span>
              <span className="max-sm:hidden">{children}</span>
            </>
          ) : (
            children
          )}
        </span>
        {hasValue && (
          <span className="label-index min-w-0 shrink-0 truncate text-lead font-bold tracking-normal tabular-nums sm:text-label">
            {amount}
          </span>
        )}
        {hint && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none hidden h-4 shrink-0 items-center self-center rounded-[2px] border border-current/30 px-1 font-index text-kbd font-semibold uppercase opacity-70 md:inline-flex"
          >
            {hint}
          </kbd>
        )}
      </span>
    </button>
  );
}
