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
          'flex flex-col gap-3',
          'p-4 rounded-2xl',
          'bg-[var(--color-glass-heavy)] backdrop-blur-xl',
          'border border-white/8',
          className,
        )}
        style={{ boxShadow: 'var(--shadow-float)' }}
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
              <div className="pb-3 border-b border-white/6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[12px] text-[var(--color-text-muted)] uppercase tracking-wider">
                    {validActions.canBet ? '下注金额' : '加注至'}
                  </span>
                  <button
                    onClick={() => setShowRaise(false)}
                    className="text-[11px] text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] transition-colors"
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
        <div className="flex items-center gap-2.5">
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
                'flex-1 flex flex-col items-center justify-center',
                'px-5 py-3 rounded-xl',
                'bg-gradient-to-br from-[var(--color-gold)] to-[var(--color-gold-muted)]',
                'text-[#0D1117] font-bold',
                'border border-[var(--color-gold)]/20',
                'hover:opacity-90 active:scale-[0.98] transition-all',
                'shadow-[0_0_20px_rgba(255,215,0,0.3)]',
              )}
            >
              <span className="text-[14px] leading-none">
                {raiseAmount >= validActions.maxBetOrRaiseTo ? 'All-in' : (validActions.canBet ? '下注' : '加注')}
              </span>
              <span className="text-[12px] font-chips font-semibold opacity-80 mt-0.5">
                {formatChips(raiseAmount)}
              </span>
            </motion.button>
          )}
        </div>

        {/* 底栏：底池赔率提示 */}
        <div className="flex items-center justify-between text-[10px] text-[var(--color-text-dim)]">
          <span>底池: <span className="font-chips text-[var(--color-text-muted)]">{formatChips(pot)}</span></span>
          {validActions.canCall && validActions.callAmount > 0 && (
            <span>
              赔率: <span className="font-chips text-[var(--color-text-muted)]">
                {Math.round((validActions.callAmount / (pot + validActions.callAmount)) * 100)}%
              </span>
            </span>
          )}
          <span className="text-[9px] opacity-60">F · K/C · R · A</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

/* ── 单个操作按钮 ── */

const BUTTON_STYLES = {
  fold: {
    base: 'border-[var(--color-error)]/25 text-[var(--color-error)] hover:bg-[var(--color-error)]/10 hover:border-[var(--color-error)]/40',
    active: '',
  },
  neutral: {
    base: 'border-white/10 text-[var(--color-text-secondary)] hover:bg-white/5 hover:border-white/20',
    active: '',
  },
  call: {
    base: 'border-[var(--color-info)]/30 text-[#4FC3F7] hover:bg-[var(--color-info)]/10 hover:border-[var(--color-info)]/50',
    active: '',
  },
  raise: {
    base: 'border-[var(--color-gold)]/25 text-[var(--color-gold)] hover:bg-[var(--color-gold)]/8 hover:border-[var(--color-gold)]/45',
    active: 'bg-[var(--color-gold)]/12 border-[var(--color-gold)]/50 shadow-[0_0_12px_rgba(255,215,0,0.2)]',
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
        'flex-1 flex flex-col items-center justify-center gap-0.5',
        'px-4 py-3 rounded-xl',
        'border transition-all duration-150',
        'bg-[var(--color-bg-elevated)]',
        'active:scale-[0.97]',
        isActive ? styles.active : styles.base,
        disabled && 'opacity-30 cursor-not-allowed pointer-events-none',
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-[14px] font-semibold leading-none">{label}</span>
        {sublabel && (
          <span className="font-chips text-[13px] font-bold leading-none">{sublabel}</span>
        )}
      </div>
      {shortcut && (
        <span className="text-[9px] opacity-40 font-mono uppercase tracking-widest">[{shortcut}]</span>
      )}
    </button>
  );
}
