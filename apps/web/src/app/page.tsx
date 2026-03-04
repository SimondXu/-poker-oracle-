import Link from 'next/link';

export default function HomePage() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-8"
      style={{ background: 'radial-gradient(ellipse at center, #0D1A0D 0%, #07090F 70%)' }}
    >
      {/* Brand */}
      <div className="flex flex-col items-center gap-3">
        <span style={{ fontSize: 64, lineHeight: 1 }}>♠</span>
        <h1
          className="font-bold tracking-tight"
          style={{ fontSize: 40, color: '#E6EDF3' }}
        >
          Ai<span style={{ color: '#FFD700' }}>Poker</span>
        </h1>
        <p style={{ color: '#8B949E', fontSize: 14 }}>专业德州扑克训练室</p>
      </div>

      {/* Quick access (dev only) */}
      <Link
        href="/game/dev-room-001"
        className="px-6 py-3 rounded-xl text-sm font-semibold transition-all"
        style={{
          background: 'rgba(255,215,0,0.12)',
          border: '1px solid rgba(255,215,0,0.3)',
          color: '#FFD700',
        }}
      >
        进入测试牌桌 →
      </Link>
    </div>
  );
}
