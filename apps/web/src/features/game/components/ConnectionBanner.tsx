'use client';

import { useT, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

const CONNECTION_BANNER_CONFIG: Record<Exclude<ConnectionStatus, 'connected'>, { key: MessageKey; tone: string }> = {
  connecting: { key: 'common.banner.connecting', tone: 'bg-caution/15 text-caution' },
  disconnected: { key: 'common.banner.disconnected', tone: 'bg-vermilion/20 text-vermilion-hi' },
  reconnecting: { key: 'common.banner.reconnecting', tone: 'bg-caution/15 text-caution' },
};

interface ConnectionBannerProps {
  status: ConnectionStatus;
}

/**
 * Thin status strip. GameView renders it in flow above the table stage, so it
 * pushes the stage down instead of floating over the felt.
 */
export function ConnectionBanner({ status }: ConnectionBannerProps) {
  const t = useT();
  if (status === 'connected') return null;
  const config = CONNECTION_BANNER_CONFIG[status];

  return (
    <div
      role="status"
      data-layout-box="connection-banner"
      className={cn(
        'label-index flex h-7 shrink-0 animate-[table-fade-in_180ms_ease-out] items-center justify-center truncate border-b border-line px-3 text-micro',
        config.tone,
      )}
    >
      {t(config.key)}
    </div>
  );
}
