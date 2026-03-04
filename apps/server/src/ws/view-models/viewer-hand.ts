import type { HandState } from '@aipoker/game-engine';

export function buildViewerHand(hand: HandState, viewerPlayerId: string | null): HandState {
  const revealAll = hand.phase === 'hand_end';

  return {
    ...hand,
    players: hand.players.map((player) => {
      if (revealAll || player.id === viewerPlayerId) {
        return player;
      }
      return {
        ...player,
        holeCards: []
      };
    })
  };
}
