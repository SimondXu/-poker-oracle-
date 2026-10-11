import type { KeyboardEvent } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';
import { formatAmount, type RaiseBounds, type SizingPreset } from '../../lib/action-bar-sizing';

interface SizingRowProps {
  presets: SizingPreset[];
  bounds: RaiseBounds;
  /** Amount currently selected (draft already resolved). */
  amount: number;
  /** Raw text while typing, else null. */
  draft: string | null;
  isBet: boolean;
  onPreset: (preset: SizingPreset) => void;
  onSlide: (value: number) => void;
  onDraftChange: (text: string) => void;
  onDraftCommit: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Presets + slider + numeric input, shown above the main row while the raise flow is open. */
export function SizingRow({
  presets,
  bounds,
  amount,
  draft,
  isBet,
  onPreset,
  onSlide,
  onDraftChange,
  onDraftCommit,
  onCancel,
  onConfirm,
}: SizingRowProps) {
  const label = isBet ? 'Bet sizing' : 'Raise sizing';

  // Slider and input own Enter/Esc themselves (the global hotkeys skip them on purpose).
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      onConfirm();
    }
  };

  return (
    <div role="group" aria-label={label} onKeyDown={handleKeyDown} className="mb-2 flex flex-col gap-2">
      <div className="grid grid-cols-5 gap-1.5">
        {presets.map((preset, index) => {
          const selected = preset.amount === amount;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${preset.label}, ${formatAmount(preset.amount)}`}
              aria-keyshortcuts={String(index + 1)}
              onClick={() => onPreset(preset)}
              className={cn(
                'relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-[var(--radius-panel)] border px-1 tabular-nums',
                'outline-offset-2 transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-[var(--color-chip)]',
                selected
                  ? 'border-raise bg-raise/20 text-text'
                  : 'border-line bg-panel-2 text-text-2 hover:border-text-3 hover:text-text',
              )}
            >
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute left-1 top-0.5 hidden font-mono text-[9px] leading-none opacity-50 md:block"
              >
                {index + 1}
              </kbd>
              <span className="text-[13px] font-semibold leading-tight">{preset.label}</span>
              <span className="max-w-full truncate text-[10px] leading-tight text-text-3">
                {formatAmount(preset.amount)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Slider.Root
          min={bounds.min}
          max={bounds.max}
          step={1}
          value={[amount]}
          disabled={bounds.min >= bounds.max}
          onValueChange={(values) => onSlide(values[0] ?? bounds.min)}
          className="relative flex h-8 min-w-0 flex-1 touch-none select-none items-center"
        >
          <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-panel-2">
            <Slider.Range className="absolute h-full rounded-full bg-raise" />
          </Slider.Track>
          <Slider.Thumb
            aria-label="Amount slider"
            className="block size-5 rounded-full border-2 border-panel bg-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-chip)]"
          />
        </Slider.Root>

        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={isBet ? 'Bet amount' : 'Raise to amount'}
          value={draft ?? String(amount)}
          onChange={(event) => onDraftChange(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={onDraftCommit}
          className="h-10 w-24 rounded-[var(--radius-panel)] border border-line bg-panel-2 px-2 text-right text-[15px] font-semibold tabular-nums text-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-chip)]"
        />

        <button
          type="button"
          onClick={onCancel}
          aria-keyshortcuts="Escape"
          className="shrink-0 rounded-[var(--radius-panel)] px-2 py-2 text-[13px] text-text-2 underline-offset-2 outline-offset-2 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-chip)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
