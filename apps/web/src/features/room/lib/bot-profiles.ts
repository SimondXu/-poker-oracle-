import { CLI_AGENT_MODELS, type BotPersonality, type CliAgentModel } from '@aipoker/shared';
import type { MessageKey } from '@/i18n';

/** What the add-bot menu offers: a rule bot's personality, or a Claude Code model. */
export type BotChoice = BotPersonality | CliAgentModel;

export interface BotProfile {
  value: BotChoice;
  nameKey: MessageKey;
  styleKey: MessageKey;
  descKey: MessageKey;
}

export const BOT_PROFILES: readonly BotProfile[] = [
  { value: 'fish', nameKey: 'lobby.room.bot.fish.name', styleKey: 'lobby.room.bot.fish.style', descKey: 'lobby.room.bot.fish.desc' },
  { value: 'tag', nameKey: 'lobby.room.bot.tag.name', styleKey: 'lobby.room.bot.tag.style', descKey: 'lobby.room.bot.tag.desc' },
  { value: 'lag', nameKey: 'lobby.room.bot.lag.name', styleKey: 'lobby.room.bot.lag.style', descKey: 'lobby.room.bot.lag.desc' },
];

/** Offered only when the server reports Claude Code bots (`RoomState.cliBots`). */
export const CLI_BOT_PROFILES: readonly BotProfile[] = [
  { value: 'claude-cli:claude-haiku-5-5', nameKey: 'lobby.room.bot.haiku.name', styleKey: 'lobby.room.bot.haiku.style', descKey: 'lobby.room.bot.haiku.desc' },
  { value: 'claude-cli:claude-sonnet-5-5', nameKey: 'lobby.room.bot.sonnet.name', styleKey: 'lobby.room.bot.sonnet.style', descKey: 'lobby.room.bot.sonnet.desc' },
];

export function isCliBotChoice(choice: BotChoice): choice is CliAgentModel {
  return (CLI_AGENT_MODELS as readonly string[]).includes(choice);
}

export function getBotProfile(choice: string | null | undefined): BotProfile | null {
  return [...BOT_PROFILES, ...CLI_BOT_PROFILES].find((profile) => profile.value === choice) ?? null;
}
