'use client';

interface RoomStatusCardProps {
  playerCount: number;
  maxSeats: number;
  readyCount: number;
  activeStackPlayerCount: number;
  isPlaying: boolean;
}

export function RoomStatusCard({
  playerCount,
  maxSeats,
  readyCount,
  activeStackPlayerCount,
  isPlaying,
}: RoomStatusCardProps) {
  const rows: Array<[string, string]> = [
    ['玩家数', `${playerCount} / ${maxSeats}`],
    ['已准备', String(readyCount)],
    ['有效筹码', String(activeStackPlayerCount)],
    ['状态', isPlaying ? '游戏中' : '等待中'],
  ];

  return (
    <section aria-label="房间状态" className="border-b border-line p-4">
      <h2 className="text-[12px] font-medium text-text-3">房间状态</h2>
      <dl className="mt-2 divide-y divide-line text-[14px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-2">
            <dt className="text-text-2">{label}</dt>
            <dd className="font-medium tabular-nums text-text">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
