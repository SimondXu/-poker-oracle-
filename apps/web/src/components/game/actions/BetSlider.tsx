'use client';

import { memo, useCallback } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { cn, formatChips } from '@/lib/utils';

interface BetSliderProps {
  value: number;
  min: number;
  max: number;
  pot: number;         // 当前底池（用于快捷尺寸计算）
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

interface ShortcutButton {
  label: string;
  getValue: (min: number, max: number, pot: number) => number;
}

const SHORTCUTS: ShortcutButton[] = [
  { label: '½ 底池', getValue: (min, max, pot) => Math.min(max, Math.max(min, Math.round(pot / 2))) },
  { label: '底池',   getValue: (min, max, pot) => Math.min(max, Math.max(min, pot)) },
  { label: '2x',    getValue: (min, max, pot) => Math.min(max, Math.max(min, pot * 2)) },
];

export const BetSlider = memo(function BetSlider({
  value,
  min,
  max,
  pot,
  onChange,
  disabled = false,
  className,
}: BetSliderProps) {
  const isAllIn = value >= max;

  const handleShortcut = useCallback(
    (getValue: (min: number, max: number, pot: number) => number) => {
      onChange(getValue(min, max, pot));
    },
    [min, max, pot, onChange],
  );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* 快捷尺寸按钮 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SHORTCUTS.map(({ label, getValue }) => {
          const shortcutVal = getValue(min, max, pot);
          const isActive = shortcutVal === value;
          return (
            <button
              key={label}
              onClick={() => handleShortcut(getValue)}
              disabled={disabled}
              className={cn(
                'h-9 rounded-md border text-[12px] font-medium transition-all',
                isActive
                  ? 'border-[var(--color-gold)]/50 bg-[var(--color-gold)]/10 text-[var(--color-gold)]'
                  : 'border-white/10 bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:border-white/22 hover:text-[var(--color-text-secondary)]',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {label}
            </button>
          );
        })}

        {/* 全压按钮 */}
        <button
          onClick={() => onChange(max)}
          disabled={disabled}
          className={cn(
            'h-9 rounded-md border text-[12px] font-bold transition-all',
            isAllIn
              ? 'border-[var(--color-success)]/50 bg-[var(--color-success)]/10 text-[var(--color-success)]'
              : 'border-white/10 bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:border-[var(--color-success)]/32 hover:text-[var(--color-success)]',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          全压
        </button>
      </div>

      {/* 滑块 */}
      <Slider.Root
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={(vals) => onChange(vals[0] ?? min)}
        disabled={disabled}
        className="relative flex h-7 w-full touch-none select-none items-center"
      >
        <Slider.Track
          data-radix-slider-track
          className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-deep)]"
        >
          <Slider.Range
            data-radix-slider-range
            className="absolute h-full rounded-full"
            style={{
              background: isAllIn
                ? 'linear-gradient(90deg, var(--color-success), #81C784)'
                : 'linear-gradient(90deg, var(--color-gold-muted), var(--color-gold))',
            }}
          />
        </Slider.Track>
        <Slider.Thumb data-radix-slider-thumb aria-label="bet amount" />
      </Slider.Root>

      {/* 金额显示 */}
      <div className="flex items-center justify-between">
        <span className="font-chips text-[12px] text-[var(--color-text-dim)]">{formatChips(min)}</span>
        <div className="flex items-center gap-2">
          {isAllIn && (
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-success)]">
              All-in
            </span>
          )}
          <span className="font-chips text-[19px] font-bold text-[var(--color-gold)]">
            {formatChips(value)}
          </span>
        </div>
        <span className="font-chips text-[12px] text-[var(--color-text-dim)]">{formatChips(max)}</span>
      </div>

      {/* 进度指示（百分比位置） */}
      <div className="text-center text-[12px] text-[var(--color-text-dim)]">
        底池的 {Math.round((value / Math.max(pot, 1)) * 100)}%
      </div>
    </div>
  );
});
