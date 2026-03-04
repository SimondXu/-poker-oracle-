import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  username: string;
  isGuest: boolean;
  chips: number;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null }),
    }),
    {
      name: 'aipoker-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);

export const selectUser = (s: AuthState) => s.user;
export const selectIsLoggedIn = (s: AuthState) => s.user !== null;
