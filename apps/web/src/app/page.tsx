'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LocaleToggle } from '@/components/LocaleToggle';
import { HomeScene } from '@/features/room/components/HomeScene';
import { Wordmark } from '@/features/room/components/Wordmark';
import { readLastUsername, saveLastUsername } from '@/features/room/lib/last-username';
import { codeField, fieldLabel, primaryButtonLarge, secondaryButton, textField } from '@/features/room/lib/room-ui';
import { useT } from '@/i18n';
import { ensureGuestSession } from '@/lib/auth-session';
import { cn } from '@/lib/utils';
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
} from '@/lib/room-code';
import { useAuthStore } from '@/stores/authStore';

type PendingAction = 'practice' | 'create' | 'join' | null;
type FormError = 'name' | 'network' | null;

export default function HomePage() {
  const t = useT();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [formError, setFormError] = useState<FormError>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const practiceRef = useRef<HTMLButtonElement>(null);
  const nameTouchedRef = useRef(false);

  // Remember the last name. Loaded after mount so the server render and first client render match.
  useEffect(() => {
    const remembered = readLastUsername() ?? user?.username ?? '';
    if (remembered && !nameTouchedRef.current) {
      setName(remembered);
    }
    // Keyboard devices: land on the next step. Touch devices: do not pop the keyboard.
    if (window.matchMedia('(pointer: fine)').matches) {
      (remembered ? practiceRef.current : nameRef.current)?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  const isCodeValid = isValidRoomCode(code);
  const codeError = codeTouched && !isCodeValid;
  const busy = pending !== null;

  const enter = useCallback(
    async (kind: Exclude<PendingAction, null>, targetCode: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        setFormError('name');
        nameRef.current?.focus();
        return;
      }

      setPending(kind);
      setFormError(null);
      try {
        const guest = await ensureGuestSession(trimmed);
        setUser({ id: guest.id, username: guest.username, isGuest: true, chips: 1000 });
        saveLastUsername(trimmed);
        const query = kind === 'join' ? 'intent=join' : kind === 'practice' ? 'intent=create&mode=practice' : 'intent=create';
        router.push(`/room/${targetCode}?${query}`);
      } catch {
        setPending(null);
        setFormError('network');
      }
    },
    [name, router, setUser],
  );

  const onPractice = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) void enter('practice', generateRoomCode());
  };

  const onCreate = () => {
    if (!busy) void enter('create', generateRoomCode());
  };

  const onJoin = (event: FormEvent) => {
    event.preventDefault();
    setCodeTouched(true);
    if (!busy && isCodeValid) void enter('join', code);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <LocaleToggle />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1280px] flex-1 content-start gap-6 px-4 pb-10 pt-5 sm:px-6 sm:pt-8 lg:grid-cols-[minmax(380px,460px)_minmax(0,1fr)] lg:content-center lg:items-center lg:gap-14 lg:py-10">
        <div className="lg:order-2">
          <HomeScene />
        </div>

        <div data-layout-box="home-form" className="w-full max-w-[460px] justify-self-center lg:justify-self-start">
          <h1 className="font-index text-balance text-title font-bold tracking-[0.005em] text-text sm:text-display">
            {t('lobby.home.title')}
          </h1>

          <form onSubmit={onPractice} noValidate className="mt-section space-y-3">
            <div className="space-y-snug">
              <label htmlFor="home-name" className={fieldLabel}>
                {t('lobby.home.nameLabel')}
              </label>
              <input
                id="home-name"
                ref={nameRef}
                type="text"
                value={name}
                onChange={(event) => {
                  nameTouchedRef.current = true;
                  setName(event.target.value);
                  if (formError === 'name') setFormError(null);
                }}
                placeholder={t('lobby.home.namePlaceholder')}
                data-testid="home-username"
                maxLength={20}
                autoComplete="nickname"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                aria-invalid={formError === 'name' ? true : undefined}
                aria-describedby={formError ? 'home-form-error' : undefined}
                className={cn(textField, formError === 'name' && 'border-vermilion focus:border-vermilion')}
              />
            </div>

            <p
              id="home-form-error"
              role="alert"
              className={cn('text-body text-vermilion-hi', !formError && 'hidden')}
            >
              {formError === 'name' ? t('lobby.home.nameRequired') : formError === 'network' ? t('lobby.home.errorNetwork') : ''}
            </p>

            <div className="space-y-snug">
              <button
                ref={practiceRef}
                type="submit"
                disabled={busy}
                data-testid="home-practice"
                className={primaryButtonLarge}
              >
                {pending === 'practice' ? t('lobby.home.practicePending') : t('lobby.home.practice')}
                {pending !== 'practice' && (
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                    <path d="M3 9h11M10 4.5L14.5 9 10 13.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <p className="text-body text-text-3">{t('lobby.home.practiceCaption')}</p>
            </div>
          </form>

          <div className="mt-6 space-y-gutter border-t border-brass/25 pt-6">
            <button type="button" onClick={onCreate} disabled={busy} data-testid="home-submit" className={secondaryButton}>
              {pending === 'create' ? t('lobby.home.createPending') : t('lobby.home.create')}
            </button>

            <form onSubmit={onJoin} noValidate className="space-y-snug">
              <label htmlFor="home-code" className={fieldLabel}>
                {t('lobby.home.join')}
              </label>
              <div className="flex gap-snug">
                <input
                  id="home-code"
                  type="text"
                  value={code}
                  onChange={(event) => {
                    const next = normalizeRoomCode(event.target.value);
                    setCode(next);
                    if (isValidRoomCode(next)) setCodeTouched(false);
                  }}
                  onBlur={() => setCodeTouched(code.length > 0)}
                  placeholder={t('lobby.home.joinPlaceholder')}
                  maxLength={ROOM_CODE_LENGTH}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby="home-code-hint"
                  className={cn(codeField, 'min-w-0 flex-1', codeError && 'border-vermilion focus:border-vermilion')}
                />
                <button type="submit" disabled={busy} className={cn(secondaryButton, 'w-[96px] shrink-0 px-3')}>
                  {pending === 'join' ? t('lobby.home.joinPending') : t('lobby.home.joinSubmit')}
                </button>
              </div>
              <p
                id="home-code-hint"
                role={codeError ? 'alert' : undefined}
                className={cn('text-body', codeError ? 'text-vermilion-hi' : 'text-text-3')}
              >
                {codeError
                  ? t('lobby.home.joinError', { length: ROOM_CODE_LENGTH })
                  : t('lobby.home.joinHint', { length: ROOM_CODE_LENGTH })}
              </p>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
