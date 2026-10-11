'use client';

import { useEffect, type ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
import { isPanelToggleHotkey } from '../lib/hand-log-hotkey';
import type { IconRailProps } from './slots';

const BUTTON =
  'flex size-9 items-center justify-center rounded-[var(--radius-panel)] text-text-2 transition-colors hover:bg-panel-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-2';

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function BackIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M15 5l-7 7 7 7" />
      <path d="M8 12h12" />
    </svg>
  );
}

function LogIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 8.5h8M8 12.5h8M8 16.5h5" />
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.4.3.6.8.6 1.2v.5h6V15c0-.4.2-.9.6-1.2A6 6 0 0 0 12 3z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
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
      className={cn(BUTTON, pressed && 'bg-panel-2 text-text')}
    >
      {children}
    </button>
  );

  return (
    <Tooltip.Root>
      {/* A disabled button swallows pointer events, so the trigger wraps it in a span. */}
      <Tooltip.Trigger asChild>{disabled ? <span tabIndex={0}>{button}</span> : button}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="z-[60] rounded-[var(--radius-panel)] border border-line bg-panel-2 px-2 py-1 text-[12px] text-text shadow-plate"
        >
          {label}
          {hint ? <kbd className="ml-2 rounded-[3px] bg-panel px-1 text-[11px] text-text-2">{hint}</kbd> : null}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Left icon rail (48px). Owns the single `L` hotkey that toggles the side panel. */
export function IconRail({
  isPanelOpen,
  isTrainingHUDVisible,
  onTogglePanel,
  onToggleHUD,
  onBack,
  className,
}: IconRailProps) {
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
        aria-label="游戏工具"
        className={cn('w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2', className)}
      >
        <RailButton label="返回大厅" onClick={onBack}>
          <BackIcon />
        </RailButton>
        <div className="my-1 h-px w-6 bg-line" aria-hidden />
        <RailButton label="牌局记录" hint="L" pressed={isPanelOpen} onClick={onTogglePanel}>
          <LogIcon />
        </RailButton>
        <RailButton label="教练提示" pressed={isTrainingHUDVisible} onClick={onToggleHUD}>
          <CoachIcon />
        </RailButton>
        <div className="mt-auto" />
        <RailButton label="设置（即将推出）" disabled>
          <SettingsIcon />
        </RailButton>
      </nav>
    </Tooltip.Provider>
  );
}
