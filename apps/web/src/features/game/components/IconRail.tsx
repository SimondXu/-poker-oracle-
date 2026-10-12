'use client';

import { useEffect, type ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { isPanelToggleHotkey } from '../lib/hand-log-hotkey';
import type { IconRailProps } from './slots';

const BUTTON =
  'flex size-10 touch-manipulation items-center justify-center rounded-[var(--radius-control)] border border-transparent text-text-3 outline-offset-2 transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-[var(--color-brass)] hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-text-3';

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function BackIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M10 6l-6 6 6 6" />
      <path d="M4 12h16" />
    </svg>
  );
}

/** Hand log: a ruled page. */
function LogIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
      <path d="M8 8h8M8 12h8M8 16h4.5" />
    </svg>
  );
}

/** Coach: an eye over the table. */
function CoachIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Settings: two slider tracks. */
function SettingsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
      <circle cx="15" cy="8" r="2" />
      <circle cx="9" cy="16" r="2" />
    </svg>
  );
}

interface RailButtonProps {
  label: string;
  hint?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

function RailButton({ label, hint, pressed, disabled, onClick, children }: RailButtonProps) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
      className={cn(BUTTON, pressed && 'border-brass/60 bg-panel-2 text-text')}
    >
      {children}
    </button>
  );

  return (
    <Tooltip.Root>
      {/* A disabled button swallows pointer events, so the trigger wraps it in a span. */}
      <Tooltip.Trigger asChild>{disabled ? <span tabIndex={0} className="rounded-[var(--radius-control)]">{button}</span> : button}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="z-[60] flex items-center gap-2 rounded-[var(--radius-control)] border border-line-2 bg-panel-2 px-2.5 py-1.5 text-body text-text shadow-float"
        >
          {label}
          {hint ? <kbd className="rounded-[2px] border border-line-2 bg-panel px-1 font-index text-[11px] text-text-2">{hint}</kbd> : null}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Left icon rail (56px). Owns the single `L` hotkey that toggles the side panel. */
export function IconRail({
  isPanelOpen,
  isTrainingHUDVisible,
  onTogglePanel,
  onToggleHUD,
  onBack,
  className,
}: IconRailProps) {
  const t = useT();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const role = target?.closest('[role]')?.getAttribute('role') ?? null;
      if (isPanelToggleHotkey(event, target ? { tagName: target.tagName, isContentEditable: target.isContentEditable, role } : null)) {
        onTogglePanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTogglePanel]);

  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={100}>
      <nav
        aria-label={t('common.rail.label')}
        data-layout-box="icon-rail"
        className={cn(
          'min-h-0 w-14 shrink-0 flex-col items-center gap-snug overflow-y-auto border-r border-line bg-panel py-3 [scrollbar-width:none]',
          className,
        )}
      >
        <RailButton label={t('common.game.backToLobby')} onClick={onBack}>
          <BackIcon />
        </RailButton>
        <div className="my-tight h-px w-6 bg-brass/30" aria-hidden />
        <RailButton label={t('common.rail.log')} hint="L" pressed={isPanelOpen} onClick={onTogglePanel}>
          <LogIcon />
        </RailButton>
        <RailButton label={t('common.rail.coach')} pressed={isTrainingHUDVisible} onClick={onToggleHUD}>
          <CoachIcon />
        </RailButton>
        <div className="mt-auto" />
        <RailButton label={t('common.rail.settings')} disabled>
          <SettingsIcon />
        </RailButton>
      </nav>
    </Tooltip.Provider>
  );
}
