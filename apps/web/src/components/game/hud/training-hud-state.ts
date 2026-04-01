import type { TrainingStrength, TrainingSuggestion } from '@aipoker/strategy-engine';

export interface TrainingHUDData {
  position?: string;
  strength?: TrainingStrength;
  potOdds?: number;
  winRequirement?: number;
  suggestion?: TrainingSuggestion;
  suggestionReason?: string;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatTrainingStrength(strength: TrainingStrength | undefined): string {
  if (!strength) {
    return '—';
  }

  if (strength.kind === 'top_percent') {
    return `Top ${Math.round(strength.value * 100)}%`;
  }

  return `权益 ${Math.round(strength.value * 100)}%`;
}

export function getTrainingStrengthBarValue(strength: TrainingStrength | undefined): number {
  if (!strength) {
    return 0;
  }

  return strength.kind === 'top_percent' ? 1 - strength.value : strength.value;
}

export function getTrainingDetailLines(data: TrainingHUDData | undefined): string[] {
  if (!data) {
    return [];
  }

  const lines: string[] = [];

  if (data.suggestionReason) {
    lines.push(data.suggestionReason);
  }

  if (data.potOdds !== undefined && data.winRequirement !== undefined) {
    lines.push(`当前底池赔率 ${formatPercent(data.potOdds)}，继续至少需要 ${formatPercent(data.winRequirement)} 的权益。`);
  }

  if (data.strength?.kind === 'equity' && data.winRequirement !== undefined) {
    lines.push(
      data.strength.value >= data.winRequirement
        ? `你的当前权益约 ${formatPercent(data.strength.value)}，已经高于继续门槛。`
        : `你的当前权益约 ${formatPercent(data.strength.value)}，仍低于继续门槛。`,
    );
  }

  return lines;
}

export function hasTrainingDetails(data: TrainingHUDData | undefined): boolean {
  return getTrainingDetailLines(data).length > 0;
}
