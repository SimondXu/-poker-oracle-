'use client';

import { use, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GameView } from '@/features/game/components/GameView';
import { useGameScreenState } from '@/features/game/hooks/useGameScreenState';
import { useGameSocket } from '@/features/game/hooks/useGameSocket';
import { useTableSounds } from '@/features/game/hooks/useTableSounds';
import { generateRoomCode } from '@/lib/room-code';
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
  useTableSounds();
  const screen = useGameScreenState({
    currentUserId,
    startNextHand,
    spectateAfterElimination,
  });

  useEffect(() => {
    // The first client render uses the store's server snapshot (no user) even when the persisted
    // user is already loaded, so check the live store before sending the visitor home.
    if (!user && !useAuthStore.getState().user) {
      router.replace('/');
    }
  }, [router, user]);

  const handleReturnToLobby = useCallback(() => {
    router.push('/');
  }, [router]);

  // Same path as "Practice now" on the home page: a fresh table with five bots.
  const handlePlayAgain = useCallback(() => {
    router.push(`/room/${generateRoomCode()}?intent=create&mode=practice`);
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
      onPlayAgain={handlePlayAgain}
    />
  );
}
