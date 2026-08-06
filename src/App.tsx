import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './index.css';
import Home from './Home';
import Profiles from './Profiles';
import Logs from './Logs';
import Skins from './Skins';

export interface Credentials {
  id: string;
  username: string;
  access_token: string;
  refresh_token: string;
  expires: string;
}

function SkinAvatar({ skinUrl, size = 32 }: { skinUrl: string | null, size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!skinUrl || !canvasRef.current) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = canvasRef.current!.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
    };
    img.src = skinUrl;
  }, [skinUrl, size]);

  if (!skinUrl) {
    return <div style={{ width: size, height: size, background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} className="profile-avatar" />;
  }

  return <canvas ref={canvasRef} width={size} height={size} className="profile-avatar" style={{ borderRadius: '4px', width: size, height: size }} />;
}

function Titlebar({ 
  accounts, 
  activeAccountId, 
  activeSkinUrl,
  onLogout, 
  onLogin, 
  onSelectAccount 
}: { 
  accounts: Credentials[], 
  activeAccountId: string | null,
  activeSkinUrl: string | null,
  onLogout: (id: string) => void, 
  onLogin: () => void,
  onSelectAccount: (id: string) => void
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      if (maximized) {
        document.body.classList.add('maximized');
      } else {
        document.body.classList.remove('maximized');
      }
    });
    return () => {
      unlisten.then(f => f());
    };
  }, [appWindow]);

  const activeCreds = accounts.find(a => a.id === activeAccountId) || null;

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        Caeser Client
      </div>
      <div className="titlebar-right">
        {activeCreds && (
          <div className="titlebar-profile" onClick={() => setDropdownOpen(!dropdownOpen)}>
            {activeSkinUrl ? (
              <SkinAvatar skinUrl={activeSkinUrl} size={32} />
            ) : (
              <img src={`https://minotar.net/helm/${activeCreds.id}/100.png`} alt="Avatar" className="profile-avatar" />
            )}
            <span className="profile-name">{activeCreds.username}</span>
            
            {dropdownOpen && (
              <div className="account-dropdown" onClick={(e) => e.stopPropagation()}>
                
                {accounts.map(acc => (
                  <div 
                    key={acc.id} 
                    className={`account-dropdown-item ${acc.id === activeAccountId ? 'active-account' : ''}`}
                    onClick={() => { onSelectAccount(acc.id); setDropdownOpen(false); }}
                  >
                    <img src={`https://minotar.net/helm/${acc.id}/100.png`} alt="Avatar" className="profile-avatar" style={{ width: '24px', height: '24px' }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.username}</span>
                    <button className="btn-icon-danger" onMouseDown={(e) => { e.stopPropagation(); setDeleteAccountId(acc.id); }} onClick={(e) => e.stopPropagation()} title="Remove Account">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                ))}

                <div className="account-dropdown-item" onMouseDown={(e) => { e.stopPropagation(); onLogin(); setDropdownOpen(false); }} onClick={(e) => e.stopPropagation()}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Account
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="window-controls">
          <button className="window-btn" onClick={() => invoke('minimize_window')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button className="window-btn" onClick={() => invoke('maximize_window')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
          </button>
          <button className="window-btn close" onClick={() => invoke('close_window')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      {deleteAccountId && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'var(--surface-color)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '30px',
            width: '400px',
            maxWidth: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
          }}>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '20px' }}>Account löschen</h2>
            <p style={{ color: '#94a3b8', margin: '0 0 25px 0' }}>Möchtest du diesen Account wirklich entfernen? Du musst dich danach erneut anmelden.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              <button 
                className="btn" 
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }} 
                onClick={() => setDeleteAccountId(null)}
              >
                Abbrechen
              </button>
              <button 
                className="btn" 
                style={{ background: 'var(--danger-color)' }} 
                onClick={() => {
                  onLogout(deleteAccountId);
                  if (accounts.length === 1) setDropdownOpen(false);
                  setDeleteAccountId(null);
                }}
              >
                Löschen
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function Sidebar({ activeView, onViewChange }: { activeView: string, onViewChange: (view: string) => void }) {
  return (
    <div className="sidebar">
      <div 
        className={`nav-item ${activeView === 'home' ? 'active' : ''}`}
        onClick={() => onViewChange('home')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        Home
      </div>
      <div 
        className={`nav-item ${activeView === 'profiles' ? 'active' : ''}`}
        onClick={() => onViewChange('profiles')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        Profile
      </div>
      <div 
        className={`nav-item ${activeView === 'skins' ? 'active' : ''}`}
        onClick={() => onViewChange('skins')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
        Skins
      </div>
    </div>
  );
}

function App() {
  const [accounts, setAccounts] = useState<Credentials[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState('home');
  const [resetTrigger, setResetTrigger] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeSkinUrl, setActiveSkinUrl] = useState<string | null>(null);

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

  const handleViewChange = (view: string) => {
    setActiveView(view);
    if (view === 'profiles') {
      setResetTrigger(prev => prev + 1);
    }
  };

  const isLogsWindow = window.location.search.includes('window=logs');
  
  if (isLogsWindow) {
    return <Logs />;
  }

  const activeCreds = accounts.find(a => a.id === activeAccountId) || null;

  useEffect(() => {
    const creds = accounts.find(a => a.id === activeAccountId);
    if (creds) {
      fetchActiveSkinUrl(creds);
    } else {
      setActiveSkinUrl(null);
    }
  }, [activeAccountId, accounts]);

  useEffect(() => {
    let isMounted = true;
    const fetchAccounts = () => {
      invoke('get_accounts').then((loaded: any) => {
        if (!isMounted) return;
        if (loaded) {
          setAccounts(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(loaded)) {
              return loaded;
            }
            return prev;
          });
        }
        setIsLoaded(true);
      }).catch((e) => {
        console.error(e);
        if (isMounted) setIsLoaded(true);
      });
    };

    fetchAccounts();
    const interval = setInterval(fetchAccounts, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (accounts.length > 0 && !activeAccountId) {
      setActiveAccountId(accounts[0].id);
    } else if (accounts.length === 0 && activeAccountId) {
      setActiveAccountId(null);
    }
  }, [accounts, activeAccountId]);

  useEffect(() => {
    if (isLoaded) {
      invoke('save_accounts', { accounts }).catch(console.error);
    }
  }, [accounts, isLoaded]);

  useEffect(() => {
    const unlistenSuccess = listen<Credentials>('login-success', (event) => {
      setAccounts(prev => {
        const exists = prev.findIndex(a => a.id === event.payload.id);
        if (exists >= 0) {
          const newAcc = [...prev];
          newAcc[exists] = event.payload;
          return newAcc;
        }
        return [...prev, event.payload];
      });
      setActiveAccountId(event.payload.id);
      setIsLoading(false);
    });

    const unlistenError = listen<string>('login-error', (event) => {
      alert(`Login failed: ${event.payload}`);
      setIsLoading(false);
    });

    return () => {
      unlistenSuccess.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, []);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await invoke('login');
    } catch (e) {
      console.error(e);
      alert(`Failed to start login: ${e}`);
      setIsLoading(false);
    }
  };

  const handleLogout = (id: string) => {
    setAccounts(prev => {
      const newAcc = prev.filter(a => a.id !== id);
      if (activeAccountId === id) {
        setActiveAccountId(newAcc.length > 0 ? newAcc[0].id : null);
      }
      return newAcc;
    });
  };

  if (!activeCreds) {
    return (
      <>
        <Titlebar 
          accounts={accounts} 
          activeAccountId={activeAccountId} 
          activeSkinUrl={activeSkinUrl}
          onLogout={handleLogout} 
          onLogin={handleLogin} 
          onSelectAccount={setActiveAccountId}
        />
        <div className="login-container">
          <div className="login-card glass-panel animate-fade-in">
            <h1 className="hero-title">Caeser Client</h1>
            <p>Login to continue</p>
            <button 
              className="btn" 
              onClick={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? 'Authenticating...' : 'Login with Microsoft'}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Titlebar 
        accounts={accounts} 
        activeAccountId={activeAccountId} 
        activeSkinUrl={activeSkinUrl}
        onLogout={handleLogout} 
        onLogin={handleLogin} 
        onSelectAccount={setActiveAccountId}
      />
      <div className="app-layout animate-fade-in">
        <Sidebar activeView={activeView} onViewChange={handleViewChange} />
        
        <div className="content-area" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {activeView === 'home' && <Home activeCreds={activeCreds} />}
          {activeView === 'profiles' && <Profiles activeCreds={activeCreds} resetTrigger={resetTrigger} />}
          {activeView === 'skins' && (
            <Skins 
              activeCreds={activeCreds} 
              onSkinChanged={() => {
                if (activeCreds) fetchActiveSkinUrl(activeCreds);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default App;
