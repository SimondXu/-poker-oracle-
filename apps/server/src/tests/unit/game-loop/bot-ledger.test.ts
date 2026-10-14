import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyLedger, ledgerOf, updateLedger, type Ledger } from '@aipoker/agent-engine';
import { createStableAnalysisRng } from '@aipoker/strategy-engine';

import { buildBotHandEnd } from '../../../game-loop/bot-view.ts';
import { recordFinishedHandStats } from '../../../game-loop/bot-support.ts';
import type { RuntimeRoom } from '../../../rooms/types.ts';
import { seededFinishedHands } from '../../../tools/bot-spots.ts';
import { playDealPairAsync, ruleBotPolicy, type AsyncPolicy } from '../../../tools/duplicate-hu-async.ts';
import { POLICIES } from '../../../tools/eval-policies.ts';
import { isShownAtShowdown } from '../../../ws/view-models/viewer-hand.ts';

const ROOMS = seededFinishedHands(80, 'bot-ledger');
const BOT = [...ROOMS[0]!.players.keys()][0]!;

function ledgerOf80(rooms: readonly RuntimeRoom[], cards: boolean): Ledger {
  return rooms.reduce((ledger, room) => updateLedger(ledger, buildBotHandEnd(room, BOT)!, { cards }), emptyLedger());
}

/** Re-deals every hole card nobody saw at the showdown (folded players', and the bot's own when it wasn't shown) from the unseen cards. */
function permuteUnshown(room: RuntimeRoom, seed: string): RuntimeRoom {
  const rng = createStableAnalysisRng(seed);
  const permuted = structuredClone(room);
  const hand = permuted.hand!;
  const unshown = hand.players.filter((player) => !isShownAtShowdown(hand, player.id));
  const pool = [...unshown.flatMap((player) => player.holeCards), ...hand.deck];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [pool[index], pool[other]] = [pool[other]!, pool[index]!];
  }
  for (const player of unshown) {
    player.holeCards = pool.splice(0, 2);
  }
  hand.deck = pool;
  return permuted;
}

test("the ledger counts the same bets as the room's statistics, and its other counts are consistent", () => {
  const stats: RuntimeRoom['playerStats'] = new Map();
  for (const room of ROOMS) {
    room.playerStats = stats;
    recordFinishedHandStats(room);
  }
  const ledger = ledgerOf80(ROOMS, true);
  let facing = 0;
  for (const [id, counts] of stats) {
    const entry = ledgerOf(ledger, id);
    assert.equal(entry.buckets.reduce((sum, bucket) => sum + bucket.faced, 0), counts.postflopFacingBets, id);
    assert.equal(entry.buckets.reduce((sum, bucket) => sum + bucket.folded, 0), counts.postflopFoldsToBets, id);
    assert.ok(entry.showdowns <= entry.sawFlop && entry.sawFlop <= counts.hands);
    assert.ok(entry.buckets.every((bucket) => bucket.folded <= bucket.faced));
    // Each bet faced adds the rational fold rate of its size, between 0 and 1.
    assert.ok(entry.sumBase > 0 || counts.postflopFacingBets === 0);
    assert.ok(entry.sumBase <= counts.postflopFacingBets);
    facing += counts.postflopFacingBets;
  }
  assert.ok(facing > 100);
  // The corpus reaches showdowns and shows hands.
  assert.ok([...Object.values(ledger.players)].some((entry) => entry.shown.length === 3));
  assert.ok([...Object.values(ledger.players)].some((entry) => entry.lightCalldowns > 0));
  // Every bucket gets bets in a corpus of random sizes.
  assert.ok([0, 1, 2, 3].every((bucket) => Object.values(ledger.players).some((entry) => entry.buckets[bucket]!.faced > 0)));
});

test("the ledger is identical when folded players' cards and the bot's own unshown cards are permuted", () => {
  const ledger = ledgerOf80(ROOMS, true);
  const permuted = ledgerOf80(ROOMS.map((room, index) => permuteUnshown(room, `unshown-${index}`)), true);
  assert.deepEqual(permuted, ledger);
});

test('the check would catch a leak: changing a hand that was shown does change the ledger', () => {
  const ledger = ledgerOf80(ROOMS, true);
  const shown = Object.values(ledger.players).flatMap((entry) => entry.shown);
  assert.ok(shown.length > 0);
  const index = ROOMS.findIndex((room) => room.handNumber === shown[0]!.hand);
  const rooms = ROOMS.map((room) => structuredClone(room));
  const hand = rooms[index]!.hand!;
  const player = hand.players.find((candidate) => candidate.holeCards.join() === shown[0]!.cards.join())!;
  [player.holeCards[0], hand.deck[0]] = [hand.deck[0]!, player.holeCards[0]!];
  assert.notDeepEqual(ledgerOf80(rooms, true), ledger);
});

test('without cards the ledger keeps nothing a showdown revealed: no hands, no light calldowns, and shown hands change nothing', () => {
  const ledger = ledgerOf80(ROOMS, false);
  for (const entry of Object.values(ledger.players)) {
    assert.deepEqual(entry.shown, []);
    assert.equal(entry.lightCalldowns, 0);
    assert.ok(entry.notable.every((event) => event.kind === 'big_preflop_shove' || event.kind === 'check_raise' || event.kind === 'overbet'));
  }
  // Counts that are public are still kept.
  assert.ok(Object.values(ledger.players).some((entry) => entry.showdowns > 0));
  // Re-dealing the cards that were shown too leaves it unchanged, the way re-dealing the folded ones does.
  const redealt = ROOMS.map((room, index) => {
    const rng = createStableAnalysisRng(`all-${index}`);
    const copy = structuredClone(room);
    const hand = copy.hand!;
    const pool = [...hand.players.flatMap((player) => player.holeCards), ...hand.deck].sort(() => rng() - 0.5);
    hand.players.forEach((player) => (player.holeCards = pool.splice(0, 2)));
    hand.deck = pool;
    return copy;
  });
  assert.deepEqual(ledgerOf80(redealt, false), ledger);
});

/** A policy that plays like TAG and writes down, at its first decision of each half, what the bot may read about the other player. */
function watcher(seen: Array<{ half: 1 | 2; stats: string; ledger: Ledger }>): AsyncPolicy {
  const tag = ruleBotPolicy(POLICIES.tag);
  return async (input, extra) => {
    if (!seen.some((entry) => entry.half === extra.half)) {
      seen.push({ half: extra.half, stats: JSON.stringify(input.context.opponents?.[0]?.stats ?? null), ledger: input.ledger });
    }
    return tag(input, extra);
  };
}

test('snapshot mode: both halves of a pair read identical statistics and ledger; the default lets the second half read the first', async () => {
  const play = async (snapshotPerPair: boolean) => {
    const pairs: Array<[{ stats: string; ledger: Ledger }, { stats: string; ledger: Ledger }]> = [];
    const stats: RuntimeRoom['playerStats'] = new Map();
    let ledger: Ledger = emptyLedger();
    for (let index = 0; index < 40; index += 1) {
      const seen: Array<{ half: 1 | 2; stats: string; ledger: Ledger }> = [];
      const result = await playDealPairAsync({ a: watcher(seen), b: ruleBotPolicy(POLICIES.tag), seed: 424242, index, stackBb: 100, bigBlind: 20, playerStats: stats, ledger, snapshotPerPair });
      ledger = result.ledger;
      const first = seen.find((entry) => entry.half === 1);
      const second = seen.find((entry) => entry.half === 2);
      if (first && second) {
        pairs.push([first, second]);
      }
    }
    return pairs;
  };

  const snapshot = await play(true);
  for (const [first, second] of snapshot) {
    assert.equal(first.stats, second.stats);
    assert.deepEqual(first.ledger, second.ledger);
  }
  // The pair is merged afterwards: the next pair starts from both hands.
  assert.ok(snapshot.length > 20);
  assert.notDeepEqual(snapshot[0]![0].ledger, snapshot[1]![0].ledger);

  // Positive control: the default runner would have shown the second half what happened in the first.
  const shared = await play(false);
  assert.ok(shared.some(([first, second]) => first.stats !== second.stats));
  assert.ok(shared.some(([first, second]) => JSON.stringify(first.ledger) !== JSON.stringify(second.ledger)));
});

test('a snapshot pair keeps what both showed; the shared runner never keeps a shown hand', async () => {
  const run = async (snapshotPerPair: boolean) => {
    let ledger: Ledger = emptyLedger();
    const stats: RuntimeRoom['playerStats'] = new Map();
    for (let index = 0; index < 30; index += 1) {
      ledger = (await playDealPairAsync({ a: ruleBotPolicy(POLICIES.station), b: ruleBotPolicy(POLICIES.tag), seed: 77, index, stackBb: 100, bigBlind: 20, playerStats: stats, ledger, snapshotPerPair })).ledger;
    }
    return ledger;
  };
  const snapshot = await run(true);
  const shared = await run(false);
  assert.ok(Object.values(snapshot.players).some((entry) => entry.shown.length > 0));
  assert.ok(Object.values(shared.players).every((entry) => entry.shown.length === 0));
  // The public counts agree between the two modes, since a station's play does not depend on them and TAG's barely does.
  assert.equal(snapshot.players.a!.sawFlop, shared.players.a!.sawFlop);
});
