import type {
  BotPersonality,
} from '@aipoker/shared';
import type { PersonalityProfile } from './types.ts';

export const PERSONALITY_PROFILES: Record<BotPersonality, PersonalityProfile> = {
  fish: {
    valueBetMinEquity: 0.72,
    semiBluffMinEquity: 0.58,
    callBuffer: -0.08,
    cbetFreqDry: 0.12,
    cbetFreqWet: 0.06,
    barrelFreq: 0.08,
    riverThinValueMinEquity: 0.78,
    thinkingRange: [900, 1700],
    adaptsToOpponents: false,
    bluffScale: 0.4,
    slowplayFreq: 0.3,
  },
  tag: {
    valueBetMinEquity: 0.62,
    semiBluffMinEquity: 0.54,
    callBuffer: 0.01,
    cbetFreqDry: 0.30,
    cbetFreqWet: 0.18,
    barrelFreq: 0.20,
    riverThinValueMinEquity: 0.68,
    thinkingRange: [1100, 2100],
    adaptsToOpponents: true,
    bluffScale: 1,
    slowplayFreq: 0.15,
  },
  lag: {
    valueBetMinEquity: 0.56,
    semiBluffMinEquity: 0.52,
    callBuffer: 0.0,
    cbetFreqDry: 0.56,
    cbetFreqWet: 0.34,
    barrelFreq: 0.31,
    riverThinValueMinEquity: 0.60,
    thinkingRange: [950, 1800],
    adaptsToOpponents: true,
    bluffScale: 1.35,
    slowplayFreq: 0.1,
  },
};
