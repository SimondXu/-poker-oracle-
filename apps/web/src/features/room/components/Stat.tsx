'use client';

interface StatProps {
  label: string;
  value: number;
  color?: string;
}

export function Stat({ label, value, color }: StatProps) {
  return (
    <div className="text-center">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</div>
      <div
        className="mt-2 font-display text-[32px] leading-none"
        style={{ color: color ?? 'var(--color-text-primary)' }}
      >
        {value}
      </div>
    </div>
  );
}
