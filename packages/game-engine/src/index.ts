const SUITS = ['h', 'd', 'c', 's'] as const;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type Card = `${Rank}${Suit}`;
export type Rng = () => number;
export type EngineResult<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface HandInitPlayerInput {
  id: string;
  seatIndex: number;
  stack: number;
}

export interface HandInitPlayerState extends HandInitPlayerInput {
  streetCommitted: number;
  handCommitted: number;
}

export interface HandState {
  players: HandInitPlayerState[];
  buttonMarkerSeat: number;
  sbSeat: number;
  bbSeat: number;
  currentActorSeat: number;
  communityCards: Card[];
  deck: Card[];
  betting: {
    currentBetToMatch: number;
    lastFullRaiseSize: number;
    lastAggressorId: string | null;
  };
}

export interface InitializeHandInput {
  players: HandInitPlayerInput[];
  buttonMarkerSeat: number;
  smallBlind: number;
  bigBlind: number;
  rng: Rng;
}

function ok<T, E = never>(value: T): EngineResult<T, E> {
  return { ok: true, value };
}

function err<T = never, E = string>(error: E): EngineResult<T, E> {
  return { ok: false, error };
}

export function createDeck(rng: Rng): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }

  // Fisher-Yates with explicit RNG injection keeps the engine deterministic.
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const current = deck[i] as Card;
    deck[i] = deck[j] as Card;
    deck[j] = current;
  }

  return deck;
}

function findNextOccupiedSeat(players: HandInitPlayerInput[], currentSeat: number): number {
  let bestHigher: number | null = null;
  let lowest: number | null = null;

  for (const player of players) {
    if (lowest === null || player.seatIndex < lowest) {
      lowest = player.seatIndex;
    }

    if (player.seatIndex > currentSeat && (bestHigher === null || player.seatIndex < bestHigher)) {
      bestHigher = player.seatIndex;
    }
  }

  return bestHigher ?? (lowest ?? currentSeat);
}

export function initializeHand(
  input: InitializeHandInput
): EngineResult<HandState, 'not_enough_players' | 'invalid_blind_structure'> {
  const players = input.players.filter((player) => player.stack > 0);
  if (players.length < 2) {
    return err('not_enough_players');
  }

  if (input.smallBlind <= 0 || input.bigBlind < input.smallBlind) {
    return err('invalid_blind_structure');
  }

  let sbSeat = findNextOccupiedSeat(players, input.buttonMarkerSeat);
  if (players.length === 2) {
    const buttonPlayer = players.find((player) => player.seatIndex === input.buttonMarkerSeat);
    if (buttonPlayer) {
      sbSeat = buttonPlayer.seatIndex;
    }
  }

  const bbSeat = findNextOccupiedSeat(players, sbSeat);
  const currentActorSeat = findNextOccupiedSeat(players, bbSeat);

  const settledPlayers: HandInitPlayerState[] = players.map((player) => {
    let committed = 0;
    if (player.seatIndex === sbSeat) {
      committed = Math.min(input.smallBlind, player.stack);
    } else if (player.seatIndex === bbSeat) {
      committed = Math.min(input.bigBlind, player.stack);
    }

    return {
      ...player,
      stack: player.stack - committed,
      streetCommitted: committed,
      handCommitted: committed
    };
  });

  const bbPlayer = players.find((player) => player.seatIndex === bbSeat) ?? null;
  return ok({
    players: settledPlayers,
    buttonMarkerSeat: input.buttonMarkerSeat,
    sbSeat,
    bbSeat,
    currentActorSeat,
    communityCards: [],
    deck: createDeck(input.rng),
    betting: {
      currentBetToMatch: input.bigBlind,
      lastFullRaiseSize: input.bigBlind,
      lastAggressorId: bbPlayer?.id ?? null
    }
  });
}
