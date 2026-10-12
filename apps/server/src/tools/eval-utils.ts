// Running sums keep long simulations O(1) in memory; mean/sd come out at report time.
export interface Sample {
  n: number;
  sum: number;
  sumSq: number;
}

export interface WinRateSummary {
  n: number;
  bbPer100: number;
  ci95: number;
}

export function createSample(): Sample {
  return { n: 0, sum: 0, sumSq: 0 };
}

export function addToSample(sample: Sample, value: number): void {
  sample.n += 1;
  sample.sum += value;
  sample.sumSq += value * value;
}

export function mergeSample(target: Sample, source: Sample): void {
  target.n += source.n;
  target.sum += source.sum;
  target.sumSq += source.sumSq;
}

/**
 * Each sample is a result in big blinds covering `handsPerSample` hands (1 for a single hand,
 * 2 for a duplicate pair). Returns bb/100 hands with a 95% normal-approximation half-width.
 */
export function summarizeSample(sample: Sample, handsPerSample = 1): WinRateSummary {
  if (sample.n === 0) {
    return { n: 0, bbPer100: 0, ci95: 0 };
  }

  const mean = sample.sum / sample.n;
  const variance = sample.n > 1 ? Math.max(0, (sample.sumSq - sample.n * mean * mean) / (sample.n - 1)) : 0;
  const scale = 100 / handsPerSample;
  return {
    n: sample.n,
    bbPer100: mean * scale,
    ci95: 1.96 * Math.sqrt(variance / sample.n) * scale,
  };
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Derives independent-looking sub-seeds (deal i, half h) from one CLI seed.
export function mixSeed(seed: number, salt: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}
