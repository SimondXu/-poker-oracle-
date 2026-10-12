import type { BotDecisionContext } from '@aipoker/shared';

import { AGENT_SKILLS } from './skill-registry.ts';
import type { AgentSkillDefinition } from './types.ts';

export function selectCandidateSkills(
  context: BotDecisionContext,
  options?: { maxCandidates?: number },
): AgentSkillDefinition[] {
  const filtered = AGENT_SKILLS.filter(
    (skill) => skill.phases.includes(context.phase) && skill.isApplicable(context),
  );

  const exclusive = filtered.filter((skill) => skill.exclusive);
  const candidates = (exclusive.length > 0 ? exclusive : filtered)
    .slice()
    .sort((left, right) => right.priority - left.priority);

  if (!options?.maxCandidates || options.maxCandidates <= 0) {
    return candidates;
  }

  return candidates.slice(0, options.maxCandidates);
}
