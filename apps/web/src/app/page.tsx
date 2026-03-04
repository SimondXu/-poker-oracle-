'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function HomePage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.username ?? '');

  const handleEnter = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const userId = user?.id ?? generateId('user');
    setUser({ id: userId, username: trimmed, isGuest: true, chips: 1000 });

    const roomId = generateId('room');
    router.push(`/room/${roomId}`);
  }, [name, user, setUser, router]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-16 top-10 h-px bg-gradient-to-r from-transparent via-white/22 to-transparent" />
      <div className="pointer-events-none absolute inset-x-16 bottom-10 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <main className="mx-auto flex min-h-screen w-full max-w-[1240px] items-center px-6 py-14 sm:px-10 lg:px-14">
        <section className="grid w-full items-center gap-y-12 lg:grid-cols-12 lg:gap-x-16">
          <div className="space-y-8 lg:col-span-6">
            <div className="space-y-6">
              <span className="inline-flex rounded-full border border-[var(--color-gold)]/28 bg-[var(--color-gold)]/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[var(--color-gold)]">
                Private Poker Suite
              </span>
              <div className="space-y-4">
                <h1 className="font-display text-[58px] leading-[0.92] text-[var(--color-text-primary)] sm:text-[66px]">
                  Ai<span className="text-[var(--color-gold)]">Poker</span>
                </h1>
                <p className="max-w-[35rem] text-[26px] leading-tight text-[#d5deea] sm:text-[30px]">
                  让每一手牌都更接近专业级决策。
                </p>
                <p className="max-w-[35rem] text-[18px] leading-[1.65] text-[#b4c0cf]">
                  从即时行动反馈到结构化复盘，沉浸式训练环境把感性经验转化为可复制的技术优势。
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: '实时训练', desc: '决策完成后立即获得反馈，不等复盘。' },
                { title: '高质感桌面', desc: '稳定信息层级，长局对战依然清晰。' },
              ].map((item) => (
                <article
                  key={item.title}
                  className="rounded-[18px] border border-white/10 bg-[rgba(16,24,34,0.72)] px-5 py-4"
                  style={{ boxShadow: 'var(--shadow-hairline)' }}
                >
                  <h2 className="text-[15px] font-semibold text-[#dce4ef]">{item.title}</h2>
                  <p className="mt-1.5 text-[14px] leading-[1.6] text-[#9ca9bb]">{item.desc}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div
              className="relative ml-auto w-full max-w-[520px] rounded-[24px] border border-white/14 bg-[rgba(7,14,24,0.86)] px-7 py-7 sm:px-8 sm:py-8"
              style={{ boxShadow: 'var(--shadow-float), var(--shadow-hairline)' }}
            >
              <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-gold)]/45 to-transparent" />

              <div className="space-y-3">
                <h2 className="font-display text-[45px] leading-[0.94] text-[var(--color-text-primary)] sm:text-[52px]">
                  进入训练室
                </h2>
                <p className="max-w-[26rem] text-[16px] leading-[1.6] text-[#b7c3d4]">
                  输入昵称后系统将自动创建你的专属房间，立刻可进入实战训练。
                </p>
              </div>

              <div className="mt-6 space-y-4">
                <label className="block space-y-2">
                  <span className="block text-[11px] uppercase tracking-[0.18em] text-[#8594a8]">玩家昵称</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEnter()}
                    placeholder="输入昵称"
                    maxLength={20}
                    autoFocus
                    className="h-[52px] w-full rounded-[14px] border border-white/15 bg-white/[0.05] px-4 text-[16px] text-[#edf3fb] outline-none transition-all placeholder:text-[#6f8097] focus:border-[var(--color-gold)]/60 focus:bg-white/[0.08]"
                  />
                </label>

                <button
                  onClick={handleEnter}
                  disabled={!name.trim()}
                  className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#f6d57a]/55 bg-gradient-to-r from-[#c6a33d] via-[#dfbe65] to-[#efcf7e] px-4 text-[16px] font-semibold tracking-[0.03em] text-[#241600] shadow-[0_10px_30px_rgba(214,178,84,0.25)] transition-all hover:brightness-105 hover:shadow-[0_16px_36px_rgba(214,178,84,0.35)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  进入训练室
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
