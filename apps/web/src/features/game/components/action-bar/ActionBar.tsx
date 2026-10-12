'use client';

import { useEffect, useRef, useState } from 'react';
import type { ValidActions } from '@aipoker/shared';
import { useT } from '@/i18n';
import {
  canOfferPreAction,
  isPreActionCurrent,
  resolvePreAction,
  type PreActionKind,
  type PreActionSelection,
} from '../../lib/action-bar-preaction';
import type { ActionBarProps } from '../slots';
import { ActionControls } from './ActionControls';
import {
  EliminatedChoiceBar,
  EliminatedSpectatingBar,
  NextHandBar,
  ResultPresentationBar,
  TableFinishedBar,
} from './StatusPanels';
import { useHeroContext } from './useHeroContext';
import { WaitingBar } from './WaitingBar';

/**
 * Action bar slot: the dock. GameView gives it its own grid row at the bottom of the
 * table column (full column width, never over the felt); it grows upward inside that
 * row while the raise sizing row is open. One instance, so the keyboard handlers
 * inside `ActionControls` are registered once.
 */
export function ActionBar({
  mode,
  validActions,
  pot,
  isBotsOnlyContinuation,
  championName,
  championStack,
  handNumber,
  onAction,
  onSpectate,
  onStartNextHand,
  onPlayAgain,
  onBackToLobby,
}: ActionBarProps) {
  const t = useT();
  const hero = useHeroContext();
  const [selection, setSelection] = useState<PreActionSelection | null>(null);
  const [autoSentFor, setAutoSentFor] = useState<ValidActions | null>(null);
  const autoSentRef = useRef<ValidActions | null>(null);

  // Drop a stale pre-selection (new hand/street, hero folded or all-in).
  useEffect(() => {
    if (selection && !isPreActionCurrent(selection, hero)) setSelection(null);
  }, [hero, selection]);

  // The turn arrived with a live pre-selection: send it once, never show the manual controls.
  const resolvedPre =
    mode === 'actions' && validActions && isPreActionCurrent(selection, hero)
      ? resolvePreAction(selection?.kind ?? null, validActions)
      : null;

  useEffect(() => {
    if (!resolvedPre || !validActions || autoSentRef.current === validActions) return;
    autoSentRef.current = validActions;
    setAutoSentFor(validActions);
    setSelection(null);
    onAction(resolvedPre.type);
  }, [onAction, resolvedPre, validActions]);

  const handlePreActionChange = (kind: PreActionKind | null) => {
    if (kind === null || !hero) setSelection(null);
    else setSelection({ kind, streetKey: hero.streetKey });
  };

  const content = renderContent();
  if (content === null) return null;

  return (
    <section
      aria-label={t('actionbar.group.actions')}
      data-layout-box="action-bar"
      className="shrink-0 border-t border-brass/25 bg-panel px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:px-4 md:py-3"
    >
      <div className="mx-auto flex min-h-18 w-full max-w-[640px] flex-col justify-center">{content}</div>
    </section>
  );

  function renderContent() {
    switch (mode) {
      case 'actions':
        if (!validActions) return null;
        if (autoSentFor === validActions || resolvedPre) {
          return (
            <p role="status" className="text-center text-body text-text-2">
              {t('actionbar.auto.sending')}
            </p>
          );
        }
        return <ActionControls validActions={validActions} pot={pot} hero={hero} onAction={onAction} />;
      case 'waiting':
        return (
          <WaitingBar
            preAction={selection?.kind ?? null}
            canPreAct={canOfferPreAction(hero)}
            onPreActionChange={handlePreActionChange}
          />
        );
      case 'result-presentation':
        return <ResultPresentationBar />;
      case 'next-hand':
        return <NextHandBar onStartNextHand={onStartNextHand} />;
      case 'eliminated-choice':
        return (
          <EliminatedChoiceBar onSpectate={onSpectate} onBackToLobby={onBackToLobby} />
        );
      case 'eliminated-spectating':
        return (
          <EliminatedSpectatingBar isBotsOnlyContinuation={isBotsOnlyContinuation} onBackToLobby={onBackToLobby} />
        );
      case 'table-finished':
        return (
          <TableFinishedBar
            championName={championName}
            championStack={championStack}
            handNumber={handNumber}
            onPlayAgain={onPlayAgain}
            onBackToLobby={onBackToLobby}
          />
        );
      case 'idle':
        return null;
    }
  }
}
