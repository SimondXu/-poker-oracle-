import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAction, getValidActions, initializeHand, type HandState } from '@aipoker/game-engine';
import type { BotPlayerStats } from '@aipoker/shared';
import { buildDecisionContext, chooseBotAction } from '@aipoker/strategy-engine';

import { buildBotDecisionContext, recordFinishedHandStats } from '../../../game-loop/bot-support.ts';
import type { RuntimeRoom } from '../../../rooms/types.ts';
import { mixSeed, mulberry32 } from '../../../tools/eval-utils.ts';
import { buildHeroCoachEvent, toDecisionView } from '../../../ws/view-models/hero-coach.ts';
import { buildViewerHand } from '../../../ws/view-models/viewer-hand.ts';

const SEED = 20261011;
const IDS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];

function createRoom(isBot = false): RuntimeRoom {
  return {
    id: 'COACH1',
    stateVersion: 0,
    handNumber: 0,
    smallBlind: 10,
    bigBlind: 20,
    actionTimeoutMs: 30_000,
    players: new Map(IDS.map((id, seatIndex) => [id, { id, name: id, seatIndex, stack: 2_000, isBot }])),
    readyPlayerIds: new Set(IDS),
    pendingDisconnectPlayerIds: new Set(),
    spectatingPlayerIds: new Set(),
    hand: null,
    lastActionSeqByPlayer: new Map(),
    lastBroadcastActionCount: 0,
    lastButtonMarkerSeat: null,
    hostPlayerId: 'p0',
    playerStats: new Map(),
  };
}

/** Every decision point of seeded six-max hands played by TAG bots, with stats building up between hands. */
function* decisionPoints(room: RuntimeRoom, hands: number): Generator<string> {
  const rng = mulberry32(SEED);
  for (let index = 0; index < hands; index += 1) {
    const initialized = initializeHand({
      players: IDS.map((id, seatIndex) => ({ id, seatIndex, stack: 2_000 })),
      buttonMarkerSeat: index % IDS.length,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      rng: mulberry32(mixSeed(SEED, index)),
    });
    assert.ok(initialized.ok);
    room.handNumber = index + 1;
    room.hand = initialized.value;
    while (room.hand.currentActorSeat !== null) {
      const actor = room.hand.players.find((player) => player.seatIndex === room.hand!.currentActorSeat)!;
      room.stateVersion += 1;
      yield actor.id;
      const action = chooseBotAction(buildBotDecisionContext(room, actor.id)!, 'tag', rng);
      const applied = applyAction(room.hand, { playerId: actor.id, type: action.type, ...('amount' in action ? { amount: action.amount } : {}) }, { timestamp: 1 });
      assert.ok(applied.ok);
      room.hand = applied.value;
    }
    recordFinishedHandStats(room);
  }
}

/** The same hand with everyone else's hole cards and the undealt deck reshuffled. */
function withOthersCardsReshuffled(hand: HandState, heroId: string, rng: () => number): HandState {
  const others = hand.players.filter((player) => player.id !== heroId && player.holeCards.length > 0);
  const hidden = [...others.flatMap((player) => player.holeCards), ...hand.deck];
  for (let i = hidden.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [hidden[i], hidden[j]] = [hidden[j]!, hidden[i]!];
  }
  let cursor = 0;
  const players = hand.players.map((player) =>
    others.includes(player) ? { ...player, holeCards: hidden.slice(cursor, (cursor += player.holeCards.length)) } : player,
  );
  return { ...hand, players, deck: hidden.slice(cursor) };
}

test('the hero is advised from exactly the context a bot in their seat would get, and other players’ cards change nothing', () => {
  const room = createRoom();
  const shuffle = mulberry32(SEED ^ 0x5eed);
  let points = 0;
  let fullAdviceChecks = 0;
  for (const heroId of decisionPoints(room, 40)) {
    if (points >= 200) {
      break;
    }
    points += 1;
    const hand = room.hand!;
    const view = toDecisionView(buildViewerHand(room, heroId));
    assert.equal(view.players.filter((player) => player.id !== heroId && player.holeCards.length > 0).length, 0, 'no one else’s cards in the view');
    assert.deepEqual(
      buildDecisionContext(view, heroId, getValidActions(hand, heroId), room.playerStats),
      buildBotDecisionContext(room, heroId),
      `decision ${points}`,
    );

    const reshuffled = { ...room, hand: withOthersCardsReshuffled(hand, heroId, shuffle) };
    assert.notDeepEqual(reshuffled.hand.deck, hand.deck);
    assert.deepEqual(toDecisionView(buildViewerHand(reshuffled, heroId)), view, `decision ${points}`);
    if (points % 20 === 0) {
      fullAdviceChecks += 1;
      const advice = buildHeroCoachEvent(room);
      assert.ok(advice?.advice.options.length);
      assert.deepEqual(buildHeroCoachEvent(reshuffled), advice);
    }
  }
  assert.equal(points, 200);
  assert.equal(fullAdviceChecks, 10);
});

test('no advice for a bot, and a failure to build advice returns nothing instead of throwing', (t) => {
  const botRoom = createRoom(true);
  decisionPoints(botRoom, 1).next();
  assert.equal(buildHeroCoachEvent(botRoom), null);

  const room = createRoom();
  decisionPoints(room, 1).next();
  room.playerStats = { get: () => { throw new Error('stats unavailable'); } } as unknown as Map<string, BotPlayerStats>;
  const logged = t.mock.method(console, 'error', () => {});
  assert.equal(buildHeroCoachEvent(room), null);
  assert.equal(logged.mock.callCount(), 1);
});
