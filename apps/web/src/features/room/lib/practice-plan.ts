import type { BotPersonality } from '@aipoker/shared';

export const ROOM_MAX_SEATS = 6;

/** Practice table: five bots, a mix of all three personalities. */
export const PRACTICE_LINEUP: readonly BotPersonality[] = ['fish', 'tag', 'lag', 'tag', 'fish'];

export interface PracticeStep {
  strategy: BotPersonality;
  seatIndex: number;
}

/**
 * Bots still missing for the practice table, each with the lowest free seat.
 * `occupiedSeats` are seats taken now; `botCount` bots already seated count toward the lineup
 * (so a retry after a partial failure only adds what is missing).
 */
export function planPracticeSeating(occupiedSeats: readonly number[], botCount: number): PracticeStep[] {
  const taken = new Set(occupiedSeats);
  const steps: PracticeStep[] = [];

  for (const strategy of PRACTICE_LINEUP.slice(Math.min(botCount, PRACTICE_LINEUP.length))) {
    let seatIndex = 0;
    while (taken.has(seatIndex) && seatIndex < ROOM_MAX_SEATS) {
      seatIndex += 1;
    }
    if (seatIndex >= ROOM_MAX_SEATS) {
      break;
    }
    taken.add(seatIndex);
    steps.push({ strategy, seatIndex });
  }

  return steps;
}
