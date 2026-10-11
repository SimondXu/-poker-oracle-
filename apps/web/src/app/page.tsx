'use client';

import { useCallback, useMemo, useState } from 'react';
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
type EntryTab = 'create' | 'join';

const TABS: Array<{ value: EntryTab; label: string }> = [
  { value: 'create', label: '创建房间' },
  { value: 'join', label: '加入房间' },
];

const FEATURES = ['实时多人对战', '规则 Bot 与 LLM 对手', '训练提示'];

const inputClass =
  'h-11 w-full rounded-panel border border-line bg-panel-2 px-3 text-[15px] text-text outline-none placeholder:text-text-3 focus:border-accent';
const labelClass = 'block text-[13px] font-medium text-text-2';
const primaryButtonClass =
  'h-12 w-full rounded-panel bg-accent text-[16px] font-semibold text-white transition-colors hover:bg-felt-hi disabled:cursor-not-allowed disabled:opacity-40';

export default function HomePage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [tab, setTab] = useState<EntryTab>('create');
  const [name, setName] = useState(user?.username ?? '');
  const [joinRoomCodeInput, setJoinRoomCodeInput] = useState('');
  const [joinRoomCodeTouched, setJoinRoomCodeTouched] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const normalizedJoinRoomCode = useMemo(
    () => normalizeRoomCode(joinRoomCodeInput),
    [joinRoomCodeInput],
  );
  const isJoinRoomCodeValid = isValidRoomCode(normalizedJoinRoomCode);
  const canCreate = name.trim().length > 0 && pendingAction === null;
  const canJoin = name.trim().length > 0 && isJoinRoomCodeValid && pendingAction === null;

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
    const trimmedName = name.trim();
    if (!trimmedName || pendingAction) return;

    setPendingAction('create');
    try {
      await bootstrapGuest(trimmedName);
      const roomCode = generateRoomCode();
      router.push(`/room/${roomCode}?intent=create`);
    } finally {
      setPendingAction(null);
    }
  }, [bootstrapGuest, name, pendingAction, router]);

  const handleJoinRoom = useCallback(async () => {
    const trimmedName = name.trim();
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
  }, [bootstrapGuest, name, joinRoomCodeInput, pendingAction, router]);

  const canSubmit = tab === 'create' ? canCreate : canJoin;
  const submit = () => void (tab === 'create' ? handleCreateRoom() : handleJoinRoom());

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-[420px]">
        <header className="text-center">
          <h1 className="text-[36px] font-bold leading-none tracking-tight text-text">AiPoker</h1>
          <p className="mt-3 text-[15px] text-text-2">和 AI 对手练习无限注德州扑克</p>
        </header>

        <section className="mt-8 rounded-panel border border-line bg-panel p-5 sm:p-6">
          <div role="tablist" aria-label="入口" className="grid grid-cols-2 rounded-panel bg-page p-1">
            {TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                id={`tab-${item.value}`}
                aria-selected={tab === item.value}
                aria-controls="entry-panel"
                onClick={() => setTab(item.value)}
                className={`h-9 rounded-[4px] text-[14px] font-medium transition-colors ${
                  tab === item.value ? 'bg-panel-2 text-text' : 'text-text-2 hover:text-text'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <form
            id="entry-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="block space-y-1.5">
              <span className={labelClass}>用户名</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：Alex"
                maxLength={20}
                autoFocus
                autoComplete="nickname"
                className={inputClass}
              />
            </label>

            {tab === 'join' && (
              <div className="space-y-1.5">
                <label className="block space-y-1.5">
                  <span className={labelClass}>房间号</span>
                  <input
                    type="text"
                    value={normalizedJoinRoomCode}
                    onChange={(event) => {
                      setJoinRoomCodeInput(event.target.value);
                      setJoinRoomCodeTouched(true);
                    }}
                    onBlur={() => setJoinRoomCodeTouched(true)}
                    placeholder="例如：A3K9Q2"
                    maxLength={ROOM_CODE_LENGTH}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={joinRoomCodeError ? true : undefined}
                    aria-describedby="join-code-hint"
                    className={`${inputClass} font-mono text-[17px] uppercase tracking-[0.2em] placeholder:tracking-normal ${
                      joinRoomCodeError ? 'border-fold focus:border-fold' : ''
                    }`}
                  />
                </label>
                <p
                  id="join-code-hint"
                  role={joinRoomCodeError ? 'alert' : undefined}
                  className={`min-h-[18px] text-[12px] ${joinRoomCodeError ? 'text-fold' : 'text-text-3'}`}
                >
                  {joinRoomCodeError ?? `${ROOM_CODE_LENGTH} 位房间号，自动大写`}
                </p>
              </div>
            )}

            <button type="submit" disabled={!canSubmit} className={primaryButtonClass}>
              {tab === 'create'
                ? pendingAction === 'create' ? '创建中...' : '创建并进入房间'
                : pendingAction === 'join' ? '加入中...' : '加入并进入房间'}
            </button>
          </form>
        </section>

        <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px] text-text-3">
          {FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
