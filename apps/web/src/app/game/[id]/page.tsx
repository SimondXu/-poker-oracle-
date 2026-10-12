'use client';

import { use, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GameView } from '@/features/game/components/GameView';
import { useGameScreenState } from '@/features/game/hooks/useGameScreenState';
import { useGameSocket } from '@/features/game/hooks/useGameSocket';
import { useAuthStore } from '@/stores/authStore';

interface GamePageProps {
  params: Promise<{ id: string }>;
}

export default function GamePage({ params }: GamePageProps) {
  const { id: roomId } = use(params);
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? '';
  const currentUserName = user?.username ?? '';

  const { sendAction, startNextHand, spectateAfterElimination } = useGameSocket(
    roomId,
    currentUserId,
    currentUserName,
    Boolean(user),
  );
  const screen = useGameScreenState({
    currentUserId,
    startNextHand,
    spectateAfterElimination,
  });

  useEffect(() => {
    if (!user) {
      router.replace('/');
    }
  }, [router, user]);

  const handleReturnToLobby = useCallback(() => {
    router.push('/');
  }, [router]);

  if (!user) {
    return null;
  }

  return (
    <GameView
      roomId={roomId}
      currentUserId={currentUserId}
      screen={screen}
      onAction={sendAction}
      onReturnToLobby={handleReturnToLobby}
    />
  );
}
