/** Shared class strings for the home and waiting room. Press feedback is :active; hover is gated by Tailwind's hover: variant. */
const PRESS =
  'touch-manipulation select-none [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,border-color,color,opacity] duration-[var(--duration-fast)] ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100';

const BUTTON_BASE = `${PRESS} inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] font-index uppercase leading-none tracking-caps-tight`;

const PRIMARY_TONE =
  'bg-vermilion text-ivory shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,0_6px_16px_-6px_rgb(0_0_0/0.6)] hover:bg-vermilion-hi disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-text-3 disabled:shadow-none';

const SECONDARY_TONE =
  'border border-line-2 bg-transparent text-text hover:border-brass/60 hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-45';

export const primaryButton = `${BUTTON_BASE} ${PRIMARY_TONE} h-12 whitespace-nowrap px-4 text-label font-bold`;
export const primaryButtonLarge = `${BUTTON_BASE} ${PRIMARY_TONE} h-14 px-5 text-value font-bold`;
export const secondaryButton = `${BUTTON_BASE} ${SECONDARY_TONE} h-12 px-5 text-label font-semibold`;
export const secondaryButtonCompact = `${BUTTON_BASE} ${SECONDARY_TONE} h-12 px-3 text-lead font-semibold`;

export const textField =
  'h-12 w-full rounded-[var(--radius-control)] border border-line-2 bg-panel px-3.5 text-input text-text outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-text-3 focus:border-brass focus-visible:outline-none';

/** The room code field: index face, spaced. */
export const codeField = `${textField} font-index text-value font-semibold uppercase tracking-caps-wide placeholder:font-normal placeholder:tracking-caps-wide`;

/** Label above a field: index face, quiet. */
export const fieldLabel = 'label-index block text-micro text-text-3';
