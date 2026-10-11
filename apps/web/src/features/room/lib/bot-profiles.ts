import type { BotPersonality } from '@aipoker/shared';
import type { MessageKey } from '@/i18n';

export interface BotProfile {
  value: BotPersonality;
  nameKey: MessageKey;
  styleKey: MessageKey;
  descKey: MessageKey;
}

export const BOT_PROFILES: readonly BotProfile[] = [
  { value: 'fish', nameKey: 'lobby.room.bot.fish.name', styleKey: 'lobby.room.bot.fish.style', descKey: 'lobby.room.bot.fish.desc' },
  { value: 'tag', nameKey: 'lobby.room.bot.tag.name', styleKey: 'lobby.room.bot.tag.style', descKey: 'lobby.room.bot.tag.desc' },
  { value: 'lag', nameKey: 'lobby.room.bot.lag.name', styleKey: 'lobby.room.bot.lag.style', descKey: 'lobby.room.bot.lag.desc' },
];

export function getBotProfile(personality: string | null | undefined): BotProfile | null {
  return BOT_PROFILES.find((profile) => profile.value === personality) ?? null;
}
