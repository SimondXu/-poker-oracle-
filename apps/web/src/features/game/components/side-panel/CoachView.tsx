'use client';

import { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  formatTrainingStrength,
  getTrainingDetailLines,
  getTrainingStrengthBarValue,
  hasTrainingDetails,
} from '@/components/game/hud/training-hud-state';
import type { GameScreenState } from '../../lib/game-screen-state';

type CoachData = NonNullable<GameScreenState['trainingData']>;

const SUGGESTION: Record<NonNullable<CoachData['suggestion']>, { label: string; text: string; border: string }> = {
  call: { label: '考虑跟注', text: 'text-[#6ea0f2]', border: 'border-call' },
  fold: { label: '考虑弃牌', text: 'text-[#d96a6a]', border: 'border-fold' },
  raise: { label: '考虑加注', text: 'text-[#4fc56b]', border: 'border-raise' },
  check: { label: '过牌合理', text: 'text-text', border: 'border-text-3' },
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function strengthColor(value: number): string {
  if (value >= 0.66) return 'bg-raise';
  if (value >= 0.33) return 'bg-chip';
  return 'bg-fold';
}

interface CoachViewProps {
  data: GameScreenState['trainingData'];
  isVisible: boolean;
  onToggle: () => void;
  className?: string | undefined;
}

export const CoachView = memo(function CoachView({ data, isVisible, onToggle, className }: CoachViewProps) {
  const [expanded, setExpanded] = useState(false);

  if (!isVisible) {
    return (
      <div className={cn('flex flex-col items-start gap-2 px-3 py-4 text-[13px] text-text-2', className)}>
        <p>教练提示已关闭。</p>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-[var(--radius-panel)] bg-panel-2 px-3 py-1.5 text-[13px] font-semibold text-text hover:bg-line"
        >
          开启教练
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className={cn('px-3 py-4 text-[13px] text-text-3', className)}>轮到你、或你有手牌时显示提示。</p>;
  }

  const strengthBar = getTrainingStrengthBarValue(data.strength);
  const suggestion = data.suggestion ? SUGGESTION[data.suggestion] : null;
  const detailLines = getTrainingDetailLines(data);
  const showRequirement = data.winRequirement !== undefined && (data.potOdds ?? 0) > 0;
  const equity = data.strength.kind === 'equity' ? data.strength.value : null;

  return (
    <div className={cn('min-h-0 space-y-3 overflow-y-auto px-3 py-3 text-[13px]', className)}>
      <section aria-label="手牌强度">
        <div className="flex items-baseline justify-between">
          <span className="text-text-2">手牌强度</span>
          <span className="font-bold tabular-nums text-text">{formatTrainingStrength(data.strength)}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2">
          <div className={cn('h-full rounded-full', strengthColor(strengthBar))} style={{ width: `${Math.round(strengthBar * 100)}%` }} />
        </div>
      </section>

      {showRequirement && data.winRequirement !== undefined && (
        <section aria-label="底池赔率">
          <div className="flex items-baseline justify-between">
            <span className="text-text-2">底池赔率 {pct(data.potOdds ?? 0)}</span>
            <span className="tabular-nums text-text-2">
              需要权益 <span className="font-bold text-text">{pct(data.winRequirement)}</span>
            </span>
          </div>
          <div className="relative mt-1 h-1.5 rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-chip" style={{ width: pct(Math.min(1, data.winRequirement)) }} />
            {equity !== null && (
              <div
                className={cn(
                  'absolute -top-[3px] h-[12px] w-[3px] rounded-full',
                  equity >= data.winRequirement ? 'bg-raise' : 'bg-fold',
                )}
                style={{ left: `calc(${Math.min(100, Math.round(equity * 100))}% - 1.5px)` }}
                title={`你的权益 ${pct(equity)}`}
              />
            )}
          </div>
          {equity !== null && (
            <p className="mt-1 text-[11px] text-text-3">竖线 = 你的权益 {pct(equity)}</p>
          )}
        </section>
      )}

      {data.position && (
        <div className="flex items-center justify-between">
          <span className="text-text-2">位置</span>
          <span className="rounded-[var(--radius-panel)] bg-panel-2 px-2 py-0.5 text-[12px] font-bold text-text">
            {data.position}
          </span>
        </div>
      )}

      {suggestion && (
        <section
          aria-label="建议"
          className={cn('rounded-[var(--radius-panel)] border-l-[3px] bg-panel-2 px-3 py-2', suggestion.border)}
        >
          <p className={cn('font-bold', suggestion.text)}>{suggestion.label}</p>
          {data.suggestionReason && <p className="mt-0.5 text-[12px] leading-snug text-text-2">{data.suggestionReason}</p>}
        </section>
      )}

      {hasTrainingDetails(data) && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="flex items-center gap-1 text-[12px] text-text-3 hover:text-text-2"
          >
            <span aria-hidden className={cn('inline-block transition-transform duration-150', expanded && 'rotate-90')}>
              ▸
            </span>
            {expanded ? '收起详情' : '详情'}
          </button>
          {expanded && (
            <div className="mt-1 space-y-1 text-[12px] leading-relaxed text-text-2">
              {detailLines.map((line, index) => (
                <p key={`${index}-${line}`}>{line}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
