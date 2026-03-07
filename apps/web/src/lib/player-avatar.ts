import type { BotPersonality } from '@aipoker/shared';

type AvatarSrc = '/avatars/player-human.svg'
  | '/avatars/bot-fish.svg'
  | '/avatars/bot-tag.svg'
  | '/avatars/bot-lag.svg'
  | '/avatars/bot-default.svg';

interface PlayerAvatarInput {
  name: string;
  isBot: boolean;
  botStrategy?: BotPersonality | string | null | undefined;
  isHeroPlayer?: boolean;
}

interface PlayerAvatarMeta {
  src: AvatarSrc | null;
  alt: string | null;
  fallbackLabel: string;
}

const BOT_AVATAR_BY_PERSONALITY: Record<BotPersonality, AvatarSrc> = {
  fish: '/avatars/bot-fish.svg',
  tag: '/avatars/bot-tag.svg',
  lag: '/avatars/bot-lag.svg',
};

function getFallbackLabel(name: string): string {
  const initial = name.trim().charAt(0).toUpperCase();
  return initial || '?';
}

export function getPlayerAvatarMeta({
  name,
  isBot,
  botStrategy,
  isHeroPlayer = false,
}: PlayerAvatarInput): PlayerAvatarMeta {
  const fallbackLabel = getFallbackLabel(name);

  if (!isBot) {
    return isHeroPlayer
      ? {
          src: '/avatars/player-human.svg',
          alt: `${name} avatar`,
          fallbackLabel,
        }
      : {
          src: null,
          alt: null,
          fallbackLabel,
        };
  }

  const src = botStrategy && botStrategy in BOT_AVATAR_BY_PERSONALITY
    ? BOT_AVATAR_BY_PERSONALITY[botStrategy as BotPersonality]
    : '/avatars/bot-default.svg';

  return {
    src,
    alt: `${name} avatar`,
    fallbackLabel,
  };
}
