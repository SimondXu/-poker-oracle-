'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatChips } from '@/lib/utils';
import { BetSlider } from './BetSlider';
import type { ValidActions } from '@aipoker/shared';

interface ActionPanelProps {
  validActions: ValidActions;
  pot: number;
  isMyTurn: boolean;
  onAction: (type: string, amount?: number) => void;
  className?: string;
}

type ActionButtonConfig = {
  key: string;
  label: string;
  sublabel?: string;
  shortcut?: string;
  variant: 'fold' | 'neutral' | 'call' | 'raise';
  onClick: () => void;
  disabled?: boolean;
};

export const ActionPanel = memo(function ActionPanel({
  validActions,
  pot,
  isMyTurn,
  onAction,
  className,
}: ActionPanelProps) {
  const [raiseAmount, setRaiseAmount] = useState(validActions.minBetOrRaiseTo);
  const [showRaise, setShowRaise] = useState(false);

  // validActions 变化时重置加注金额
  useEffect(() => {
    setRaiseAmount(validActions.minBetOrRaiseTo);
    setShowRaise(false);
  }, [validActions.minBetOrRaiseTo]);

  const handleFold = useCallback(() => onAction('fold'), [onAction]);
  const handleCheck = useCallback(() => onAction('check'), [onAction]);
  const handleCall = useCallback(() => onAction('call'), [onAction]);
  const handleRaise = useCallback(() => {
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

  // 快捷键
  useEffect(() => {
    if (!isMyTurn) return;

    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case 'f': if (validActions.canFold) handleFold(); break;
        case 'c': if (validActions.canCall) handleCall(); else if (validActions.canCheck) handleCheck(); break;
        case 'k': if (validActions.canCheck) handleCheck(); break;
        case 'r': if (validActions.canRaise || validActions.canBet) setShowRaise(v => !v); break;
        case 'a': if (validActions.canAllIn) handleAllIn(); break;
        case ' ':
          e.preventDefault();
          if (validActions.canCheck) handleCheck();
          else if (validActions.canCall) handleCall();
          break;
        case 'enter':
          if (showRaise) handleRaise();
          break;
        case 'escape':
          setShowRaise(false);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMyTurn, validActions, handleFold, handleCheck, handleCall, handleAllIn, handleRaise, showRaise]);

  const buttons: ActionButtonConfig[] = [
    {
      key: 'fold',
      label: '弃牌',
      shortcut: 'F',
      variant: 'fold',
      onClick: handleFold,
      disabled: !validActions.canFold,
    },
    validActions.canCheck
      ? {
          key: 'check',
          label: '过牌',
          shortcut: 'K',
          variant: 'neutral',
          onClick: handleCheck,
        }
      : {
          key: 'call',
          label: '跟注',
          sublabel: formatChips(validActions.callAmount),
          shortcut: 'C',
          variant: 'call',
          onClick: handleCall,
          disabled: !validActions.canCall,
        },
    {
      key: 'raise',
      label: validActions.canBet ? '下注' : '加注',
      shortcut: 'R',
      variant: 'raise',
      onClick: () => setShowRaise(v => !v),
      disabled: !validActions.canBet && !validActions.canRaise,
    },
  ];

  if (!isMyTurn) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className={cn(
          'flex flex-col gap-5',
          'rounded-[24px] p-4 sm:p-5',
          'bg-[rgba(8,14,24,0.9)] backdrop-blur-xl',
          'border border-white/12',
          className,
        )}
        style={{ boxShadow: 'var(--shadow-float), var(--shadow-hairline)' }}
      >
        {/* 加注滑块（展开时显示） */}
        <AnimatePresence>
          {showRaise && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-white/8 bg-[rgba(14,23,36,0.72)] p-3.5 sm:p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[12px] uppercase tracking-[0.15em] text-[var(--color-text-muted)]">
                    {validActions.canBet ? '下注金额' : '加注至'}
                  </span>
                  <button
                    onClick={() => setShowRaise(false)}
                    className="text-[12px] text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text-secondary)]"
                  >
                    收起 ↑
                  </button>
                </div>
                <BetSlider
                  value={raiseAmount}
                  min={validActions.minBetOrRaiseTo}
                  max={validActions.maxBetOrRaiseTo}
                  pot={pot}
                  onChange={setRaiseAmount}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 操作按钮行 */}
        <div className={cn(
          'grid items-stretch gap-2.5 sm:gap-3',
          showRaise ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3',
        )}>
          {buttons.map(({ key, label, sublabel, shortcut, variant, onClick, disabled }) => (
            <ActionButton
              key={key}
              label={label}
              sublabel={sublabel}
              shortcut={shortcut}
              variant={variant}
              onClick={onClick}
              disabled={disabled}
              isActive={key === 'raise' && showRaise}
            />
          ))}

          {/* 确认加注按钮（展开时显示） */}
          {showRaise && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleRaise}
              className={cn(
                'col-span-2 flex h-[62px] flex-col items-center justify-center sm:col-span-1',
                'rounded-[14px] px-4 py-3',
                'bg-gradient-to-br from-[var(--color-gold)] to-[var(--color-gold-muted)]',
                'text-[#0D1117] font-bold',
                'border border-[var(--color-gold)]/28',
                'hover:brightness-105 active:scale-[0.98] transition-all',
                'shadow-[0_10px_26px_rgba(255,215,0,0.28)]',
              )}
            >
              <span className="text-[15px] leading-none tracking-[0.01em]">
                {raiseAmount >= validActions.maxBetOrRaiseTo ? 'All-in' : (validActions.canBet ? '下注' : '加注')}
              </span>
              <span className="mt-1 text-[13px] font-chips font-semibold opacity-80">
                {formatChips(raiseAmount)}
              </span>
            </motion.button>
          )}
        </div>

        {/* 底栏：底池赔率提示 */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[12px] text-[var(--color-text-dim)]">
          <span>底池: <span className="font-chips text-[var(--color-text-secondary)]">{formatChips(pot)}</span></span>
          {validActions.canCall && validActions.callAmount > 0 && (
            <span>
              赔率: <span className="font-chips text-[var(--color-text-secondary)]">
                {Math.round((validActions.callAmount / (pot + validActions.callAmount)) * 100)}%
              </span>
            </span>
          )}
          <span className="font-mono text-[11px] opacity-70">F · K/C · R · A</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

/* ── 单个操作按钮 ── */

const BUTTON_STYLES = {
  fold: {
    base: 'border-[var(--color-error)]/28 text-[#ff8f8d] hover:bg-[var(--color-error)]/12 hover:border-[var(--color-error)]/45',
    active: '',
  },
  neutral: {
    base: 'border-white/12 text-[var(--color-text-secondary)] hover:bg-white/[0.07] hover:border-white/24',
    active: '',
  },
  call: {
    base: 'border-[var(--color-info)]/35 text-[#7dd6ff] hover:bg-[var(--color-info)]/12 hover:border-[var(--color-info)]/52',
    active: '',
  },
  raise: {
    base: 'border-[var(--color-gold)]/28 text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10 hover:border-[var(--color-gold)]/48',
    active: 'bg-[var(--color-gold)]/14 border-[var(--color-gold)]/56 shadow-[0_0_12px_rgba(255,215,0,0.24)]',
  },
};

interface ActionButtonProps {
  label: string;
  sublabel?: string | undefined;
  shortcut?: string | undefined;
  variant: keyof typeof BUTTON_STYLES;
  onClick: () => void;
  disabled?: boolean | undefined;
  isActive?: boolean | undefined;
}

function ActionButton({
  label,
  sublabel,
  shortcut,
  variant,
  onClick,
  disabled = false,
  isActive = false,
}: ActionButtonProps) {
  const styles = BUTTON_STYLES[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-[62px] w-full flex-col items-center justify-center gap-1.5',
        'rounded-[14px] px-3.5 py-2.5',
        'border transition-all duration-150',
        'bg-[var(--color-bg-elevated)]',
        'active:scale-[0.97]',
        isActive ? styles.active : styles.base,
        disabled && 'opacity-30 cursor-not-allowed pointer-events-none',
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-[14px] font-semibold leading-none sm:text-[15px]">{label}</span>
        {sublabel && (
          <span className="font-chips text-[13px] font-bold leading-none sm:text-[14px]">{sublabel}</span>
        )}
      </div>
      {shortcut && (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-50">[{shortcut}]</span>
      )}
    </button>
  );
}
