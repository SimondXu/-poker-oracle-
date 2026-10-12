import type { MessageKey, TFunction } from '@/i18n';
import type { OccupiedSeatViewModel, SeatLastAction } from '@/features/game/lib/table-view-model';
import { formatChips, parseCard } from '@/lib/utils';

/** Translated card name ("Ace of spades" / "黑桃A"). */
export function getCardName(t: TFunction, card: string): string {
  const { rank, suit } = parseCard(card);
  return t('table.card.name', {
    rank: t(`table.card.rank.${rank}` as MessageKey),
    suit: t(`table.card.suit.${suit}` as MessageKey),
  });
}

/** Stamp text for a seat's last action ("Raise 120" / "加注 120"). */
export function getActionLabel(t: TFunction, action: SeatLastAction): string {
  const amount = action.amount === null ? '' : formatChips(action.amount);
  switch (action.kind) {
    case 'fold':
      return t('table.action.fold');
    case 'check':
      return t('table.action.check');
    case 'call':
      return t('table.action.call', { amount });
    case 'bet':
      return t('table.action.bet', { amount });
    case 'raise':
      return t('table.action.raise', { amount });
    case 'all_in':
      return t('table.action.all_in', { amount });
  }
}

export function getSeatAriaLabel(t: TFunction, seat: OccupiedSeatViewModel): string {
  const parts = [
    seat.isHero ? t('table.seat.you', { name: seat.name }) : seat.name,
    t('table.seat.stackAria', { amount: formatChips(seat.stack) }),
    t(`table.seat.status.${seat.status}`),
  ];
  if (seat.personality) parts.push(t(`table.personality.${seat.personality}.full`));
  if (seat.isButton) parts.push(t('table.seat.dealer'));
  if (seat.isActor) parts.push(t('table.seat.toAct'));
  if (seat.lastAction) parts.push(t('table.seat.lastAction', { action: getActionLabel(t, seat.lastAction) }));
  if (seat.isWinner) {
    parts.push(seat.payout !== null ? t('table.seat.wins', { amount: formatChips(seat.payout) }) : t('table.seat.winner'));
  }
  if (seat.handCategory) parts.push(t(`table.hand.${seat.handCategory}`));
  return parts.join(', ');
}
