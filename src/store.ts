import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export interface Credentials {
  id: string;
  username: string;
  access_token: string;
  refresh_token: string;
  expires: string;
}

export interface AppSettings {
  last_played_profile: string | null;
  ram: number | null;
  java_args: string | null;
  theme: string | null;
  open_logs_after_start?: boolean | null;
  enable_discord_rpc?: boolean | null;
}

interface AppState {
  accounts: Credentials[];
  activeAccountId: string | null;
  runningInstances: number;
  activeSkinUrl: string | null;
  theme: string;
  setAccounts: (accounts: Credentials[]) => void;
  setActiveAccountId: (id: string | null) => void;
  setRunningInstances: (count: number) => void;
  setActiveSkinUrl: (url: string | null) => void;
  setTheme: (theme: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      accounts: [],
      activeAccountId: null,
      runningInstances: 0,
      activeSkinUrl: null,
      theme: 'dark',
      setAccounts: (accounts) => set({ accounts }),
      setActiveAccountId: (activeAccountId) => set({ activeAccountId }),
      setRunningInstances: (runningInstances) => set({ runningInstances }),
      setActiveSkinUrl: (activeSkinUrl) => set({ activeSkinUrl }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'caeserclient-auth-storage',
      partialize: (state) => ({ accounts: state.accounts, activeAccountId: state.activeAccountId, theme: state.theme }),
    }
  )
);
