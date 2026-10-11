'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { selectHandResult, useGameStore } from '@/stores/gameStore';
import type { SidePanelProps } from '../slots';
import { CoachView } from './CoachView';
import { HandLogView } from './HandLogView';

type PanelTab = 'log' | 'coach';

const TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [
  { id: 'log', label: '牌局记录' },
  { id: 'coach', label: '教练' },
];

/** Side panel: flat dark column with `牌局记录` / `教练` tabs. 320px on lg, a sheet below. */
export function SidePanel({
  hand,
  trainingData,
  isTrainingHUDVisible,
  onToggleTrainingHUD,
  className,
}: SidePanelProps) {
  // The hand result is read from the store so the slot contract stays unchanged.
  const handResult = useGameStore(selectHandResult);
  const [tab, setTab] = useState<PanelTab>('log');

  // Turning the coach on from the rail brings its tab forward.
  const wasCoachVisible = useRef(isTrainingHUDVisible);
  useEffect(() => {
    if (isTrainingHUDVisible && !wasCoachVisible.current) setTab('coach');
    wasCoachVisible.current = isTrainingHUDVisible;
  }, [isTrainingHUDVisible]);

  return (
    <aside aria-label="牌局记录与教练" className={cn('min-h-0 bg-panel', className)}>
      <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="面板" className="flex shrink-0 border-b border-line">
        {TABS.map(({ id, label }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`side-panel-tab-${id}`}
              aria-selected={selected}
              aria-controls={`side-panel-pane-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                'h-9 flex-1 border-b-2 text-[13px] font-semibold transition-colors',
                selected
                  ? 'border-chip text-text'
                  : 'border-transparent text-text-3 hover:bg-panel-2 hover:text-text-2',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`side-panel-pane-${tab}`}
        aria-labelledby={`side-panel-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === 'log' ? (
          <HandLogView hand={hand} handResult={handResult} className="flex-1" />
        ) : (
          <CoachView
            data={trainingData}
            isVisible={isTrainingHUDVisible}
            onToggle={onToggleTrainingHUD}
            className="flex-1"
          />
        )}
      </div>
      </div>
    </aside>
  );
}
