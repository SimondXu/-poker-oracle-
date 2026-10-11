import { memo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { ActionTagKind } from './types';

export interface ActionTagProps {
  kind: ActionTagKind;
  /** e.g. "check", "call 40", "raise 120". */
  label: string;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

/** Border + text color per action kind (spec: fold red, call blue, bet/raise green; all-in filled red). */
const KIND_CLASS: Record<ActionTagKind, string> = {
  fold: 'border-fold text-fold bg-plate',
  check: 'border-text-3 text-plate-text bg-plate',
  call: 'border-call text-call bg-plate',
  bet: 'border-raise text-raise bg-plate',
  raise: 'border-raise text-raise bg-plate',
  all_in: 'border-fold bg-fold text-white',
};

/** Small white pill with the seat's last action on this street. Sized in em. */
export const ActionTag = memo(function ActionTag({ kind, label, className, style }: ActionTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-[0.6em] py-[0.2em]',
        'text-[0.75em] font-semibold leading-none tabular-nums',
        KIND_CLASS[kind],
        className,
      )}
      style={style}
    >
      {label}
    </span>
  );
});
