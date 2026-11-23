import { create } from 'zustand';
import { api, ApiError, type User } from '@/api';

interface AuthState {
  user: User | null;
  /** Desktop app: single user, no login or registration screens. */
  desktop: boolean;
  loading: boolean;
  error: string | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  desktop: false,
  loading: true,
  error: null,

  init: async () => {
    try {
      const { user, desktop } = await api.me();
      set({ user, desktop: desktop === true, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const { user } = await api.login(email, password);
      set({ user });
    } catch (error) {
      set({ error: error instanceof ApiError ? error.message : 'Inloggen is niet gelukt.' });
      throw error;
    }
  },

  register: async (name, email, password) => {
    set({ error: null });
    try {
      const { user } = await api.register(name, email, password);
      set({ user });
    } catch (error) {
      set({ error: error instanceof ApiError ? error.message : 'Account aanmaken is niet gelukt.' });
      throw error;
    }
  },

  logout: async () => {
    // The desktop app has no accounts, so there is nothing to log out of.
    if (get().desktop) return;
    await api.logout();
    set({ user: null });
  },

  clearError: () => set({ error: null }),
}));
