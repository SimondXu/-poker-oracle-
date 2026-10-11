'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface RoomInviteCardProps {
  roomId: string;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function RoomInviteCard({ roomId }: RoomInviteCardProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(async () => {
    const ok = await writeClipboard(roomId);
    setStatus(ok ? 'copied' : 'failed');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus('idle'), 1800);
  }, [roomId]);

  return (
    <section aria-label="邀请码" className="border-b border-line p-4">
      <h2 className="text-[12px] font-medium text-text-3">邀请码</h2>
      <div className="mt-2 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate rounded-panel border border-line bg-page px-3 py-2 font-mono text-[20px] tracking-[0.2em] text-text">
          {roomId}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="h-[44px] shrink-0 rounded-panel border border-line bg-panel-2 px-4 text-[14px] font-medium text-text hover:bg-line"
        >
          {status === 'copied' ? '已复制' : status === 'failed' ? '复制失败' : '复制'}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-text-3" aria-live="polite">
        把邀请码发给朋友，在首页选择“加入房间”输入即可。
      </p>
    </section>
  );
}
