import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export interface Credentials {
  id: string;
  username: string;
  access_token: string;
  refresh_token: string;
  expires: string;
}

interface AppState {
  accounts: Credentials[];
  activeAccountId: string | null;
  runningInstances: number;
  activeSkinUrl: string | null;
  setAccounts: (accounts: Credentials[]) => void;
  setActiveAccountId: (id: string | null) => void;
  setRunningInstances: (count: number) => void;
  setActiveSkinUrl: (url: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      accounts: [],
      activeAccountId: null,
      runningInstances: 0,
      activeSkinUrl: null,
      setAccounts: (accounts) => set({ accounts }),
      setActiveAccountId: (activeAccountId) => set({ activeAccountId }),
      setRunningInstances: (runningInstances) => set({ runningInstances }),
      setActiveSkinUrl: (activeSkinUrl) => set({ activeSkinUrl }),
    }),
    {
      name: 'caeserclient-auth-storage',
      partialize: (state) => ({ accounts: state.accounts, activeAccountId: state.activeAccountId }),
    }
  )
);
