'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ensureGuestSession } from '@/lib/auth-session';
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
} from '@/lib/room-code';
import { useAuthStore } from '@/stores/authStore';

type PendingAction = 'create' | 'join' | null;

function EntryCard({
  title,
  tag,
  children,
}: {
  title: string;
  tag: string;
  children: ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[24px] border border-white/14 bg-[rgba(8,15,25,0.84)] p-6 sm:p-7"
      style={{ boxShadow: 'var(--shadow-float), var(--shadow-hairline)' }}
    >
      <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-gold)]/40 to-transparent" />
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-[36px] leading-[0.96] text-[var(--color-text-primary)] sm:text-[40px]">
          {title}
        </h2>
        <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] tracking-[0.12em] text-[var(--color-text-secondary)]">
          {tag}
        </span>
      </div>
      {children}
    </section>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [createName, setCreateName] = useState(user?.username ?? '');
  const [joinName, setJoinName] = useState(user?.username ?? '');
  const [joinRoomCodeInput, setJoinRoomCodeInput] = useState('');
  const [joinRoomCodeTouched, setJoinRoomCodeTouched] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const normalizedJoinRoomCode = useMemo(
    () => normalizeRoomCode(joinRoomCodeInput),
    [joinRoomCodeInput],
  );
  const isJoinRoomCodeValid = isValidRoomCode(normalizedJoinRoomCode);
  const canCreate = createName.trim().length > 0 && pendingAction === null;
  const canJoin = joinName.trim().length > 0 && isJoinRoomCodeValid && pendingAction === null;

  const joinRoomCodeError =
    joinRoomCodeTouched && normalizedJoinRoomCode.length > 0 && !isJoinRoomCodeValid
      ? `房间号需为 ${ROOM_CODE_LENGTH} 位，且仅可使用大写字母和数字`
      : null;

  const bootstrapGuest = useCallback(
    async (username: string) => {
      const guestUser = await ensureGuestSession(username);
      setUser({ id: guestUser.id, username: guestUser.username, isGuest: true, chips: 1000 });
    },
    [setUser],
  );

  const handleCreateRoom = useCallback(async () => {
    const trimmedName = createName.trim();
    if (!trimmedName || pendingAction) return;

    setPendingAction('create');
    try {
      await bootstrapGuest(trimmedName);
      const roomCode = generateRoomCode();
      router.push(`/room/${roomCode}?intent=create`);
    } finally {
      setPendingAction(null);
    }
  }, [bootstrapGuest, createName, pendingAction, router]);

  const handleJoinRoom = useCallback(async () => {
    const trimmedName = joinName.trim();
    const roomCode = normalizeRoomCode(joinRoomCodeInput);
    setJoinRoomCodeInput(roomCode);
    setJoinRoomCodeTouched(true);

    if (!trimmedName || !isValidRoomCode(roomCode) || pendingAction) {
      return;
    }

    setPendingAction('join');
    try {
      await bootstrapGuest(trimmedName);
      router.push(`/room/${roomCode}?intent=join`);
    } finally {
      setPendingAction(null);
    }
  }, [bootstrapGuest, joinName, joinRoomCodeInput, pendingAction, router]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -left-28 top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,215,0,0.2),transparent_70%)] blur-2xl" />
        <div className="absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(54,107,175,0.2),transparent_72%)] blur-3xl" />
      </div>

      <main className="mx-auto flex min-h-screen w-full max-w-[1260px] items-center px-6 py-14 sm:px-10 lg:px-14">
        <section className="grid w-full gap-9 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-11">
          <div className="space-y-8 lg:pr-4">
            <span className="inline-flex rounded-full border border-[var(--color-gold)]/28 bg-[var(--color-gold)]/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[var(--color-gold)]">
              Free Mode Lobby
            </span>

            <div className="space-y-4">
              <h1 className="font-display text-[56px] leading-[0.9] text-[var(--color-text-primary)] sm:text-[66px]">
                Ai<span className="text-[var(--color-gold)]">Poker</span>
              </h1>
              <p className="max-w-[35rem] text-[25px] leading-tight text-[#d5deea] sm:text-[30px]">
                自由模式训练室，专注联机实战与连续对局。
              </p>
              <p className="max-w-[35rem] text-[17px] leading-[1.7] text-[#b4c0cf]">
                当前版本只保留最直接的两种入口：创建房间，或输入房间号加入。输入后立即进入等待室，不需要登录注册流程。
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: '入口 1：创建房间',
                  desc: '输入用户名后生成 6 位房间号，作为本局邀请码。',
                },
                {
                  title: '入口 2：加入房间',
                  desc: '输入用户名 + 房间号加入；房间不存在会直接提示。',
                },
              ].map((item, index) => (
                <article
                  key={item.title}
                  className="rounded-[18px] border border-white/10 bg-[rgba(16,24,34,0.74)] px-5 py-4"
                  style={{
                    boxShadow: 'var(--shadow-hairline)',
                    animation: 'fade-in-up 440ms ease-out both',
                    animationDelay: `${index * 120 + 120}ms`,
                  }}
                >
                  <h2 className="text-[14px] font-semibold text-[#dce4ef]">{item.title}</h2>
                  <p className="mt-1.5 text-[13px] leading-[1.65] text-[#9ca9bb]">{item.desc}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <EntryCard title="创建房间" tag="入口 1">
              <div className="space-y-4">
                <label className="block space-y-2">
                  <span className="block text-[11px] uppercase tracking-[0.18em] text-[#8594a8]">用户名</span>
                  <input
                    type="text"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleCreateRoom();
                      }
                    }}
                    placeholder="例如：Edison"
                    maxLength={20}
                    autoFocus
                    className="h-[52px] w-full rounded-[14px] border border-white/15 bg-white/[0.05] px-4 text-[16px] text-[#edf3fb] outline-none transition-all placeholder:text-[#6f8097] focus:border-[var(--color-gold)]/60 focus:bg-white/[0.08]"
                  />
                </label>

                <button
                  onClick={() => void handleCreateRoom()}
                  disabled={!canCreate}
                  className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#f6d57a]/55 bg-gradient-to-r from-[#c6a33d] via-[#dfbe65] to-[#efcf7e] px-4 text-[16px] font-semibold tracking-[0.03em] text-[#241600] shadow-[0_10px_30px_rgba(214,178,84,0.25)] transition-all hover:brightness-105 hover:shadow-[0_16px_36px_rgba(214,178,84,0.35)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {pendingAction === 'create' ? '创建中...' : '创建并进入房间'}
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </button>
              </div>
            </EntryCard>

            <EntryCard title="加入房间" tag="入口 2">
              <div className="space-y-4">
                <label className="block space-y-2">
                  <span className="block text-[11px] uppercase tracking-[0.18em] text-[#8594a8]">用户名</span>
                  <input
                    type="text"
                    value={joinName}
                    onChange={(event) => setJoinName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleJoinRoom();
                      }
                    }}
                    placeholder="例如：Alice"
                    maxLength={20}
                    className="h-[52px] w-full rounded-[14px] border border-white/15 bg-white/[0.05] px-4 text-[16px] text-[#edf3fb] outline-none transition-all placeholder:text-[#6f8097] focus:border-[var(--color-gold)]/60 focus:bg-white/[0.08]"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="block text-[11px] uppercase tracking-[0.18em] text-[#8594a8]">房间号</span>
                  <input
                    type="text"
                    value={normalizedJoinRoomCode}
                    onChange={(event) => {
                      setJoinRoomCodeInput(event.target.value);
                      setJoinRoomCodeTouched(true);
                    }}
                    onBlur={() => setJoinRoomCodeTouched(true)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleJoinRoom();
                      }
                    }}
                    placeholder="例如：A3K9Q2"
                    maxLength={ROOM_CODE_LENGTH}
                    autoComplete="off"
                    className="h-[52px] w-full rounded-[14px] border border-white/15 bg-white/[0.05] px-4 font-mono text-[17px] tracking-[0.22em] text-[#edf3fb] uppercase outline-none transition-all placeholder:tracking-[0.08em] placeholder:text-[#6f8097] focus:border-[var(--color-gold)]/60 focus:bg-white/[0.08]"
                  />
                </label>

                <p className="min-h-[20px] text-[12px] leading-[1.5] text-[#a7b4c6]">
                  {joinRoomCodeError ?? `房间号为 ${ROOM_CODE_LENGTH} 位（自动大写）`}
                </p>

                <button
                  onClick={() => void handleJoinRoom()}
                  disabled={!canJoin}
                  className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border border-white/18 bg-[linear-gradient(140deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 text-[16px] font-semibold tracking-[0.03em] text-[var(--color-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_28px_rgba(0,0,0,0.35)] transition-all hover:border-[var(--color-gold)]/38 hover:text-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {pendingAction === 'join' ? '加入中...' : '加入房间'}
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </button>
              </div>
            </EntryCard>
          </div>
        </section>
      </main>
    </div>
  );
}
