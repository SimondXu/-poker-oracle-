'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, parseCard, isRedSuit, SUIT_SYMBOLS, displayRank } from '@/lib/utils';

interface PlayingCardProps {
  card?: string;         // e.g. "Ah", "Kd", "Tc" — undefined = face-down
  size?: 'xs' | 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  highlight?: boolean;   // 高亮（赢牌手牌）
  dim?: boolean;         // 暗化（输牌/弃牌）
  animateDeal?: boolean; // 触发发牌飞入动画
  className?: string;
}

const SIZE_CONFIG = {
  xs: { w: 28, h: 40, rankSize: 'text-[9px]', suitSize: 'text-[8px]', centerSize: 'text-[14px]' },
  sm: { w: 40, h: 58, rankSize: 'text-[12px]', suitSize: 'text-[10px]', centerSize: 'text-[20px]' },
  md: { w: 56, h: 80, rankSize: 'text-[15px]', suitSize: 'text-[13px]', centerSize: 'text-[28px]' },
  lg: { w: 72, h: 104, rankSize: 'text-[19px]', suitSize: 'text-[16px]', centerSize: 'text-[36px]' },
};

/** 牌背图案（深色菱形格纹） */
function CardBack({ size }: { size: keyof typeof SIZE_CONFIG }) {
  const cfg = SIZE_CONFIG[size];
  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-card)] border border-white/10 select-none"
      style={{ width: cfg.w, height: cfg.h }}
    >
      {/* 背景渐变 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a2a4a] via-[#0f1a30] to-[#0a1020]" />
      {/* 菱形格纹 */}
      <svg
        className="absolute inset-0 opacity-30"
        width={cfg.w}
        height={cfg.h}
        viewBox={`0 0 ${cfg.w} ${cfg.h}`}
      >
        <defs>
          <pattern id="diamond" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M4 0 L8 4 L4 8 L0 4 Z" fill="none" stroke="rgba(255,215,0,0.25)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={cfg.w} height={cfg.h} fill="url(#diamond)" />
      </svg>
      {/* 中心徽标 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[var(--color-gold-muted)] font-bold opacity-60" style={{ fontSize: cfg.centerSize }}>
          ♠
        </span>
      </div>
      {/* 内边框 */}
      <div className="absolute inset-[3px] rounded-[6px] border border-[rgba(255,215,0,0.15)]" />
    </div>
  );
}

/** 牌面正面 */
function CardFace({
  rank,
  suit,
  size,
  highlight,
  dim,
}: {
  rank: string;
  suit: string;
  size: keyof typeof SIZE_CONFIG;
  highlight: boolean;
  dim: boolean;
}) {
  const cfg = SIZE_CONFIG[size];
  const isRed = isRedSuit(suit);
  const suitSymbol = SUIT_SYMBOLS[suit] ?? suit;
  const displayR = displayRank(rank);

  const textColor = isRed
    ? 'text-[#DC2626]'
    : 'text-[#1a1a1a]';

  return (
    <div
      className={cn(
        'relative select-none rounded-[var(--radius-card)] overflow-hidden',
        'border border-[rgba(0,0,0,0.08)]',
        highlight && 'ring-2 ring-[var(--color-gold)] ring-offset-1 ring-offset-transparent',
        dim && 'opacity-40 grayscale',
      )}
      style={{
        width: cfg.w,
        height: cfg.h,
        background: highlight
          ? 'linear-gradient(145deg, #fffdf0, #fff9e6)'
          : 'linear-gradient(145deg, #FAFAFA, #F0F0F0)',
        boxShadow: highlight
          ? 'var(--shadow-card), var(--shadow-glow-gold)'
          : 'var(--shadow-card)',
      }}
    >
      {/* 左上角：Rank + Suit */}
      <div className={cn('absolute top-[3px] left-[4px] flex flex-col items-center leading-none', textColor)}>
        <span className={cn('font-bold leading-none', cfg.rankSize)}>{displayR}</span>
        <span className={cn('leading-none', cfg.suitSize)}>{suitSymbol}</span>
      </div>

      {/* 右下角（旋转180°） */}
      <div
        className={cn(
          'absolute bottom-[3px] right-[4px] flex flex-col items-center leading-none rotate-180',
          textColor,
        )}
      >
        <span className={cn('font-bold leading-none', cfg.rankSize)}>{displayR}</span>
        <span className={cn('leading-none', cfg.suitSize)}>{suitSymbol}</span>
      </div>

      {/* 中心花色 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('leading-none', cfg.centerSize, textColor, 'opacity-80')}>
          {suitSymbol}
        </span>
      </div>

      {/* 高光边缘效果 */}
      <div className="absolute inset-0 rounded-[var(--radius-card)] bg-gradient-to-br from-white/50 via-transparent to-black/5 pointer-events-none" />
    </div>
  );
}

export const PlayingCard = memo(function PlayingCard({
  card,
  size = 'md',
  faceDown = false,
  highlight = false,
  dim = false,
  animateDeal = false,
  className,
}: PlayingCardProps) {
  const showFaceDown = faceDown || !card;

  const dealVariants = {
    initial: animateDeal
      ? { opacity: 0, y: -80, rotate: -15, scale: 0.6 }
      : { opacity: 1, y: 0, rotate: 0, scale: 1 },
    animate: { opacity: 1, y: 0, rotate: 0, scale: 1 },
    exit:    { opacity: 0, scale: 0.8, transition: { duration: 0.2 } },
  };

  const parsed = card ? parseCard(card) : null;

  return (
    <motion.div
      className={cn('relative', className)}
      variants={dealVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 24,
        mass: 0.8,
      }}
      style={{ perspective: 600 }}
    >
      <AnimatePresence mode="wait">
        {showFaceDown ? (
          <motion.div
            key="back"
            initial={{ rotateY: 90 }}
            animate={{ rotateY: 0 }}
            exit={{ rotateY: 90 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <CardBack size={size} />
          </motion.div>
        ) : (
          <motion.div
            key={`face-${card}`}
            initial={{ rotateY: 90 }}
            animate={{ rotateY: 0 }}
            exit={{ rotateY: 90 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <CardFace
              rank={parsed!.rank}
              suit={parsed!.suit}
              size={size}
              highlight={highlight}
              dim={dim}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
