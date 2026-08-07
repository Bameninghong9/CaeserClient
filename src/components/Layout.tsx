import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast, Toaster } from 'sonner';

import { useAppStore, Credentials } from '../store';
import Titlebar from './Titlebar';
import Sidebar from './Sidebar';

export default function Layout() {
  const { 
    accounts, 
    activeAccountId, 
    setAccounts, 
    setActiveAccountId, 
    setActiveSkinUrl,
    setRunningInstances 
  } = useAppStore();

  const activeCreds = accounts.find((a: Credentials) => a.id === activeAccountId) || null;

  const fetchActiveSkinUrl = async (creds: Credentials) => {
    try {
      const data: any = await invoke('get_user_skin_data', { accessToken: creds.access_token });
      if (data.skins && data.skins.length > 0) {
        const activeSkin = data.skins.find((s: any) => s.state === 'ACTIVE') || data.skins[0];
        if (activeSkin && activeSkin.url) {
          setActiveSkinUrl(activeSkin.url);
          return;
        }
      }
    } catch(e) {
      console.error("Failed to fetch skin url", e);
    }
    setActiveSkinUrl(null);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      invoke('show_window').catch(console.error);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unlistenStart = listen('instance-started', () => {
      setRunningInstances(useAppStore.getState().runningInstances + 1);
    });
    const unlistenStop = listen('instance-stopped', () => {
      setRunningInstances(Math.max(0, useAppStore.getState().runningInstances - 1));
    });
    return () => {
      unlistenStart.then(f => f());
      unlistenStop.then(f => f());
    };
  }, [setRunningInstances]);

  useEffect(() => {
    if (activeCreds) {
      fetchActiveSkinUrl(activeCreds);
    } else {
      setActiveSkinUrl(null);
    }
  }, [activeAccountId, accounts, setActiveSkinUrl]);

  useEffect(() => {
    let isMounted = true;
    const fetchAccounts = () => {
      invoke('get_accounts').then((loaded: any) => {
        if (!isMounted) return;
        if (loaded) {
          if (JSON.stringify(useAppStore.getState().accounts) !== JSON.stringify(loaded)) {
            setAccounts(loaded);
          }
        }
      }).catch(console.error);
    };

    fetchAccounts();
    const interval = setInterval(fetchAccounts, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [setAccounts]);

  useEffect(() => {
    if (accounts.length > 0 && !activeAccountId) {
      setActiveAccountId(accounts[0].id);
    } else if (accounts.length === 0 && activeAccountId) {
      setActiveAccountId(null);
    }
  }, [accounts, activeAccountId, setActiveAccountId]);

  useEffect(() => {
    invoke('save_accounts', { accounts }).catch(console.error);
  }, [accounts]);

  useEffect(() => {
    const unlistenSuccess = listen<Credentials>('login-success', (event) => {
      const currentAccounts = useAppStore.getState().accounts;
      const exists = currentAccounts.findIndex((a: Credentials) => a.id === event.payload.id);
      if (exists >= 0) {
        const newAcc = [...currentAccounts];
        newAcc[exists] = event.payload;
        setAccounts(newAcc);
      } else {
        setAccounts([...currentAccounts, event.payload]);
      }
      setActiveAccountId(event.payload.id);
      toast.success('Erfolgreich angemeldet');
    });

    const unlistenError = listen<string>('login-error', (event) => {
      toast.error(`Login fehlgeschlagen: ${event.payload}`);
    });

    return () => {
      unlistenSuccess.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [setAccounts, setActiveAccountId]);

  const handleLogin = async () => {
    try {
      await invoke('login');
    } catch (e) {
      console.error(e);
      toast.error(`Login-Fehler: ${e}`);
    }
  };

  const handleLogout = (id: string) => {
    const newAcc = accounts.filter((a: Credentials) => a.id !== id);
    setAccounts(newAcc);
    if (activeAccountId === id) {
      setActiveAccountId(newAcc.length > 0 ? newAcc[0].id : null);
    }
    toast.success('Account entfernt');
  };

  const handleOpenLogs = () => {
    invoke('open_log_window').catch(console.error);
  };

  if (!activeCreds) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <Toaster theme="dark" position="bottom-right" />
        <Titlebar onLogout={handleLogout} onLogin={handleLogin} onOpenLogs={handleOpenLogs} />
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-10 animate-in fade-in duration-500">
          <div className="bg-glass-bg backdrop-blur-3xl border border-glass-border p-10 rounded-2xl flex flex-col items-center gap-5 text-center shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent m-0 pb-5">
              Caeser Client
            </h1>
            <p className="text-slate-300">Login to continue</p>
            <button 
              className="bg-accent-gradient hover:bg-accent-gradient-hover text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-accent/40 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
              onClick={handleLogin}
            >
              Login with Microsoft
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background bg-[radial-gradient(circle_at_15%_50%,rgba(37,99,235,0.04)_0%,transparent_50%),radial-gradient(circle_at_85%_30%,rgba(59,130,246,0.04)_0%,transparent_50%)] text-white select-none">
      <Toaster theme="dark" position="bottom-right" />
      <Titlebar onLogout={handleLogout} onLogin={handleLogin} onOpenLogs={handleOpenLogs} />
      <div className="flex flex-1 overflow-hidden animate-in fade-in duration-500">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-y-auto">
          <Outlet context={{ activeCreds }} />
        </div>
      </div>
    </div>
  );
}
