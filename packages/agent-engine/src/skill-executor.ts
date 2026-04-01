import { buildDeterministicContextPrompt } from './prompt-templates/context.ts';
import { buildBaseSystemPrompt } from './prompt-templates/base-system.ts';
import { buildPersonaPrompt } from './prompt-templates/persona.ts';
import type { SkillExecutionInput, SkillExecutionPrompt } from './types.ts';

function buildMemoryPrompt(memoryPrompt: string): string {
  return memoryPrompt.trim().length > 0
    ? `Recent memory:\n${memoryPrompt.trim()}`
    : 'Recent memory:\nNo recent memory is available for this decision.';
}

export function buildSkillExecutionPrompt(input: SkillExecutionInput): SkillExecutionPrompt {
  return {
    messages: [
      {
        role: 'system',
        content: `${buildBaseSystemPrompt()}\n\n${buildPersonaPrompt(input.runtimeConfig)}`,
      },
      { role: 'user', content: buildMemoryPrompt(input.memoryPrompt) },
      { role: 'user', content: buildDeterministicContextPrompt(input.context) },
      { role: 'user', content: input.skill.buildInstruction(input.context) },
    ],
    tools: input.tools,
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: `${input.skill.id}_action_plan`,
        schema: input.skill.outputSchema,
        strict: true,
      },
    },
  };
}
