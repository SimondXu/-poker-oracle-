import { memo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { ActionTagKind } from './types';

export interface ActionTagProps {
  kind: ActionTagKind;
  /** e.g. "check", "call 40", "raise 120" (rendered uppercase). */
  label: string;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

/**
 * Ink per action kind. Quiet actions print in navy / muted ink; aggression
 * (bet, raise, all-in) prints in vermilion. Only RAISE and ALL IN are struck
 * at an angle, like a hand stamp.
 */
const KIND_CLASS: Record<ActionTagKind, string> = {
  fold: 'border-on-ivory-2/70 bg-ivory text-on-ivory-2',
  check: 'border-on-ivory/60 bg-ivory text-on-ivory',
  call: 'border-on-ivory bg-ivory text-on-ivory',
  bet: 'border-vermilion-ink bg-ivory text-vermilion-ink',
  raise: 'border-[0.14em] border-vermilion-ink bg-ivory text-vermilion-ink rotate-[-3deg]',
  all_in: 'border-[0.14em] border-vermilion bg-vermilion text-ivory rotate-[-3deg]',
};

/** Printed stamp with the seat's last action on this street. Sized in em. */
export const ActionTag = memo(function ActionTag({ kind, label, className, style }: ActionTagProps) {
  return (
    <span
      className={cn(
        'label-index inline-flex items-center whitespace-nowrap rounded-[var(--radius-stamp)] border px-[0.5em] py-[0.18em]',
        'text-[0.78em] font-bold leading-none tracking-caps-tight shadow-[0_1px_2px_rgb(5_8_16/0.35)]',
        KIND_CLASS[kind],
        className,
      )}
      style={style}
    >
      {label}
    </span>
  );
});
