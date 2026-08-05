import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './index.css';
import Home from './Home';
import Profiles from './Profiles';
import Settings from './Settings';
import Logs from './Logs';

export interface Credentials {
  id: string;
  username: string;
  access_token: string;
  refresh_token: string;
  expires: string;
}

function Titlebar({ 
  accounts, 
  activeAccountId, 
  onLogout, 
  onLogin, 
  onSelectAccount 
}: { 
  accounts: Credentials[], 
  activeAccountId: string | null,
  onLogout: (id: string) => void, 
  onLogin: () => void,
  onSelectAccount: (id: string) => void
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
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
            <img src={`https://minotar.net/helm/${activeCreds.username}/100.png`} alt="Avatar" className="profile-avatar" />
            <span className="profile-name">{activeCreds.username}</span>
            
            {dropdownOpen && (
              <div className="account-dropdown" onClick={(e) => e.stopPropagation()}>
                
                {accounts.map(acc => (
                  <div 
                    key={acc.id} 
                    className={`account-dropdown-item ${acc.id === activeAccountId ? 'active-account' : ''}`}
                    onClick={() => { onSelectAccount(acc.id); setDropdownOpen(false); }}
                  >
                    <img src={`https://minotar.net/helm/${acc.username}/100.png`} alt="Avatar" className="profile-avatar" style={{ width: '24px', height: '24px' }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.username}</span>
                    <button className="btn-icon-danger" onMouseDown={(e) => { e.stopPropagation(); onLogout(acc.id); if(accounts.length === 1) setDropdownOpen(false); }} onClick={(e) => e.stopPropagation()} title="Remove Account">
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
    </div>
  );
}

function App() {
  const [accounts, setAccounts] = useState<Credentials[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState('home');
  const [isLoaded, setIsLoaded] = useState(false);

  const isLogsWindow = window.location.search.includes('window=logs');
  
  if (isLogsWindow) {
    return <Logs />;
  }

  const activeCreds = accounts.find(a => a.id === activeAccountId) || null;

  useEffect(() => {
    invoke('get_accounts').then((loaded: any) => {
      if (loaded && loaded.length > 0) {
        setAccounts(loaded);
        setActiveAccountId(loaded[0].id);
      }
      setIsLoaded(true);
    }).catch((e) => {
      console.error(e);
      setIsLoaded(true);
    });
  }, []);

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
        onLogout={handleLogout} 
        onLogin={handleLogin} 
        onSelectAccount={setActiveAccountId}
      />
      <div className="app-layout animate-fade-in">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        {activeView === 'home' && <Home activeCreds={activeCreds} />}
        {activeView === 'profiles' && <Profiles activeCreds={activeCreds} />}
      </div>
    </>
  );
}

export default App;
