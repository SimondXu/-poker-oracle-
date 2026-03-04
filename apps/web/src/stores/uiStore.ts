import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * uiStore — UI 偏好状态（跨会话持久化）
 *
 * 与游戏逻辑无关的纯 UI 状态：面板开关、显示偏好等。
 */

interface UIState {
  // ── 训练提示 HUD ──
  isTrainingHUDVisible: boolean;
  toggleTrainingHUD: () => void;
  setTrainingHUDVisible: (visible: boolean) => void;

  // ── 行动历史面板 ──
  isActionHistoryVisible: boolean;
  toggleActionHistory: () => void;

  // ── 快捷键提示 ──
  showShortcutHints: boolean;
  setShowShortcutHints: (show: boolean) => void;

  // ── 动画速度 ──
  animationSpeed: 'slow' | 'normal' | 'fast';
  setAnimationSpeed: (speed: UIState['animationSpeed']) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isTrainingHUDVisible: true,
      toggleTrainingHUD: () => set((s) => ({ isTrainingHUDVisible: !s.isTrainingHUDVisible })),
      setTrainingHUDVisible: (visible) => set({ isTrainingHUDVisible: visible }),

      isActionHistoryVisible: true,
      toggleActionHistory: () => set((s) => ({ isActionHistoryVisible: !s.isActionHistoryVisible })),

      showShortcutHints: true,
      setShowShortcutHints: (show) => set({ showShortcutHints: show }),

      animationSpeed: 'normal',
      setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
    }),
    {
      name: 'aipoker-ui-prefs',
      // 只持久化偏好设置，不持久化动画状态
      partialize: (state) => ({
        isTrainingHUDVisible: state.isTrainingHUDVisible,
        isActionHistoryVisible: state.isActionHistoryVisible,
        showShortcutHints: state.showShortcutHints,
        animationSpeed: state.animationSpeed,
      }),
    },
  ),
);
