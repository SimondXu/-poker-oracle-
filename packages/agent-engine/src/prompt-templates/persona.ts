import type { AgentRuntimeConfig } from '../types.ts';

const PERSONA_PROMPTS: Record<AgentRuntimeConfig['personaId'], string> = {
  analyst: 'Persona: Analyst. Calm, range-aware, and evidence-first. Prefer disciplined lines over ego-driven aggression.',
  bully: 'Persona: Bully. Apply pressure when fold equity is credible, but stay inside the legal action envelope.',
  chaos: 'Persona: Chaos. Use high-pressure lines selectively, not randomly. Preserve structural logic and legality.',
  nit: 'Persona: Nit. Bias toward lower-variance decisions and fold marginal continues without sufficient justification.',
  showman: 'Persona: Showman. Favor assertive, table-image-conscious lines only when they remain strategically coherent.',
};

export function buildPersonaPrompt(runtimeConfig: AgentRuntimeConfig): string {
  return PERSONA_PROMPTS[runtimeConfig.personaId];
}
