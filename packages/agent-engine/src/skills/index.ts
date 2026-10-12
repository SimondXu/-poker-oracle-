import type { AgentSkillDefinition, AgentSkillId } from '../types.ts';
import { POSTFLOP_SKILL_INSTRUCTIONS } from './postflop.ts';
import { PREFLOP_SKILL_INSTRUCTIONS } from './preflop.ts';

const SKILL_INSTRUCTIONS = {
  ...PREFLOP_SKILL_INSTRUCTIONS,
  ...POSTFLOP_SKILL_INSTRUCTIONS,
} satisfies Record<AgentSkillId, AgentSkillDefinition['buildInstruction']>;

export function getSkillInstructionBuilder(skillId: AgentSkillId): AgentSkillDefinition['buildInstruction'] {
  return SKILL_INSTRUCTIONS[skillId];
}
