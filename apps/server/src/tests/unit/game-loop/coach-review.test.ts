import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAction, getValidActions, initializeHand, type PlayerActionInput } from '@aipoker/game-engine';
import { gradeDecision, type CoachAdvice } from '@aipoker/shared';
import { chooseBotAction } from '@aipoker/strategy-engine';

import { captureCoachDecision, forgetCoachPlayer, takeHandReviews } from '../../../game-loop/coach-review.ts';
import { buildBotDecisionContext, recordFinishedHandStats } from '../../../game-loop/bot-support.ts';
import { selectEmergencyBotActionInput } from '../../../game-loop/realtime-bot-fallback.ts';
import type { RuntimeRoom } from '../../../rooms/types.ts';
import { mixSeed, mulberry32 } from '../../../tools/eval-utils.ts';
import { buildHeroCoachEvent } from '../../../ws/view-models/hero-coach.ts';

const SEED = 20261012;
const IDS = ['hero', 'b1', 'b2', 'b3', 'b4', 'b5'];

function createRoom(): RuntimeRoom {
  return {
    id: 'REVWAB',
    stateVersion: 0,
    handNumber: 0,
    smallBlind: 10,
    bigBlind: 20,
    actionTimeoutMs: 30_000,
    players: new Map(IDS.map((id, seatIndex) => [id, { id, name: id, seatIndex, stack: 2_000, isBot: id !== 'hero' }])),
    readyPlayerIds: new Set(IDS),
    pendingDisconnectPlayerIds: new Set(),
    spectatingPlayerIds: new Set(),
    hand: null,
    lastActionSeqByPlayer: new Map(),
    lastBroadcastActionCount: 0,
    lastButtonMarkerSeat: null,
    hostPlayerId: 'hero',
    playerStats: new Map(),
    coachAdvice: new Map(),
    coachRecords: new Map(),
    coachSessions: new Map(),
    coachReviews: new Map(),
  };
}

function startHand(room: RuntimeRoom, index: number): void {
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
  room.stateVersion += 1;
}

function currentActorId(room: RuntimeRoom): string {
  return room.hand!.players.find((player) => player.seatIndex === room.hand!.currentActorSeat)!.id;
}

/** Captures the decision as the server does (before the state moves on), applies the action, then records it. */
function act(room: RuntimeRoom, action: PlayerActionInput, source: 'player' | 'timeout' = 'player'): void {
  const applied = applyAction(room.hand!, action, { timestamp: 1 });
  assert.ok(applied.ok);
  const record = captureCoachDecision(room, action, source);
  room.hand = applied.value;
  room.stateVersion += 1;
  record?.();
}

/** Advice built from scratch for the open decision, as if nothing had been kept. */
function freshAdvice(room: RuntimeRoom): CoachAdvice | undefined {
  return buildHeroCoachEvent({ ...room, coachAdvice: new Map() })?.advice;
}

test('every hero decision gets one record, graded against the advice they were (or would have been) sent, and the session adds up', () => {
  const room = createRoom();
  const rng = mulberry32(SEED);
  let heroDecisions = 0;
  let reviewedHands = 0;

  for (let index = 0; index < 12; index += 1) {
    startHand(room, index);
    const expected: CoachAdvice[] = [];
    while (room.hand!.currentActorSeat !== null) {
      const actorId = currentActorId(room);
      if (actorId === 'hero') {
        // Every other decision the hero acts before the advice goes out; the server builds it then.
        const sent = expected.length % 2 === 0 ? buildHeroCoachEvent(room)?.advice : undefined;
        const reference = freshAdvice(room);
        assert.ok(reference);
        if (sent) {
          assert.deepEqual(sent, reference);
        }
        expected.push(reference);
      }
      const decision = chooseBotAction(buildBotDecisionContext(room, actorId)!, 'tag', rng);
      act(room, { playerId: actorId, type: decision.type, ...('amount' in decision ? { amount: decision.amount } : {}) });
    }
    recordFinishedHandStats(room);

    const records = room.coachRecords.get('hero') ?? [];
    assert.deepEqual([...room.coachRecords.keys()].filter((id) => id !== 'hero'), [], 'bots are not recorded');
    assert.equal(records.length, room.hand!.actions.filter((action) => action.playerId === 'hero').length);
    assert.deepEqual(records.map((record) => record.advice), expected);
    for (const record of records) {
      assert.equal(record.street, record.advice.street);
      assert.equal(record.heroAction.source, 'player');
      assert.equal(record.verdict, gradeDecision(record.advice, record.heroAction));
    }
    heroDecisions += records.length;

    const reviews = takeHandReviews(room);
    assert.deepEqual(takeHandReviews(room), [], 'a hand is reviewed once');
    if (records.length > 0) {
      reviewedHands += 1;
      assert.equal(reviews.length, 1);
      const [review] = reviews;
      assert.equal(review!.playerId, 'hero');
      assert.equal(review!.handNumber, index + 1);
      assert.equal(review!.decisions, records);
      assert.equal(review!.session.matched + review!.session.close + review!.session.off, heroDecisions);
      assert.equal(room.coachReviews.get('hero'), review);
    } else {
      assert.deepEqual(reviews, []);
    }
  }

  assert.ok(reviewedHands >= 6, `hero decided in ${reviewedHands} of 12 hands`);
  assert.ok(heroDecisions > reviewedHands, 'some hands have more than one hero decision');
});

test('a timeout is graded like any action and flagged', () => {
  const room = createRoom();
  // Hero on the button of six: first to act after the blinds is UTG, so play bots until the hero's turn.
  startHand(room, 0);
  while (currentActorId(room) !== 'hero') {
    act(room, { playerId: currentActorId(room), type: 'fold' });
  }
  const advice = freshAdvice(room)!;
  const timeoutAction = selectEmergencyBotActionInput('hero', getValidActions(room.hand!, 'hero'));
  act(room, timeoutAction, 'timeout');

  const [record] = room.coachRecords.get('hero')!;
  assert.deepEqual(record!.heroAction, { kind: timeoutAction.type, source: 'timeout' });
  assert.deepEqual(record!.advice, advice);
  assert.equal(record!.verdict, gradeDecision(advice, record!.heroAction));
});

test('the review is built only once the hand is over', () => {
  const room = createRoom();
  startHand(room, 0);
  while (currentActorId(room) !== 'hero') {
    act(room, { playerId: currentActorId(room), type: 'fold' });
  }
  act(room, { playerId: 'hero', type: 'call' });
  assert.notEqual(room.hand!.phase, 'hand_end');
  assert.deepEqual(takeHandReviews(room), []);
  assert.equal(room.coachRecords.get('hero')?.length, 1);
});

test('a raise to the whole stack is recorded as the all-in it is', () => {
  const room = createRoom();
  startHand(room, 0);
  while (currentActorId(room) !== 'hero') {
    act(room, { playerId: currentActorId(room), type: 'fold' });
  }
  const hero = room.hand!.players.find((player) => player.id === 'hero')!;
  const allInTo = hero.streetCommitted + hero.stack;
  act(room, { playerId: 'hero', type: 'raise_to', amount: allInTo });

  const [record] = room.coachRecords.get('hero')!;
  assert.deepEqual(record!.heroAction, { kind: 'all_in', to: allInTo, source: 'player' });
});

test('the advice is built when the decision is recorded, not when it is captured, and is the one for the state before the action', () => {
  const room = createRoom();
  startHand(room, 0);
  while (currentActorId(room) !== 'hero') {
    act(room, { playerId: currentActorId(room), type: 'fold' });
  }
  const advice = freshAdvice(room)!;
  const action: PlayerActionInput = { playerId: 'hero', type: 'call' };
  const applied = applyAction(room.hand!, action, { timestamp: 1 });
  assert.ok(applied.ok);

  const record = captureCoachDecision(room, action, 'player')!;
  assert.equal(room.coachAdvice.size, 0, 'nothing is built while the ack and the state go out');
  assert.equal(room.coachRecords.size, 0);

  room.hand = applied.value;
  room.stateVersion += 1;
  record();
  assert.deepEqual(room.coachRecords.get('hero')!.map((decision) => decision.advice), [advice]);
});

test('a departed player’s coach state is forgotten', () => {
  const room = createRoom();
  room.coachAdvice.set('hero', {} as CoachAdvice);
  room.coachRecords.set('hero', []);
  room.coachSessions.set('hero', { matched: 1, close: 0, off: 0 });
  room.coachReviews.set('hero', { roomId: room.id, playerId: 'hero', handNumber: 1, decisions: [], session: { matched: 1, close: 0, off: 0 } });
  room.coachSessions.set('b1', { matched: 0, close: 1, off: 0 });

  forgetCoachPlayer(room, 'hero');
  assert.deepEqual([room.coachAdvice.size, room.coachRecords.size, room.coachReviews.size], [0, 0, 0]);
  assert.deepEqual([...room.coachSessions.keys()], ['b1']);
});
