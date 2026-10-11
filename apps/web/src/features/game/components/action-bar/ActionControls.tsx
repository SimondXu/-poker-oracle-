'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionType, ValidActions } from '@aipoker/shared';
import { useFormatNumber, useT } from '@/i18n';
import { useActionHotkeys } from '../../hooks/useActionHotkeys';
import type { HeroContext } from '../../lib/action-bar-preaction';
import {
  buildSizingPresets,
  getRaiseBounds,
  isCallAllIn,
  parseAmountDraft,
  resolveRaiseAction,
  type SizingPreset,
} from '../../lib/action-bar-sizing';
import { ActionButton } from './ActionButton';
import { SizingRow } from './SizingRow';

interface ActionControlsProps {
  validActions: ValidActions;
  pot: number;
  hero: HeroContext | null;
  onAction: (type: ActionType, amount?: number) => void;
}

/** Re-enable input this long after sending, in case the server never answers. */
const SEND_LOCK_MS = 800;

/** Hero-to-act controls: [Fold] [Check | Call X] [Bet | Raise] plus the sizing row. */
export function ActionControls({ validActions, pot, hero, onAction }: ActionControlsProps) {
  const t = useT();
  const fmt = useFormatNumber();
  const bounds = useMemo(() => getRaiseBounds(validActions), [validActions]);
  const canRaise = validActions.canBet || validActions.canRaise;
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [amount, setAmount] = useState(bounds.min);
  const [draft, setDraft] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const sendLockedRef = useRef(false);

  // A fresh set of valid actions (new street/turn) starts from a closed raise row.
  useEffect(() => {
    setRaiseOpen(false);
    setDraft(null);
    setAmount(bounds.min);
    sendLockedRef.current = false;
  }, [bounds.min, bounds.max, validActions.callAmount]);

  const effectiveAmount = useMemo(
    () => (draft === null ? amount : (parseAmountDraft(draft, bounds) ?? amount)),
    [amount, bounds, draft],
  );

  const presets = useMemo(
    () =>
      buildSizingPresets({
        pot,
        callAmount: validActions.callAmount,
        heroStreetBet: hero?.streetCommitted ?? 0,
        bounds,
      }),
    [bounds, hero?.streetCommitted, pot, validActions.callAmount],
  );

  const send = useCallback(
    (type: ActionType, sentAmount?: number) => {
      if (sendLockedRef.current) return;
      sendLockedRef.current = true;
      window.setTimeout(() => {
        sendLockedRef.current = false;
      }, SEND_LOCK_MS);
      onAction(type, sentAmount);
    },
    [onAction],
  );

  const focusConfirm = useCallback(() => {
    window.requestAnimationFrame(() => confirmRef.current?.focus());
  }, []);

  const openRaise = useCallback(() => {
    if (!canRaise) return;
    if (!raiseOpen) {
      setAmount(bounds.min);
      setDraft(null);
      setRaiseOpen(true);
    }
    focusConfirm();
  }, [bounds.min, canRaise, focusConfirm, raiseOpen]);

  const cancelRaise = useCallback(() => {
    setRaiseOpen(false);
    setDraft(null);
    focusConfirm();
  }, [focusConfirm]);

  const confirmRaise = useCallback(() => {
    const request = resolveRaiseAction(effectiveAmount, validActions);
    send(request.type, request.amount);
  }, [effectiveAmount, send, validActions]);

  const applyPreset = useCallback(
    (preset: SizingPreset) => {
      setAmount(preset.amount);
      setDraft(null);
      focusConfirm();
    },
    [focusConfirm],
  );

  const commitDraft = useCallback(() => {
    if (draft !== null) {
      const parsed = parseAmountDraft(draft, bounds);
      if (parsed !== null) setAmount(parsed);
    }
    setDraft(null);
  }, [bounds, draft]);

  const fold = useCallback(() => {
    if (validActions.canFold) send('fold');
  }, [send, validActions.canFold]);

  const checkOrCall = useCallback(() => {
    if (validActions.canCheck) send('check');
    else if (validActions.canCall) send('call');
  }, [send, validActions.canCall, validActions.canCheck]);

  useActionHotkeys({
    enabled: true,
    raiseOpen,
    handlers: {
      onFold: fold,
      onCheckCall: checkOrCall,
      onOpenRaise: openRaise,
      onConfirm: confirmRaise,
      onCancel: cancelRaise,
      onPreset: (index) => {
        const preset = presets[index];
        if (preset) applyPreset(preset);
      },
    },
  });

  const callAllIn = isCallAllIn(validActions, hero?.stack ?? null);
  const callAmountText = fmt(validActions.callAmount);
  const raiseKind = validActions.canBet ? t('actionbar.action.bet') : t('actionbar.action.raise');

  const request = resolveRaiseAction(effectiveAmount, validActions);
  const confirmAmountText = fmt(request.amount);
  const confirmLabel =
    request.type === 'all_in'
      ? t('actionbar.action.allIn')
      : request.type === 'bet'
        ? t('actionbar.action.bet')
        : t('actionbar.action.raiseTo');
  const confirmShortLabel = request.type === 'raise_to' ? t('actionbar.action.raise') : null;
  const confirmAria =
    request.type === 'all_in'
      ? t('actionbar.action.allInAria', { amount: confirmAmountText })
      : request.type === 'bet'
        ? t('actionbar.action.betAmountAria', { amount: confirmAmountText })
        : t('actionbar.action.raiseToAria', { amount: confirmAmountText });

  return (
    <div role="group" aria-label={t('actionbar.group.yourAction')} className="flex w-full flex-col gap-snug">
      {raiseOpen && (
        <SizingRow
          presets={presets}
          bounds={bounds}
          amount={effectiveAmount}
          draft={draft}
          isBet={validActions.canBet}
          onPreset={applyPreset}
          onSlide={(value) => {
            setAmount(value);
            setDraft(null);
          }}
          onDraftChange={(text) => setDraft(text.replace(/[^\d]/g, ''))}
          onDraftCommit={commitDraft}
          onCancel={cancelRaise}
          onConfirm={confirmRaise}
        />
      )}

      <div className="grid grid-cols-3 gap-snug">
        <ActionButton
          variant={validActions.canCheck ? 'fold-secondary' : 'fold'}
          hint="F"
          disabled={!validActions.canFold}
          onClick={fold}
          data-layout-box="action-fold"
        >
          {t('actionbar.action.fold')}
        </ActionButton>

        {validActions.canCheck ? (
          <ActionButton variant="call" hint="C" onClick={checkOrCall} data-layout-box="action-call">
            {t('actionbar.action.check')}
          </ActionButton>
        ) : (
          <ActionButton
            variant="call"
            hint="C"
            disabled={!validActions.canCall}
            onClick={checkOrCall}
            data-layout-box="action-call"
            amount={validActions.canCall ? callAmountText : undefined}
            aria-label={
              validActions.canCall
                ? callAllIn
                  ? t('actionbar.action.callAllInAria', { amount: callAmountText })
                  : t('actionbar.action.call', { amount: callAmountText })
                : t('actionbar.action.callLabel')
            }
          >
            {callAllIn ? t('actionbar.action.callAllIn') : t('actionbar.action.callLabel')}
          </ActionButton>
        )}

        {raiseOpen ? (
          <ActionButton
            ref={confirmRef}
            variant="raise"
            hint="Enter"
            amount={confirmAmountText}
            shortLabel={confirmShortLabel}
            onClick={confirmRaise}
            aria-label={confirmAria}
            data-layout-box="action-raise"
          >
            {confirmLabel}
          </ActionButton>
        ) : (
          <ActionButton
            ref={confirmRef}
            variant="raise"
            hint="R"
            disabled={!canRaise}
            onClick={openRaise}
            aria-label={raiseKind}
            data-layout-box="action-raise"
          >
            {raiseKind}
          </ActionButton>
        )}
      </div>
    </div>
  );
}
