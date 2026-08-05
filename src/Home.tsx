import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Credentials } from './App';
import { Profile } from './Profiles';

export default function Home({ activeCreds }: { activeCreds: Credentials | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [launching, setLaunching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    invoke<Profile[]>('get_profiles')
      .then(p => {
        setProfiles(p);
        if (p.length > 0) {
          setSelectedProfileId(p[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const handlePlay = async () => {
    const selectedProfile = profiles.find(p => p.id === selectedProfileId);
    if (!selectedProfile) return;
    
    setLaunching(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 90) return 90;
        return p + 5;
      });
    }, 100);

    try {
      await invoke('launch_game', { 
        version: selectedProfile.version, 
        loader: selectedProfile.loader || "vanilla",
        loaderVersion: selectedProfile.loaderVersion || "",
        profileName: selectedProfile.name,
        creds: activeCreds 
      });
      setProgress(100);
      setTimeout(() => setProgress(0), 500);
    } catch (e) {
      console.error(e);
      alert(`Failed to launch game: ${e}`);
      setProgress(0);
    } finally {
      clearInterval(interval);
      setLaunching(false);
    }
  };

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  return (
    <div className="main-content">
      <h1 className="hero-title">Caeser Client</h1>
      
      <div style={{ flex: 1 }}></div>
      
      <div className="play-section" style={{ position: 'relative', display: 'flex', gap: '10px', alignItems: 'flex-end', paddingBottom: '40px' }}>
        <div style={{ position: 'relative' }}>
          <button 
            className="btn" 
            style={{ 
              height: '60px', 
              padding: '0 20px', 
              background: '#2d3748', 
              border: '1px solid #4a5568',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={launching}
          >
            <div style={{ textAlign: 'left', minWidth: '150px' }}>
              <div style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Profil</div>
              <div style={{ fontWeight: 'bold' }}>{selectedProfile ? selectedProfile.name : 'Kein Profil'}</div>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          
          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              width: '100%',
              marginBottom: '10px',
              background: '#1a202c',
              border: '1px solid #4a5568',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 -4px 15px rgba(0,0,0,0.5)',
              zIndex: 100
            }}>
              {profiles.length === 0 ? (
                <div style={{ padding: '15px', color: '#a0aec0', fontSize: '0.9rem' }}>Keine Profile erstellt</div>
              ) : (
                profiles.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => {
                      setSelectedProfileId(p.id);
                      setDropdownOpen(false);
                    }}
                    style={{
                      padding: '12px 15px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #2d3748',
                      background: selectedProfileId === p.id ? '#2d3748' : 'transparent',
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>{p.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{p.loader} {p.version}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        
        <button 
          className="btn play-btn" 
          onClick={handlePlay}
          disabled={launching || !selectedProfile}
          style={{ height: '60px', flex: 1, position: 'relative', overflow: 'hidden' }}
        >
          <div className="play-btn-progress" style={{ width: `${progress}%`, background: 'rgba(255,255,255,0.2)', position: 'absolute', left: 0, top: 0, height: '100%', transition: 'width 0.2s' }}></div>
          <span className="play-btn-content" style={{ position: 'relative', zIndex: 1 }}>{launching ? 'Wird gestartet...' : 'SPIELEN'}</span>
        </button>
      </div>
    </div>
  );
}
