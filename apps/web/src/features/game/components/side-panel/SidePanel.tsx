'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { selectHandResult, useGameStore } from '@/stores/gameStore';
import { summarizeHeroHand } from '../../lib/hand-log-hero';
import { shouldShowWinnerIdentity } from '../../lib/table-animation';
import type { SidePanelProps } from '../slots';
import { CoachView } from './CoachView';
import { HandLogView } from './HandLogView';
import { OpponentsView } from './OpponentsView';

type PanelTab = 'log' | 'coach' | 'opponents';

const TABS: readonly PanelTab[] = ['log', 'coach', 'opponents'];

/**
 * Side panel: ink-navy column with `Log | Coach | Opponents` tabs (WAI-ARIA tab
 * pattern: arrow keys, Home and End move between tabs). The Coach tab comes
 * forward when the hero's turn starts and when the coach is switched on.
 */
export function SidePanel({ hand, trainingData, isTrainingHUDVisible, onToggleTrainingHUD, className }: SidePanelProps) {
  const t = useT();
  // The hand result is read from the store so the slot contract stays unchanged.
  const handResult = useGameStore(selectHandResult);
  const heroId = useAuthStore((state) => state.user?.id ?? null);
  const [tab, setTab] = useState<PanelTab>('log');
  const heroSummary = useMemo(
    () =>
      hand?.phase === 'hand_end' && handResult && shouldShowWinnerIdentity(handResult.phase)
        ? summarizeHeroHand(hand, handResult, heroId)
        : null,
    [hand, handResult, heroId],
  );
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});

  // Turning the coach on from the rail brings its tab forward.
  const wasCoachVisible = useRef(isTrainingHUDVisible);
  useEffect(() => {
    if (isTrainingHUDVisible && !wasCoachVisible.current) setTab('coach');
    wasCoachVisible.current = isTrainingHUDVisible;
  }, [isTrainingHUDVisible]);

  // So does the start of the hero's turn (the suggestion only exists on the hero's turn).
  const isHeroTurn = trainingData?.heroTurn === true;
  const wasHeroTurn = useRef(isHeroTurn);
  useEffect(() => {
    if (isHeroTurn && !wasHeroTurn.current && isTrainingHUDVisible) setTab('coach');
    wasHeroTurn.current = isHeroTurn;
  }, [isHeroTurn, isTrainingHUDVisible]);

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: PanelTab) => {
    const index = TABS.indexOf(current);
    let next: PanelTab | undefined;
    if (event.key === 'ArrowRight') next = TABS[(index + 1) % TABS.length];
    else if (event.key === 'ArrowLeft') next = TABS[(index - 1 + TABS.length) % TABS.length];
    else if (event.key === 'Home') next = TABS[0];
    else if (event.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    event.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <aside aria-label={t('panel.aside.label')} data-layout-box="side-panel" className={cn('min-h-0 bg-panel', className)}>
      <div className="flex h-full min-h-0 flex-col">
        <div
          role="tablist"
          aria-label={t('panel.tab.list')}
          data-layout-box="panel-tabs"
          className="flex shrink-0 border-b border-line"
        >
          {TABS.map((id) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                ref={(node) => {
                  tabRefs.current[id] = node;
                }}
                type="button"
                role="tab"
                id={`side-panel-tab-${id}`}
                aria-selected={selected}
                aria-controls={`side-panel-pane-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(event) => onTabKeyDown(event, id)}
                className={cn(
                  'label-index relative h-11 min-w-0 flex-1 truncate px-1 text-body transition-colors duration-150 ease-out',
                  selected ? 'text-text' : 'text-text-3 hover:bg-panel-2/60 hover:text-text-2',
                )}
              >
                {t(`panel.tab.${id}`)}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-0 bottom-[-1px] h-[2px] bg-brass transition-opacity duration-150 ease-out',
                    selected ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`side-panel-pane-${tab}`}
          aria-labelledby={`side-panel-tab-${tab}`}
          tabIndex={0}
          className="flex min-h-0 flex-1 flex-col focus-visible:outline-offset-[-2px]"
        >
          {tab === 'log' && <HandLogView hand={hand} handResult={handResult} className="flex-1" />}
          {tab === 'coach' && (
            <CoachView
              data={trainingData}
              hand={hand}
              heroId={heroId}
              heroSummary={heroSummary}
              isVisible={isTrainingHUDVisible}
              onToggle={onToggleTrainingHUD}
              className="flex-1"
            />
          )}
          {tab === 'opponents' && <OpponentsView hand={hand} heroId={heroId} className="flex-1" />}
        </div>
      </div>
    </aside>
  );
}
