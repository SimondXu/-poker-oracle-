'use client';

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatChips } from '@/lib/utils';
import { BetSlider } from './BetSlider';
import type { ActionType, ValidActions } from '@aipoker/shared';

interface ActionPanelProps {
  validActions: ValidActions;
  pot: number;
  isMyTurn: boolean;
  onAction: (type: ActionType, amount?: number) => void;
  className?: string;
}

export const ActionPanel = memo(function ActionPanel({
  validActions,
  pot,
  isMyTurn,
  onAction,
  className,
}: ActionPanelProps) {
  const [raiseAmount, setRaiseAmount] = useState(validActions.minBetOrRaiseTo);
  const [showRaise, setShowRaise] = useState(false);

  useEffect(() => {
    setRaiseAmount(validActions.minBetOrRaiseTo);
    setShowRaise(false);
  }, [validActions.minBetOrRaiseTo]);

  const canRaise = validActions.canBet || validActions.canRaise;
  const raiseLabel = validActions.canBet ? '下注' : '加注';

  const sizingPot = pot > 0 ? pot : validActions.minBetOrRaiseTo;

  const quickPresets = useMemo(() => {
    const min = validActions.minBetOrRaiseTo;
    const max = validActions.maxBetOrRaiseTo;
    const clamp = (v: number) => Math.max(min, Math.min(max, v));

    return [
      { label: '1/2池', value: clamp(Math.round(sizingPot * 0.5)) },
      { label: '1x池', value: clamp(Math.round(sizingPot)) },
      { label: '2x池', value: clamp(Math.round(sizingPot * 2)) },
    ];
  }, [sizingPot, validActions.minBetOrRaiseTo, validActions.maxBetOrRaiseTo]);

  const handleFold = useCallback(() => onAction('fold'), [onAction]);
  const handleCheck = useCallback(() => onAction('check'), [onAction]);
  const handleCall = useCallback(() => onAction('call'), [onAction]);

  const handleRaiseConfirm = useCallback(() => {
    if (raiseAmount >= validActions.maxBetOrRaiseTo) {
      onAction('all_in', validActions.maxBetOrRaiseTo);
    } else if (validActions.canBet) {
      onAction('bet', raiseAmount);
    } else {
      onAction('raise_to', raiseAmount);
    }
    setShowRaise(false);
  }, [onAction, raiseAmount, validActions]);

  const handleAllIn = useCallback(
    () => onAction('all_in', validActions.maxBetOrRaiseTo),
    [onAction, validActions.maxBetOrRaiseTo],
  );

  useEffect(() => {
    if (!isMyTurn) return;

    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key.toLowerCase()) {
        case 'f':
          if (validActions.canFold) handleFold();
          break;
        case 'c':
          if (validActions.canCall) handleCall();
          else if (validActions.canCheck) handleCheck();
          break;
        case 'k':
          if (validActions.canCheck) handleCheck();
          break;
        case 'r':
          if (canRaise) setShowRaise((v) => !v);
          break;
        case 'a':
          if (validActions.canAllIn) handleAllIn();
          break;
        case ' ':
          e.preventDefault();
          if (validActions.canCheck) handleCheck();
          else if (validActions.canCall) handleCall();
          break;
        case 'enter':
          if (showRaise) handleRaiseConfirm();
          break;
        case 'escape':
          setShowRaise(false);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    isMyTurn,
    canRaise,
    validActions,
    handleFold,
    handleCheck,
    handleCall,
    handleAllIn,
    handleRaiseConfirm,
    showRaise,
  ]);

  if (!isMyTurn) return null;

  const potOdds =
    validActions.canCall && validActions.callAmount > 0
      ? Math.round((validActions.callAmount / (pot + validActions.callAmount)) * 100)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={cn(
        'relative overflow-visible rounded-2xl border border-white/14',
        'bg-[linear-gradient(130deg,rgba(8,14,24,0.92),rgba(8,18,32,0.88)_52%,rgba(12,18,28,0.9))]',
        'shadow-[0_14px_36px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]',
        className,
      )}
    >
      <AnimatePresence>
        {showRaise && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute bottom-[calc(100%+10px)] left-0 right-0 z-20"
          >
            <div
              className={cn(
                'overflow-hidden rounded-2xl border border-white/14 p-3.5 sm:p-4',
                'bg-[linear-gradient(130deg,rgba(8,14,24,0.96),rgba(7,18,34,0.94))]',
                'shadow-[0_16px_38px_rgba(0,0,0,0.58)]',
              )}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {quickPresets.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => setRaiseAmount(preset.value)}
                    className={cn(
                      'h-8 rounded-md border px-2.5 text-[11px] font-semibold transition-all',
                      raiseAmount === preset.value
                        ? 'border-[var(--color-gold)]/46 bg-[var(--color-gold)]/14 text-[var(--color-gold)]'
                        : 'border-white/12 bg-white/[0.04] text-[var(--color-text-secondary)] hover:border-white/26 hover:text-[var(--color-text-primary)]',
                    )}
                  >
                    {preset.label}
                  </button>
                ))}

                <button
                  onClick={() => setRaiseAmount(validActions.maxBetOrRaiseTo)}
                  className={cn(
                    'h-8 rounded-md border px-2.5 text-[11px] font-semibold transition-all',
                    raiseAmount >= validActions.maxBetOrRaiseTo
                      ? 'border-[var(--color-success)]/48 bg-[var(--color-success)]/14 text-[var(--color-success)]'
                      : 'border-white/12 bg-white/[0.04] text-[var(--color-text-secondary)] hover:border-[var(--color-success)]/34 hover:text-[var(--color-success)]',
                  )}
                >
                  All-in
                </button>

                <button
                  onClick={() => setShowRaise(false)}
                  className="ml-auto text-[11px] text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text-secondary)]"
                >
                  关闭
                </button>
              </div>

              <BetSlider
                value={raiseAmount}
                min={validActions.minBetOrRaiseTo}
                max={validActions.maxBetOrRaiseTo}
                pot={sizingPot}
                onChange={setRaiseAmount}
              />

              <button
                onClick={handleRaiseConfirm}
                className={cn(
                  'mt-3.5 h-11 w-full rounded-xl border border-[var(--color-gold)]/40',
                  'bg-gradient-to-r from-[var(--color-gold)] to-[#e5b93a]',
                  'text-[13px] font-bold text-[#18202b] transition-all',
                  'hover:brightness-105 active:scale-[0.99]',
                )}
              >
                {raiseAmount >= validActions.maxBetOrRaiseTo ? '确认 All-in' : `${raiseLabel} ${formatChips(raiseAmount)}`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 p-2.5 sm:gap-2.5 sm:p-3">
        <ActionButton
          label="弃牌"
          shortcut="F"
          variant="fold"
          onClick={handleFold}
          disabled={!validActions.canFold}
        />

        {validActions.canCheck ? (
          <ActionButton
            label="过牌"
            shortcut="K"
            variant="neutral"
            onClick={handleCheck}
          />
        ) : (
          <ActionButton
            label={`跟注 ${formatChips(validActions.callAmount)}`}
            shortcut="C"
            variant="call"
            onClick={handleCall}
            disabled={!validActions.canCall}
          />
        )}

        <ActionButton
          label={raiseLabel}
          shortcut="R"
          variant="raise"
          onClick={() => setShowRaise((v) => !v)}
          disabled={!canRaise}
          isActive={showRaise}
        />

        <ActionButton
          label="全压"
          shortcut="A"
          variant="allIn"
          onClick={handleAllIn}
          disabled={!validActions.canAllIn}
        />
      </div>

      <div className="hidden items-center justify-between border-t border-white/8 px-3.5 py-1.5 text-[11px] sm:flex">
        <span className="text-[var(--color-text-dim)]">
          底池 <span className="font-chips text-[var(--color-text-secondary)]">{formatChips(pot)}</span>
        </span>
        {potOdds !== null && (
          <span className="text-[var(--color-text-dim)]">
            赔率 <span className="font-chips text-[var(--color-text-secondary)]">{potOdds}%</span>
          </span>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-dim)]">F K/C R A</span>
      </div>
    </motion.div>
  );
});

const BUTTON_STYLES = {
  fold: {
    base: 'border-[var(--color-error)]/28 text-[#ff9592] hover:bg-[var(--color-error)]/14 hover:border-[var(--color-error)]/45',
    active: '',
  },
  neutral: {
    base: 'border-white/14 text-[var(--color-text-secondary)] hover:bg-white/[0.08] hover:border-white/26',
    active: '',
  },
  call: {
    base: 'border-[var(--color-info)]/34 text-[#83d9ff] hover:bg-[var(--color-info)]/14 hover:border-[var(--color-info)]/52',
    active: '',
  },
  raise: {
    base: 'border-[var(--color-gold)]/30 text-[var(--color-gold)] hover:bg-[var(--color-gold)]/12 hover:border-[var(--color-gold)]/52',
    active: 'bg-[var(--color-gold)]/14 border-[var(--color-gold)]/58 shadow-[0_0_12px_rgba(255,215,0,0.24)]',
  },
  allIn: {
    base: 'border-[var(--color-success)]/30 text-[var(--color-success)] hover:bg-[var(--color-success)]/12 hover:border-[var(--color-success)]/52',
    active: '',
  },
};

function ActionButton({
  label,
  shortcut,
  variant,
  onClick,
  disabled = false,
  isActive = false,
}: {
  label: string;
  shortcut?: string;
  variant: keyof typeof BUTTON_STYLES;
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
}) {
  const styles = BUTTON_STYLES[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-[46px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5',
        'border bg-[rgba(13,22,35,0.72)] transition-all duration-150 active:scale-[0.98]',
        isActive ? styles.active : styles.base,
        disabled && 'pointer-events-none cursor-not-allowed opacity-30',
      )}
    >
      <span className="truncate text-[12px] font-semibold leading-none sm:text-[13px]">{label}</span>
      {shortcut && (
        <span className="hidden font-mono text-[9px] uppercase tracking-[0.15em] opacity-45 sm:inline">[{shortcut}]</span>
      )}
    </button>
  );
}
