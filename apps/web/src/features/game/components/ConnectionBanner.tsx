'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

const CONNECTION_BANNER_CONFIG = {
  connecting: {
    text: '正在连接服务器',
    tone: 'border-[var(--color-warning)]/35 bg-[rgba(255,152,0,0.18)] text-[#ffc778]',
  },
  disconnected: {
    text: '连接已断开',
    tone: 'border-[var(--color-error)]/40 bg-[rgba(239,83,80,0.2)] text-[#ffb7b5]',
  },
  reconnecting: {
    text: '正在重新连接',
    tone: 'border-[var(--color-warning)]/35 bg-[rgba(255,152,0,0.18)] text-[#ffc778]',
  },
} as const;

interface ConnectionBannerProps {
  status: ConnectionStatus;
}

export function ConnectionBanner({ status }: ConnectionBannerProps) {
  if (status === 'connected') {
    return null;
  }

  const config = CONNECTION_BANNER_CONFIG[status];
  if (!config) {
    return null;
  }

  return (
    <motion.div
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -12, opacity: 0 }}
      className={cn(
        'fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full border px-4 py-1.5 text-center text-[12px] font-semibold tracking-[0.04em] backdrop-blur-lg',
        config.tone,
      )}
    >
      {config.text}
    </motion.div>
  );
}
