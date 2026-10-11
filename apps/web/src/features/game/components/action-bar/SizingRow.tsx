import type { KeyboardEvent } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { useFormatNumber, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { RaiseBounds, SizingPreset } from '../../lib/action-bar-sizing';

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
  const t = useT();
  const fmt = useFormatNumber();
  const label = isBet ? t('actionbar.sizing.bet') : t('actionbar.sizing.raise');
  const presetLabel = (preset: SizingPreset) =>
    preset.id === 'pot' ? t('actionbar.sizing.pot') : preset.id === 'all-in' ? t('actionbar.sizing.allIn') : preset.label;

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
    <div role="group" aria-label={label} onKeyDown={handleKeyDown} className="flex flex-col gap-snug">
      <div className="grid grid-cols-5 gap-snug">
        {presets.map((preset, index) => {
          const selected = preset.amount === amount;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              aria-label={t('actionbar.sizing.presetAria', { label: presetLabel(preset), amount: fmt(preset.amount) })}
              aria-keyshortcuts={String(index + 1)}
              data-layout-box="preset"
              onClick={() => onPreset(preset)}
              className={cn(
                'relative flex h-11 w-full min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-hair rounded-[var(--radius-control)] border px-1 font-index leading-none',
                'outline-offset-2 transition-[transform,background-color,border-color,color] duration-[var(--duration-fast)] ease-out [-webkit-tap-highlight-color:transparent] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-[var(--color-brass)]',
                selected
                  ? 'border-vermilion bg-vermilion/20 text-text'
                  : 'border-line-2 bg-panel-2 text-text-2 hover:border-text-3 hover:text-text',
              )}
            >
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute left-1 top-0.5 hidden text-kbd opacity-50 lg:block"
              >
                {index + 1}
              </kbd>
              <span className="max-w-full truncate text-lead font-bold uppercase tracking-caps-tight">
                {presetLabel(preset)}
              </span>
              <span className="max-w-full truncate text-micro text-text-3">{fmt(preset.amount)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex h-11 items-center gap-3">
        <Slider.Root
          min={bounds.min}
          max={bounds.max}
          step={1}
          value={[amount]}
          disabled={bounds.min >= bounds.max}
          onValueChange={(values) => onSlide(values[0] ?? bounds.min)}
          data-layout-box="raise-slider"
          className="relative mx-2.5 flex h-8 min-w-0 flex-1 touch-none select-none items-center"
        >
          <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-ink-4">
            <Slider.Range className="absolute h-full rounded-full bg-vermilion" />
          </Slider.Track>
          <Slider.Thumb
            aria-label={t('actionbar.sizing.slider')}
            className="block size-5 rounded-full border-2 border-vermilion bg-ivory shadow-plate outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-brass)]"
          />
        </Slider.Root>

        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={isBet ? t('actionbar.sizing.betAmount') : t('actionbar.sizing.raiseAmount')}
          value={draft ?? String(amount)}
          onChange={(event) => onDraftChange(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={onDraftCommit}
          data-layout-box="raise-input"
          className="font-index h-11 w-24 min-w-0 shrink-0 rounded-[var(--radius-control)] border border-line-2 bg-ink-0 px-2 text-right text-label font-bold text-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-brass)]"
        />

        <button
          type="button"
          onClick={onCancel}
          aria-keyshortcuts="Escape"
          data-layout-box="raise-cancel"
          className="label-index h-11 shrink-0 touch-manipulation select-none rounded-[var(--radius-control)] px-2.5 text-body tracking-caps-tight text-text-2 outline-offset-2 transition-colors duration-[var(--duration-fast)] [-webkit-tap-highlight-color:transparent] hover:text-text focus-visible:outline-2 focus-visible:outline-[var(--color-brass)]"
        >
          {t('common.button.cancel')}
        </button>
      </div>
    </div>
  );
}
