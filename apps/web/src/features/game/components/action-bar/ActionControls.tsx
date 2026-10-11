'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionType, ValidActions } from '@aipoker/shared';
import { useActionHotkeys } from '../../hooks/useActionHotkeys';
import type { HeroContext } from '../../lib/action-bar-preaction';
import {
  buildSizingPresets,
  formatAmount,
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
  const callText = `Call ${formatAmount(validActions.callAmount)}`;
  const raiseKind = validActions.canBet ? 'Bet' : 'Raise';

  const request = resolveRaiseAction(effectiveAmount, validActions);
  const confirmText =
    request.type === 'all_in'
      ? `All-in ${formatAmount(request.amount)}`
      : request.type === 'bet'
        ? `Bet ${formatAmount(request.amount)}`
        : `Raise to ${formatAmount(request.amount)}`;

  return (
    <div role="group" aria-label="Your action">
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

      <div className="grid grid-cols-3 gap-2">
        <ActionButton
          variant={validActions.canCheck ? 'fold-secondary' : 'fold'}
          hint="F"
          disabled={!validActions.canFold}
          onClick={fold}
          aria-label="Fold"
        >
          Fold
        </ActionButton>

        {validActions.canCheck ? (
          <ActionButton variant="call" hint="C" onClick={checkOrCall} aria-label="Check">
            Check
          </ActionButton>
        ) : (
          <ActionButton
            variant="call"
            hint="C"
            disabled={!validActions.canCall}
            onClick={checkOrCall}
            aria-label={validActions.canCall ? `${callText}${callAllIn ? ' (All-in)' : ''}` : 'Call'}
          >
            {validActions.canCall ? (
              <>
                <span>{callText}</span>
                {callAllIn && <span className="text-[12px] font-medium opacity-90">(All-in)</span>}
              </>
            ) : (
              'Call'
            )}
          </ActionButton>
        )}

        {raiseOpen ? (
          <ActionButton
            ref={confirmRef}
            variant="raise"
            hint="Enter"
            onClick={confirmRaise}
            aria-label={confirmText}
          >
            {confirmText}
          </ActionButton>
        ) : (
          <ActionButton
            ref={confirmRef}
            variant="raise"
            hint="R"
            disabled={!canRaise}
            onClick={openRaise}
            aria-label={raiseKind}
          >
            {raiseKind}
          </ActionButton>
        )}
      </div>
    </div>
  );
}
