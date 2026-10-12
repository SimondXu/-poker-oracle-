'use client';

import { useEffect, useRef } from 'react';
import { resolveHotkey, type HotkeyCommand } from '../lib/action-bar-hotkeys';

export interface ActionHotkeyHandlers {
  onFold: () => void;
  onCheckCall: () => void;
  onOpenRaise: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onPreset: (index: number) => void;
}

interface UseActionHotkeysOptions {
  enabled: boolean;
  raiseOpen: boolean;
  handlers: ActionHotkeyHandlers;
}

/**
 * Registers one window keydown listener while `enabled`. Handlers and
 * `raiseOpen` are read through a ref so the listener is never re-attached
 * when they change. Key filtering lives in `resolveHotkey` (pure, tested).
 */
export function useActionHotkeys({ enabled, raiseOpen, handlers }: UseActionHotkeysOptions): void {
  const latest = useRef({ raiseOpen, handlers });
  useEffect(() => {
    latest.current = { raiseOpen, handlers };
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const { raiseOpen: isRaiseOpen, handlers: current } = latest.current;
      const command = resolveHotkey(event, event.target as Element | null, { raiseOpen: isRaiseOpen });
      if (!command) return;
      event.preventDefault();
      dispatch(command, current);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

function dispatch(command: HotkeyCommand, handlers: ActionHotkeyHandlers): void {
  switch (command.type) {
    case 'fold':
      handlers.onFold();
      break;
    case 'check-call':
      handlers.onCheckCall();
      break;
    case 'open-raise':
      handlers.onOpenRaise();
      break;
    case 'confirm':
      handlers.onConfirm();
      break;
    case 'cancel':
      handlers.onCancel();
      break;
    case 'preset':
      handlers.onPreset(command.index);
      break;
  }
}
