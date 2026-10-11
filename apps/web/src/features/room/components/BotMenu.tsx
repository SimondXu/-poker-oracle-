'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { BotPersonality } from '@aipoker/shared';
import { useT } from '@/i18n';
import { getPlayerAvatarMeta } from '@/lib/player-avatar';
import { cn } from '@/lib/utils';
import { BOT_PROFILES } from '../lib/bot-profiles';

interface BotMenuProps {
  anchor: HTMLElement;
  seatNumber: number;
  onPick: (strategy: BotPersonality) => void;
  onClose: () => void;
}

const MARGIN = 8;
const GAP = 8;
const MENU_WIDTH = 288;

interface Placement {
  left: number;
  top: number;
  side: 'above' | 'below';
}

/**
 * Bot picker for an open seat. Rendered in a portal and placed against the viewport:
 * a popover that flips above/below the seat and is clamped inside the viewport (sm and up),
 * a bottom sheet on phones. Escape, outside tap and scrolling close it.
 */
export function BotMenu({ anchor, seatNumber, onPick, onClose }: BotMenuProps) {
  const t = useT();
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [shown, setShown] = useState(false);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH, window.innerWidth - MARGIN * 2);
    const height = menu.offsetHeight;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, MARGIN), window.innerWidth - width - MARGIN);
    const roomBelow = window.innerHeight - rect.bottom - GAP - MARGIN;
    const roomAbove = rect.top - GAP - MARGIN;
    const side = roomBelow >= height || roomBelow >= roomAbove ? 'below' : 'above';
    const rawTop = side === 'below' ? rect.bottom + GAP : rect.top - GAP - height;
    const top = Math.min(Math.max(rawTop, MARGIN), Math.max(MARGIN, window.innerHeight - height - MARGIN));
    setPlacement({ left, top, side });
  }, [anchor]);

  useEffect(() => {
    if (!placement) return;
    const frame = requestAnimationFrame(() => setShown(true));
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
  }, [placement]);

  useEffect(() => {
    const close = () => onClose();
    const onScroll = (event: Event) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return;
      onClose();
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
      items[(next + items.length) % items.length]?.focus();
    },
    [onClose],
  );

  const style = {
    '--menu-left': `${placement?.left ?? 0}px`,
    '--menu-top': `${placement?.top ?? 0}px`,
    '--menu-w': `${Math.min(MENU_WIDTH, typeof window === 'undefined' ? MENU_WIDTH : window.innerWidth - MARGIN * 2)}px`,
    transformOrigin: placement?.side === 'above' ? '50% 100%' : '50% 0',
  } as CSSProperties;

  return createPortal(
    <>
      <div
        aria-hidden
        onPointerDown={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/55 transition-opacity duration-[var(--duration-normal)] ease-out motion-reduce:transition-none sm:bg-transparent',
          shown ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={t('lobby.room.seat.menuTitle', { seat: seatNumber })}
        onKeyDown={onKeyDown}
        style={style}
        className={cn(
          'fixed z-50 border border-line-2 bg-panel shadow-float transition-[opacity,transform] duration-[var(--duration-normal)] ease-out motion-reduce:transition-none',
          // Phone: bottom sheet.
          'inset-x-0 bottom-0 rounded-t-[var(--radius-panel)] pb-[env(safe-area-inset-bottom)]',
          // sm and up: popover at the computed spot.
          'sm:inset-x-auto sm:bottom-auto sm:left-[var(--menu-left)] sm:top-[var(--menu-top)] sm:w-[var(--menu-w)] sm:rounded-[var(--radius-panel)] sm:pb-0',
          placement === null && 'invisible',
          shown ? 'translate-y-0 opacity-100 sm:scale-100' : 'translate-y-full opacity-0 sm:translate-y-0 sm:scale-95',
        )}
      >
        <p className="border-b border-line px-4 py-3 text-body text-text-3">
          {t('lobby.room.seat.menuTitle', { seat: seatNumber })}
        </p>
        <div className="py-1">
          {BOT_PROFILES.map((profile) => {
            const avatar = getPlayerAvatarMeta({ name: t(profile.nameKey), isBot: true, botStrategy: profile.value });
            return (
              <button
                key={profile.value}
                type="button"
                role="menuitem"
                data-testid={`bot-option-${profile.value}`}
                onClick={() => onPick(profile.value)}
                className="flex w-full touch-manipulation select-none items-start gap-3 px-4 py-3 text-left [-webkit-tap-highlight-color:transparent] transition-colors duration-[var(--duration-fast)] hover:bg-panel-2 focus-visible:bg-panel-2 focus-visible:outline-offset-[-2px] active:bg-ink-4 motion-reduce:transition-none"
              >
                <span className="mt-hair flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-2 bg-page">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatar.src ?? '/avatars/bot-default.svg'} alt="" className="size-full object-cover" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="font-index text-label font-bold text-text">{t(profile.nameKey)}</span>
                    <span className="label-index text-micro tracking-caps-tight text-text-3">{t(profile.styleKey)}</span>
                  </span>
                  <span className="mt-hair block text-body text-text-2">{t(profile.descKey)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>,
    document.body,
  );
}
