import type {
  BotBettingState,
  BotPersonality,
  BotPosition,
  Card,
} from '@aipoker/shared';
import type { HandClass, HandDetail, Mix, MixByHandClass, MixByStackBucket, PreflopPosition, PreflopScenario, ScenarioMixes, StackBucket } from './types.ts';
import { canonicalizeHoleCards, classifyHand, getHandDetail, getPreflopTablePosition, getStackBucket, normalizePreflopScenario, widenHandClassForHeadsUp } from './preflop-hands.ts';

const EARLY_MIXES_BASE = {
  unopened: {
    fish: {
      '<=12bb': byClass({
        premium: mix(0, 0, 0.15, 0.85),
        strong: mix(0.05, 0.1, 0.45, 0.4),
        playable: mix(0.30, 0.35, 0.35, 0.0),
        speculative: mix(0.55, 0.35, 0.10, 0.0),
        marginal: mix(0.78, 0.20, 0.02, 0.0),
        trash: mix(0.95, 0.05, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0, 0, 0.25, 0.75),
        strong: mix(0.03, 0.12, 0.65, 0.2),
        playable: mix(0.22, 0.30, 0.48, 0.0),
        speculative: mix(0.58, 0.28, 0.14, 0.0),
        marginal: mix(0.82, 0.15, 0.03, 0.0),
        trash: mix(0.96, 0.04, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0, 0, 0.8, 0.2),
        strong: mix(0.05, 0.15, 0.8, 0.0),
        playable: mix(0.24, 0.32, 0.44, 0.0),
        speculative: mix(0.66, 0.22, 0.12, 0.0),
        marginal: mix(0.86, 0.12, 0.02, 0.0),
        trash: mix(0.98, 0.02, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0, 0, 0.9, 0.1),
        strong: mix(0.06, 0.18, 0.76, 0.0),
        playable: mix(0.28, 0.34, 0.38, 0.0),
        speculative: mix(0.72, 0.20, 0.08, 0.0),
        marginal: mix(0.9, 0.09, 0.01, 0.0),
        trash: mix(0.99, 0.01, 0.0, 0.0),
      }),
    },
    tag: {
      '<=12bb': byClass({
        premium: mix(0, 0, 0.05, 0.95),
        strong: mix(0.04, 0.06, 0.3, 0.6),
        playable: mix(0.42, 0.18, 0.25, 0.15),
        speculative: mix(0.75, 0.2, 0.05, 0.0),
        marginal: mix(0.92, 0.08, 0.0, 0.0),
        trash: mix(0.99, 0.01, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0, 0, 0.15, 0.85),
        strong: mix(0.02, 0.08, 0.68, 0.22),
        playable: mix(0.32, 0.18, 0.5, 0.0),
        speculative: mix(0.74, 0.16, 0.1, 0.0),
        marginal: mix(0.92, 0.07, 0.01, 0.0),
        trash: mix(0.99, 0.01, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0, 0, 0.88, 0.12),
        strong: mix(0.04, 0.10, 0.86, 0.0),
        playable: mix(0.38, 0.18, 0.44, 0.0),
        speculative: mix(0.8, 0.12, 0.08, 0.0),
        marginal: mix(0.94, 0.05, 0.01, 0.0),
        trash: mix(0.995, 0.005, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0, 0, 0.92, 0.08),
        strong: mix(0.06, 0.12, 0.82, 0.0),
        playable: mix(0.44, 0.18, 0.38, 0.0),
        speculative: mix(0.84, 0.1, 0.06, 0.0),
        marginal: mix(0.96, 0.04, 0.0, 0.0),
        trash: mix(0.998, 0.002, 0.0, 0.0),
      }),
    },
    lag: {
      '<=12bb': byClass({
        premium: mix(0, 0, 0.1, 0.9),
        strong: mix(0.02, 0.08, 0.35, 0.55),
        playable: mix(0.18, 0.24, 0.34, 0.24),
        speculative: mix(0.46, 0.30, 0.18, 0.06),
        marginal: mix(0.68, 0.24, 0.08, 0.0),
        trash: mix(0.9, 0.1, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0, 0, 0.2, 0.8),
        strong: mix(0.02, 0.08, 0.72, 0.18),
        playable: mix(0.12, 0.24, 0.64, 0.0),
        speculative: mix(0.34, 0.3, 0.36, 0.0),
        marginal: mix(0.6, 0.28, 0.12, 0.0),
        trash: mix(0.82, 0.14, 0.04, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0, 0, 0.88, 0.12),
        strong: mix(0.02, 0.08, 0.9, 0.0),
        playable: mix(0.08, 0.20, 0.72, 0.0),
        speculative: mix(0.22, 0.28, 0.50, 0.0),
        marginal: mix(0.5, 0.28, 0.22, 0.0),
        trash: mix(0.76, 0.16, 0.08, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0, 0, 0.9, 0.1),
        strong: mix(0.03, 0.09, 0.88, 0.0),
        playable: mix(0.1, 0.22, 0.68, 0.0),
        speculative: mix(0.18, 0.30, 0.52, 0.0),
        marginal: mix(0.42, 0.30, 0.28, 0.0),
        trash: mix(0.68, 0.20, 0.12, 0.0),
      }),
    },
  },
  facing_open: {
    fish: {
      '<=12bb': byClass({
        premium: mix(0, 0, 0.2, 0.8),
        strong: mix(0.08, 0.14, 0.28, 0.5),
        playable: mix(0.35, 0.45, 0.1, 0.1),
        speculative: mix(0.6, 0.35, 0.05, 0.0),
        marginal: mix(0.85, 0.15, 0.0, 0.0),
        trash: mix(0.96, 0.04, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.3, 0.7),
        strong: mix(0.08, 0.2, 0.52, 0.2),
        playable: mix(0.34, 0.5, 0.16, 0.0),
        speculative: mix(0.66, 0.28, 0.06, 0.0),
        marginal: mix(0.88, 0.1, 0.02, 0.0),
        trash: mix(0.97, 0.03, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.82, 0.18),
        strong: mix(0.08, 0.26, 0.66, 0.0),
        playable: mix(0.4, 0.46, 0.14, 0.0),
        speculative: mix(0.74, 0.2, 0.06, 0.0),
        marginal: mix(0.9, 0.08, 0.02, 0.0),
        trash: mix(0.98, 0.02, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.88, 0.12),
        strong: mix(0.1, 0.28, 0.62, 0.0),
        playable: mix(0.46, 0.44, 0.1, 0.0),
        speculative: mix(0.8, 0.16, 0.04, 0.0),
        marginal: mix(0.93, 0.06, 0.01, 0.0),
        trash: mix(0.99, 0.01, 0.0, 0.0),
      }),
    },
    tag: {
      '<=12bb': byClass({
        premium: mix(0.0, 0.0, 0.05, 0.95),
        strong: mix(0.12, 0.08, 0.18, 0.62),
        playable: mix(0.58, 0.22, 0.12, 0.08),
        speculative: mix(0.88, 0.12, 0.0, 0.0),
        marginal: mix(0.97, 0.03, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.24, 0.76),
        strong: mix(0.14, 0.16, 0.54, 0.16),
        playable: mix(0.58, 0.26, 0.16, 0.0),
        speculative: mix(0.9, 0.08, 0.02, 0.0),
        marginal: mix(0.98, 0.02, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.9, 0.1),
        strong: mix(0.14, 0.22, 0.64, 0.0),
        playable: mix(0.66, 0.22, 0.12, 0.0),
        speculative: mix(0.94, 0.05, 0.01, 0.0),
        marginal: mix(0.99, 0.01, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.92, 0.08),
        strong: mix(0.16, 0.24, 0.6, 0.0),
        playable: mix(0.72, 0.18, 0.1, 0.0),
        speculative: mix(0.96, 0.04, 0.0, 0.0),
        marginal: mix(0.995, 0.005, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
    },
    lag: {
      '<=12bb': byClass({
        premium: mix(0.0, 0.0, 0.08, 0.92),
        strong: mix(0.08, 0.12, 0.24, 0.56),
        playable: mix(0.32, 0.34, 0.18, 0.16),
        speculative: mix(0.56, 0.34, 0.1, 0.0),
        marginal: mix(0.78, 0.2, 0.02, 0.0),
        trash: mix(0.94, 0.06, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.24, 0.76),
        strong: mix(0.04, 0.14, 0.66, 0.16),
        playable: mix(0.22, 0.34, 0.44, 0.0),
        speculative: mix(0.46, 0.34, 0.2, 0.0),
        marginal: mix(0.72, 0.2, 0.08, 0.0),
        trash: mix(0.9, 0.08, 0.02, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.88, 0.12),
        strong: mix(0.06, 0.16, 0.78, 0.0),
        playable: mix(0.2, 0.32, 0.48, 0.0),
        speculative: mix(0.36, 0.34, 0.3, 0.0),
        marginal: mix(0.62, 0.22, 0.16, 0.0),
        trash: mix(0.84, 0.1, 0.06, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.9, 0.1),
        strong: mix(0.06, 0.18, 0.76, 0.0),
        playable: mix(0.24, 0.34, 0.42, 0.0),
        speculative: mix(0.32, 0.36, 0.32, 0.0),
        marginal: mix(0.52, 0.24, 0.24, 0.0),
        trash: mix(0.76, 0.14, 0.1, 0.0),
      }),
    },
  },
  facing_3bet_plus: {
    fish: {
      '<=12bb': byClass({
        premium: mix(0.0, 0.0, 0.0, 1.0),
        strong: mix(0.14, 0.12, 0.0, 0.74),
        playable: mix(0.72, 0.18, 0.0, 0.1),
        speculative: mix(0.94, 0.06, 0.0, 0.0),
        marginal: mix(0.99, 0.01, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.18, 0.82),
        strong: mix(0.18, 0.26, 0.16, 0.4),
        playable: mix(0.76, 0.18, 0.06, 0.0),
        speculative: mix(0.95, 0.05, 0.0, 0.0),
        marginal: mix(0.99, 0.01, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.78, 0.22),
        strong: mix(0.22, 0.44, 0.34, 0.0),
        playable: mix(0.82, 0.16, 0.02, 0.0),
        speculative: mix(0.97, 0.03, 0.0, 0.0),
        marginal: mix(0.995, 0.005, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.82, 0.18),
        strong: mix(0.28, 0.48, 0.24, 0.0),
        playable: mix(0.88, 0.1, 0.02, 0.0),
        speculative: mix(0.98, 0.02, 0.0, 0.0),
        marginal: mix(0.998, 0.002, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
    },
    tag: {
      '<=12bb': byClass({
        premium: mix(0.0, 0.0, 0.0, 1.0),
        strong: mix(0.24, 0.06, 0.0, 0.7),
        playable: mix(0.88, 0.08, 0.0, 0.04),
        speculative: mix(0.99, 0.01, 0.0, 0.0),
        marginal: mix(1.0, 0.0, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.14, 0.86),
        strong: mix(0.28, 0.18, 0.24, 0.3),
        playable: mix(0.92, 0.06, 0.02, 0.0),
        speculative: mix(0.99, 0.01, 0.0, 0.0),
        marginal: mix(1.0, 0.0, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.88, 0.12),
        strong: mix(0.38, 0.4, 0.22, 0.0),
        playable: mix(0.96, 0.04, 0.0, 0.0),
        speculative: mix(1.0, 0.0, 0.0, 0.0),
        marginal: mix(1.0, 0.0, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.9, 0.1),
        strong: mix(0.42, 0.4, 0.18, 0.0),
        playable: mix(0.98, 0.02, 0.0, 0.0),
        speculative: mix(1.0, 0.0, 0.0, 0.0),
        marginal: mix(1.0, 0.0, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
    },
    lag: {
      '<=12bb': byClass({
        premium: mix(0.0, 0.0, 0.0, 1.0),
        strong: mix(0.12, 0.06, 0.0, 0.82),
        playable: mix(0.6, 0.2, 0.0, 0.2),
        speculative: mix(0.92, 0.08, 0.0, 0.0),
        marginal: mix(0.98, 0.02, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.12, 0.88),
        strong: mix(0.12, 0.14, 0.44, 0.3),
        playable: mix(0.62, 0.22, 0.16, 0.0),
        speculative: mix(0.9, 0.08, 0.02, 0.0),
        marginal: mix(0.97, 0.03, 0.0, 0.0),
        trash: mix(0.995, 0.005, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.82, 0.18),
        strong: mix(0.18, 0.3, 0.52, 0.0),
        playable: mix(0.72, 0.18, 0.1, 0.0),
        speculative: mix(0.9, 0.08, 0.02, 0.0),
        marginal: mix(0.96, 0.03, 0.01, 0.0),
        trash: mix(0.99, 0.01, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.84, 0.16),
        strong: mix(0.2, 0.32, 0.48, 0.0),
        playable: mix(0.74, 0.18, 0.08, 0.0),
        speculative: mix(0.86, 0.1, 0.04, 0.0),
        marginal: mix(0.94, 0.04, 0.02, 0.0),
        trash: mix(0.985, 0.01, 0.005, 0.0),
      }),
    },
  },
} satisfies Record<Exclude<PreflopScenario, 'facing_limpers'>, ScenarioMixes>;

const EARLY_MIXES = {
  ...EARLY_MIXES_BASE,
  facing_limpers: buildFacingLimpersEarlyMixes(EARLY_MIXES_BASE.unopened),
} satisfies Record<PreflopScenario, ScenarioMixes>;

function buildFacingLimpersEarlyMixes(unopenedMixes: ScenarioMixes): ScenarioMixes {
  const personalities: BotPersonality[] = ['fish', 'tag', 'lag'];
  const stackBuckets: StackBucket[] = ['<=12bb', '13-25bb', '26-60bb', '>60bb'];
  const handClasses: HandClass[] = ['premium', 'strong', 'playable', 'speculative', 'marginal', 'trash'];
  const facingLimpers = {} as ScenarioMixes;

  for (const personality of personalities) {
    facingLimpers[personality] = {} as MixByStackBucket;
    for (const stackBucket of stackBuckets) {
      facingLimpers[personality][stackBucket] = {} as MixByHandClass;
      for (const handClass of handClasses) {
        const baseMix = unopenedMixes[personality][stackBucket][handClass];
        facingLimpers[personality][stackBucket][handClass] = tuneFacingLimpersBaseMix(baseMix, {
          personality,
          stackBucket,
          handClass,
        });
      }
    }
  }

  return facingLimpers;
}

function tuneFacingLimpersBaseMix(
  base: Mix,
  input: {
    personality: BotPersonality;
    stackBucket: StackBucket;
    handClass: HandClass;
  }
): Mix {
  const shortStack = input.stackBucket === '<=12bb' || input.stackBucket === '13-25bb';

  switch (input.personality) {
    case 'fish':
      return tuneFishFacingLimpersBaseMix(base, input.handClass, shortStack);
    case 'lag':
      return tuneLagFacingLimpersBaseMix(base, input.handClass, shortStack);
    default:
      return tuneTagFacingLimpersBaseMix(base, input.handClass, shortStack);
  }
}

function tuneFishFacingLimpersBaseMix(base: Mix, handClass: HandClass, shortStack: boolean): Mix {
  switch (handClass) {
    case 'premium':
      return nudgeMix(base, shortStack ? { call: -0.02, raise: 0.02 } : { call: -0.04, raise: 0.04 });
    case 'strong':
      return nudgeMix(base, shortStack ? { fold: -0.06, call: 0.08, raise: -0.02 } : { fold: -0.10, call: 0.12, raise: -0.02 });
    case 'playable':
      return nudgeMix(base, shortStack ? { fold: -0.14, call: 0.12, raise: 0.02 } : { fold: -0.18, call: 0.14, raise: 0.04 });
    case 'speculative':
      return nudgeMix(base, shortStack ? { fold: -0.12, call: 0.10, raise: 0.02 } : { fold: -0.20, call: 0.16, raise: 0.04 });
    case 'marginal':
      return nudgeMix(base, shortStack ? { fold: -0.10, call: 0.08, raise: 0.02 } : { fold: -0.16, call: 0.12, raise: 0.04 });
    case 'trash':
      return nudgeMix(base, shortStack ? { fold: -0.04, call: 0.04 } : { fold: -0.08, call: 0.07, raise: 0.01 });
  }
}

function tuneTagFacingLimpersBaseMix(base: Mix, handClass: HandClass, shortStack: boolean): Mix {
  switch (handClass) {
    case 'premium':
      return nudgeMix(base, shortStack ? { raise: 0.02, jam: 0.02, call: -0.04 } : { raise: 0.04, call: -0.04 });
    case 'strong':
      return nudgeMix(base, shortStack ? { fold: -0.08, call: 0.02, raise: 0.06 } : { fold: -0.12, call: 0.04, raise: 0.08 });
    case 'playable':
      return nudgeMix(base, shortStack ? { fold: -0.12, call: 0.04, raise: 0.08 } : { fold: -0.16, call: 0.06, raise: 0.10 });
    case 'speculative':
      return nudgeMix(base, shortStack ? { fold: -0.08, call: 0.06, raise: 0.02 } : { fold: -0.12, call: 0.08, raise: 0.04 });
    case 'marginal':
      return nudgeMix(base, shortStack ? { fold: -0.06, call: 0.04, raise: 0.02 } : { fold: -0.10, call: 0.05, raise: 0.05 });
    case 'trash':
      return nudgeMix(base, shortStack ? { fold: -0.02, call: 0.01, raise: 0.01 } : { fold: -0.04, call: 0.01, raise: 0.03 });
  }
}

function tuneLagFacingLimpersBaseMix(base: Mix, handClass: HandClass, shortStack: boolean): Mix {
  switch (handClass) {
    case 'premium':
      return nudgeMix(base, shortStack ? { raise: 0.02, jam: 0.02, call: -0.04 } : { raise: 0.04, call: -0.04 });
    case 'strong':
      return nudgeMix(base, shortStack ? { fold: -0.08, call: 0.02, raise: 0.06 } : { fold: -0.12, call: 0.03, raise: 0.09 });
    case 'playable':
      return nudgeMix(base, shortStack ? { fold: -0.10, call: 0.02, raise: 0.08 } : { fold: -0.14, call: 0.04, raise: 0.10 });
    case 'speculative':
      return nudgeMix(base, shortStack ? { fold: -0.08, call: 0.04, raise: 0.04 } : { fold: -0.12, call: 0.04, raise: 0.08 });
    case 'marginal':
      return nudgeMix(base, shortStack ? { fold: -0.06, call: 0.03, raise: 0.03 } : { fold: -0.10, call: 0.03, raise: 0.07 });
    case 'trash':
      return nudgeMix(base, shortStack ? { fold: -0.02, call: 0.01, raise: 0.01 } : { fold: -0.06, call: 0.01, raise: 0.05 });
  }
}

function byClass(input: Record<HandClass, Mix>): Record<HandClass, Mix> {
  return input;
}

function mix(fold: number, call: number, raise: number, jam: number): Mix {
  const total = fold + call + raise + jam;
  const rounded = Math.round(total * 1_000_000);
  if (rounded !== 1_000_000) {
    throw new Error(`Invalid mix total ${total}`);
  }
  return { fold, call, raise, jam };
}

export function getPreflopMix(
  personality: BotPersonality,
  effectiveStackBb: number,
  bettingState: BotBettingState,
  position: BotPosition,
  holeCards: readonly Card[],
  activePlayerCount = 6,
): Mix {
  const stackBucket = getStackBucket(effectiveStackBb);
  const scenario = normalizePreflopScenario(bettingState);
  // Heads-up the button opens like a button, not like a six-max small blind.
  const preflopPosition = activePlayerCount === 2 ? position : getPreflopTablePosition(position, activePlayerCount);
  const canonicalKey = canonicalizeHoleCards(holeCards);
  const handClass = activePlayerCount === 2
    ? widenHandClassForHeadsUp(classifyHand(canonicalKey))
    : classifyHand(canonicalKey);
  const baseMix = PRELOP_MIXES[scenario][personality][stackBucket][preflopPosition][handClass];
  const detailAdjusted = adjustPreflopMixForHandDetail(baseMix, {
    detail: getHandDetail(canonicalKey),
    personality,
    scenario,
    position: preflopPosition,
  });
  return rebalancePreflopMixForPersonality(detailAdjusted, {
    personality,
    scenario,
    position: preflopPosition,
    handClass,
    stackBucket,
  });
}

const PRELOP_MIXES = buildPreflopMixes();

function buildPreflopMixes(): Record<
  PreflopScenario,
  Record<BotPersonality, Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>>
> {
  const result = {
    unopened: {} as Record<BotPersonality, Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>>,
    facing_limpers: {} as Record<BotPersonality, Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>>,
    facing_open: {} as Record<BotPersonality, Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>>,
    facing_3bet_plus: {} as Record<BotPersonality, Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>>,
  };

  const scenarios: PreflopScenario[] = ['unopened', 'facing_limpers', 'facing_open', 'facing_3bet_plus'];
  const personalities: BotPersonality[] = ['fish', 'tag', 'lag'];
  const stackBuckets: StackBucket[] = ['<=12bb', '13-25bb', '26-60bb', '>60bb'];

  for (const scenario of scenarios) {
    for (const personality of personalities) {
      result[scenario][personality] = {} as Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>;
      for (const stackBucket of stackBuckets) {
        const baseMixes = EARLY_MIXES[scenario][personality][stackBucket];
        result[scenario][personality][stackBucket] = {
          utg: baseMixes,
          hj: tweakForPosition(baseMixes, scenario, 'hj'),
          co: tweakForPosition(baseMixes, scenario, 'co'),
          btn: tweakForPosition(baseMixes, scenario, 'btn'),
          sb: tweakForPosition(baseMixes, scenario, 'sb'),
          bb: tweakForPosition(baseMixes, scenario, 'bb'),
        };
      }
    }
  }

  return result;
}

function tweakForPosition(
  base: Record<HandClass, Mix>,
  scenario: PreflopScenario,
  position: PreflopPosition
): Record<HandClass, Mix> {
  const adjusted: Record<HandClass, Mix> = {
    premium: base.premium,
    strong: base.strong,
    playable: base.playable,
    speculative: base.speculative,
    marginal: base.marginal,
    trash: base.trash,
  };

  if (position === 'hj') {
    adjusted.playable = nudgeMix(base.playable, { fold: -0.04, call: 0.01, raise: 0.03 });
    adjusted.speculative = nudgeMix(base.speculative, { fold: -0.06, call: 0.02, raise: 0.04 });
    adjusted.marginal = nudgeMix(base.marginal, { fold: -0.08, call: 0.04, raise: 0.04 });
    adjusted.trash = nudgeMix(base.trash, { fold: -0.02, call: 0.01, raise: 0.01 });
  }

  if (position === 'co') {
    adjusted.playable = nudgeMix(base.playable, { fold: -0.10, call: 0.03, raise: 0.07 });
    adjusted.speculative = nudgeMix(base.speculative, { fold: -0.14, call: 0.05, raise: 0.09 });
    adjusted.marginal = nudgeMix(base.marginal, { fold: -0.18, call: 0.08, raise: 0.10 });
    adjusted.trash = nudgeMix(base.trash, { fold: -0.10, call: 0.06, raise: 0.04 });
  }

  if (position === 'btn') {
    adjusted.playable = nudgeMix(base.playable, { fold: -0.14, call: 0.04, raise: 0.10 });
    adjusted.speculative = nudgeMix(base.speculative, { fold: -0.18, call: 0.06, raise: 0.12 });
    adjusted.marginal = nudgeMix(base.marginal, { fold: -0.22, call: 0.10, raise: 0.12 });
    adjusted.trash = nudgeMix(base.trash, { fold: -0.12, call: 0.07, raise: 0.05 });
  }

  if (position === 'sb') {
    if (scenario === 'unopened') {
      adjusted.playable = nudgeMix(base.playable, { fold: -0.05, call: -0.1, raise: 0.15 });
      adjusted.speculative = nudgeMix(base.speculative, { fold: -0.08, call: -0.06, raise: 0.14 });
      adjusted.marginal = nudgeMix(base.marginal, { fold: -0.1, call: -0.02, raise: 0.12 });
    } else if (scenario === 'facing_limpers') {
      adjusted.playable = nudgeMix(base.playable, { fold: -0.06, call: -0.02, raise: 0.08 });
      adjusted.speculative = nudgeMix(base.speculative, { fold: -0.04, call: 0.02, raise: 0.02 });
      adjusted.marginal = nudgeMix(base.marginal, { fold: -0.04, call: 0.03, raise: 0.01 });
    } else {
      adjusted.playable = nudgeMix(base.playable, { fold: -0.04, call: 0.0, raise: 0.04 });
      adjusted.speculative = nudgeMix(base.speculative, { fold: -0.02, call: 0.02, raise: 0.0 });
    }
  }

  if (position === 'bb') {
    adjusted.playable = nudgeMix(base.playable, { fold: -0.08, call: 0.08, raise: 0.0 });
    adjusted.speculative = nudgeMix(base.speculative, { fold: -0.12, call: 0.12, raise: 0.0 });
    adjusted.marginal = nudgeMix(base.marginal, { fold: -0.06, call: 0.06, raise: 0.0 });
  }

  return adjusted;
}

export function nudgeMix(
  value: Mix,
  delta: Partial<Record<'fold' | 'call' | 'raise' | 'jam', number>>
): Mix {
  const next = {
    fold: value.fold + (delta.fold ?? 0),
    call: value.call + (delta.call ?? 0),
    raise: value.raise + (delta.raise ?? 0),
    jam: value.jam + (delta.jam ?? 0),
  };
  const normalized = normalizeMix(next);
  return mix(normalized.fold, normalized.call, normalized.raise, normalized.jam);
}

function normalizeMix(value: Mix): Mix {
  const clamped = {
    fold: Math.max(0, value.fold),
    call: Math.max(0, value.call),
    raise: Math.max(0, value.raise),
    jam: Math.max(0, value.jam),
  };
  const total = clamped.fold + clamped.call + clamped.raise + clamped.jam;
  if (total === 0) {
    return { fold: 1, call: 0, raise: 0, jam: 0 };
  }
  return {
    fold: clamped.fold / total,
    call: clamped.call / total,
    raise: clamped.raise / total,
    jam: clamped.jam / total,
  };
}

export function scaleMixDelta(
  delta: Partial<Record<'fold' | 'call' | 'raise' | 'jam', number>>,
  factor: number
): Partial<Record<'fold' | 'call' | 'raise' | 'jam', number>> {
  const scaled: Partial<Record<'fold' | 'call' | 'raise' | 'jam', number>> = {};
  if (delta.fold !== undefined) {
    scaled.fold = delta.fold * factor;
  }
  if (delta.call !== undefined) {
    scaled.call = delta.call * factor;
  }
  if (delta.raise !== undefined) {
    scaled.raise = delta.raise * factor;
  }
  if (delta.jam !== undefined) {
    scaled.jam = delta.jam * factor;
  }
  return scaled;
}

function adjustPreflopMixForHandDetail(
  base: Mix,
  input: {
    detail: HandDetail;
    personality: BotPersonality;
    scenario: PreflopScenario;
    position: PreflopPosition;
  }
): Mix {
  let adjusted = base;
  const lateOpenPosition = input.position === 'co' || input.position === 'btn';

  if (input.scenario === 'unopened' && lateOpenPosition) {
    if (input.detail === 'weak_offsuit_ace') {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'lag'
          ? { fold: -0.24, call: 0.03, raise: 0.21 }
          : input.personality === 'fish'
            ? { fold: -0.10, call: 0.06, raise: 0.04 }
            : { fold: -0.18, call: 0.05, raise: 0.13 },
      );
    }

    if (
      input.detail === 'suited_king'
      || input.detail === 'suited_connector'
      || input.detail === 'suited_gapper'
      || input.detail === 'small_pair'
    ) {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'lag'
          ? { fold: -0.10, call: 0.03, raise: 0.07 }
          : input.personality === 'fish'
            ? { fold: -0.08, call: 0.06, raise: 0.02 }
            : { fold: -0.05, call: 0.02, raise: 0.03 },
      );
    }
  }

  if (input.scenario === 'unopened' && input.position === 'sb') {
    if (input.detail === 'weak_offsuit_ace' || input.detail === 'suited_king' || input.detail === 'suited_junk') {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'lag'
          ? input.detail === 'weak_offsuit_ace'
            ? { fold: -0.18, call: -0.02, raise: 0.20 }
            : { fold: -0.10, call: -0.02, raise: 0.12 }
          : { fold: -0.06, call: 0.0, raise: 0.06 },
      );
    }
  }

  if (input.scenario === 'facing_open' && input.position === 'bb') {
    if (input.detail === 'suited_king') {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'tag'
          ? { fold: -0.20, call: 0.17, raise: 0.03 }
          : input.personality === 'lag'
            ? { fold: -0.18, call: 0.10, raise: 0.08 }
            : { fold: -0.20, call: 0.18, raise: 0.02 },
      );
    }

    if (
      input.detail === 'suited_ace'
      || input.detail === 'small_pair'
      || input.detail === 'offsuit_broadway'
    ) {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'lag'
          ? { fold: -0.10, call: 0.06, raise: 0.04 }
          : { fold: -0.08, call: 0.07, raise: 0.01 },
      );
    }
  }

  if (
    input.scenario === 'facing_open'
    && (input.position === 'co' || input.position === 'btn')
    && input.personality === 'lag'
    && (
      input.detail === 'suited_connector'
      || input.detail === 'suited_gapper'
      || input.detail === 'suited_broadway'
    )
  ) {
    adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.03, raise: 0.05 });
  }

  if (input.scenario === 'facing_limpers' && (input.position === 'co' || input.position === 'btn' || input.position === 'sb')) {
    if (
      input.detail === 'suited_ace'
      || input.detail === 'suited_broadway'
      || input.detail === 'offsuit_broadway'
      || input.detail === 'weak_offsuit_ace'
    ) {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'lag'
          ? { fold: -0.08, call: 0.01, raise: 0.07 }
          : input.personality === 'fish'
            ? { fold: -0.06, call: 0.05, raise: 0.01 }
            : { fold: -0.08, call: 0.02, raise: 0.06 },
      );
    }

    if (
      input.detail === 'small_pair'
      || input.detail === 'suited_connector'
      || input.detail === 'suited_gapper'
      || input.detail === 'suited_king'
    ) {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'lag'
          ? { fold: -0.06, call: 0.02, raise: 0.04 }
          : input.personality === 'fish'
            ? { fold: -0.08, call: 0.07, raise: 0.01 }
            : { fold: -0.06, call: 0.03, raise: 0.03 },
      );
    }
  }

  return adjusted;
}

function rebalancePreflopMixForPersonality(
  base: Mix,
  input: {
    personality: BotPersonality;
    scenario: PreflopScenario;
    position: PreflopPosition;
    handClass: HandClass;
    stackBucket: StackBucket;
  }
): Mix {
  let adjusted = base;
  const latePosition = input.position === 'co' || input.position === 'btn' || input.position === 'sb';
  const blindPosition = input.position === 'sb' || input.position === 'bb';

  if (input.personality === 'fish') {
    if (input.scenario === 'unopened') {
      if (latePosition) {
        if (input.handClass === 'playable' || input.handClass === 'speculative') {
          adjusted = nudgeMix(adjusted, { fold: -0.22, call: 0.08, raise: 0.14 });
        }
        if (input.handClass === 'marginal') {
          adjusted = nudgeMix(adjusted, { fold: -0.30, call: 0.16, raise: 0.14 });
        }
        if (input.handClass === 'trash') {
          adjusted = nudgeMix(adjusted, { fold: -0.20, call: 0.13, raise: 0.07 });
        }
      } else if (input.handClass === 'speculative' || input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.09, raise: -0.01 });
      }

      if (input.position === 'sb' && (input.handClass === 'speculative' || input.handClass === 'marginal' || input.handClass === 'trash')) {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.02, raise: 0.06 });
      }
    }

    if (input.scenario === 'facing_open') {
      if (input.handClass === 'strong') {
        adjusted = nudgeMix(adjusted, { call: 0.24, raise: -0.18, jam: -0.06 });
      }
      if (input.handClass === 'playable' || input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.24, call: 0.30, raise: -0.02, jam: -0.04 });
      }
      if (input.handClass === 'marginal' && (latePosition || blindPosition)) {
        adjusted = nudgeMix(adjusted, { fold: -0.28, call: 0.30, raise: -0.02 });
      }
      if (input.position === 'bb' && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.08 });
      }
      if (input.position === 'bb' && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.12, call: 0.12 });
      }
    }

    if (input.scenario === 'facing_limpers') {
      if (input.handClass === 'strong') {
        adjusted = nudgeMix(adjusted, { call: 0.12, raise: -0.10, jam: -0.02 });
      }
      if ((input.handClass === 'playable' || input.handClass === 'speculative') && (latePosition || blindPosition)) {
        adjusted = nudgeMix(adjusted, { fold: -0.18, call: 0.14, raise: 0.04 });
      }
      if (input.handClass === 'marginal' && latePosition) {
        adjusted = nudgeMix(adjusted, { fold: -0.14, call: 0.12, raise: 0.02 });
      }
      if (input.handClass === 'trash' && latePosition) {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.07, raise: 0.01 });
      }
    }

    if (input.scenario === 'facing_3bet_plus') {
      if (input.handClass === 'strong') {
        adjusted = nudgeMix(adjusted, { call: 0.08, raise: -0.03, jam: -0.05 });
      }
      if (latePosition && input.handClass === 'playable') {
        adjusted = nudgeMix(adjusted, { fold: -0.05, call: 0.07, raise: -0.02 });
      }
    }
  }

  if (input.personality === 'tag') {
    if (input.scenario === 'unopened') {
      if (latePosition && input.handClass === 'playable') {
        adjusted = nudgeMix(adjusted, { fold: -0.14, call: 0.01, raise: 0.13 });
      }
      if ((input.position === 'co' || input.position === 'btn') && input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.30, call: 0.04, raise: 0.26 });
      }
      if ((input.position === 'co' || input.position === 'btn') && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.38, call: 0.08, raise: 0.30 });
      }
      if (input.position === 'btn' && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: -0.02, raise: 0.12 });
      }
      if ((input.position === 'co' || input.position === 'btn') && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.12, call: 0.01, raise: 0.11 });
      }
      if (input.position === 'sb' && (input.handClass === 'playable' || input.handClass === 'speculative')) {
        adjusted = nudgeMix(adjusted, { fold: -0.12, call: -0.02, raise: 0.14 });
      }
      if (input.position === 'sb' && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.20, call: -0.02, raise: 0.22 });
      }
      if (blindPosition && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.06, call: 0.02, raise: 0.04 });
      }
    }

    if (input.scenario === 'facing_open' && (input.position === 'bb' || input.position === 'btn' || input.position === 'co')) {
      if (input.handClass === 'playable' || input.handClass === 'strong') {
        adjusted = nudgeMix(adjusted, { fold: -0.12, call: 0.06, raise: 0.06 });
      }
      if (input.handClass === 'speculative' && input.position === 'bb') {
        adjusted = nudgeMix(adjusted, { fold: -0.34, call: 0.18, raise: 0.16 });
      }
      if (input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.18, call: 0.10, raise: 0.08 });
      }
      if ((input.position === 'co' || input.position === 'btn') && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.06, call: 0.05, raise: 0.01 });
      }
      if (input.position === 'bb' && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.06, call: 0.06 });
      }
    }

    if (input.scenario === 'facing_limpers') {
      if ((input.position === 'co' || input.position === 'btn' || input.position === 'sb') && (input.handClass === 'strong' || input.handClass === 'playable')) {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: 0.02, raise: 0.08 });
      }
      if ((input.position === 'co' || input.position === 'btn') && input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.04, raise: 0.04 });
      }
      if (latePosition && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: 0.04, raise: 0.06 });
      }
      if (input.position === 'bb' && (input.handClass === 'speculative' || input.handClass === 'marginal')) {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.08 });
      }
    }
  }

  if (input.personality === 'lag') {
    const deepStack = input.stackBucket === '>60bb';
    const mediumDeepStack = input.stackBucket === '26-60bb';

    if (input.scenario === 'unopened' && latePosition) {
      if (deepStack && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: 0.02, raise: 0.08 });
      }
      if (mediumDeepStack && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.06, call: 0.02, raise: 0.04 });
      }
      if ((deepStack || mediumDeepStack) && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.18, call: 0.0, raise: 0.18 });
      }
      if (deepStack && input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: 0.20, raise: -0.10 });
      }
      if (mediumDeepStack && input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.14, raise: -0.06 });
      }
      if (input.position === 'sb' && (deepStack || mediumDeepStack) && (input.handClass === 'marginal' || input.handClass === 'trash')) {
        adjusted = nudgeMix(adjusted, { fold: -0.08, raise: 0.08 });
      }
      if (input.position === 'btn' && (input.handClass === 'marginal' || input.handClass === 'trash')) {
        adjusted = nudgeMix(adjusted, { call: -0.04, raise: 0.04 });
      }
    }

    if (input.scenario === 'facing_open' && (input.position === 'co' || input.position === 'btn' || input.position === 'bb')) {
      if (input.handClass === 'playable') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.04, raise: 0.04 });
      }
      if (input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: 0.05, raise: 0.05 });
      }
      if (deepStack && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.02, call: 0.01, raise: 0.01 });
      }
      if (deepStack && input.position === 'bb' && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: 0.06, call: -0.02, raise: -0.04 });
      }
      if ((deepStack || mediumDeepStack) && input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.05, raise: 0.03 });
      }
    }

    if (input.scenario === 'facing_limpers' && (input.position === 'co' || input.position === 'btn' || input.position === 'sb')) {
      if (input.handClass === 'strong' || input.handClass === 'playable') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.02, raise: 0.06 });
      }
      if (input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: 0.04, raise: 0.06 });
      }
      if (input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.02, raise: 0.06 });
      }
      if (deepStack && input.handClass === 'trash' && input.position === 'btn') {
        adjusted = nudgeMix(adjusted, { fold: -0.04, call: 0.01, raise: 0.03 });
      }
    }
  }

  return adjusted;
}
