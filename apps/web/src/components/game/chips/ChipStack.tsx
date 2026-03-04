'use client';

import { memo } from 'react';
import { cn, formatChips } from '@/lib/utils';

interface ChipStackProps {
  amount: number;
  label?: string;   // 可选标签（如 "下注"、"盲注"）
  size?: 'sm' | 'md';
  className?: string;
}

/** 根据金额确定筹码主颜色 */
function getChipColor(amount: number): string {
  if (amount >= 10000) return '#212121'; // 黑
  if (amount >= 5000)  return '#8E24AA'; // 紫
  if (amount >= 500)   return '#1E88E5'; // 蓝
  if (amount >= 100)   return '#E53935'; // 红
  if (amount >= 25)    return '#43A047'; // 绿
  return '#F5F5F5';                      // 白
}

function getChipCount(amount: number): number {
  if (amount === 0) return 0;
  if (amount <= 50)  return 1;
  if (amount <= 200) return 2;
  if (amount <= 500) return 3;
  if (amount <= 2000) return 4;
  return 5;
}

/** 单个筹码 SVG */
function Chip({ color, index }: { color: string; index: number }) {
  return (
    <div
      className="absolute"
      style={{
        bottom: index * 4,
        left: 0,
        width: 28,
        height: 12,
        zIndex: index,
      }}
    >
      <svg viewBox="0 0 28 12" className="w-full h-full drop-shadow-sm">
        {/* 筹码侧面 */}
        <ellipse cx="14" cy="10" rx="13" ry="3" fill={adjustColor(color, -30)} />
        {/* 筹码面 */}
        <ellipse cx="14" cy="7" rx="13" ry="5" fill={color} />
        {/* 高光 */}
        <ellipse cx="14" cy="5.5" rx="8" ry="2.5" fill={adjustColor(color, 30)} opacity="0.4" />
        {/* 边缘格纹（简化） */}
        <ellipse cx="14" cy="7" rx="13" ry="5" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" strokeDasharray="2 2" />
      </svg>
    </div>
  );
}

/** 简单的颜色亮度调整 */
function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export const ChipStack = memo(function ChipStack({
  amount,
  label,
  size = 'md',
  className,
}: ChipStackProps) {
  if (amount <= 0) return null;

  const color = getChipColor(amount);
  const count = getChipCount(amount);
  const stackHeight = count * 4 + 12;

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      {/* 筹码堆 */}
      <div className="relative" style={{ width: 28, height: stackHeight }}>
        {Array.from({ length: count }, (_, i) => (
          <Chip key={i} color={color} index={i} />
        ))}
      </div>

      {/* 金额标签 */}
      <div className="flex flex-col items-center gap-0.5">
        {label && (
          <span
            className="text-[var(--color-text-muted)] leading-none"
            style={{ fontSize: size === 'sm' ? 9 : 10 }}
          >
            {label}
          </span>
        )}
        <span
          className={cn(
            'font-chips font-semibold text-[var(--color-gold)] leading-none',
            size === 'sm' ? 'text-[11px]' : 'text-[13px]',
          )}
        >
          {formatChips(amount)}
        </span>
      </div>
    </div>
  );
});
