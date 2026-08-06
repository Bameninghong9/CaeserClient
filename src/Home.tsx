import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

import { Credentials } from './App';
import { Profile } from './Profiles';

export default function Home({ activeCreds }: { activeCreds: Credentials | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [launching, setLaunching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      invoke<Profile[]>('get_profiles'),
      invoke<{ last_played_profile: string | null }>('get_settings')
    ])
      .then(([p, settings]) => {
        setProfiles(p);
        if (settings.last_played_profile && p.find(x => x.id === settings.last_played_profile)) {
          setSelectedProfileId(settings.last_played_profile);
        } else if (p.length > 0) {
          setSelectedProfileId(p[0].id);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedProfileId) {
      invoke('save_settings', { settings: { last_played_profile: selectedProfileId } }).catch(console.error);
    }
  }, [selectedProfileId]);

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
        loaderVersion: selectedProfile.loader_version || "",
        profileName: selectedProfile.name,
        ram: selectedProfile.ram || 2048,
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
      
      <div className="play-section" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '40px', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
        <div style={{ display: 'flex', width: '100%', height: '80px', background: '#0a1930', border: '2px solid #2b5585', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
          
          <button 
            className="btn play-btn" 
            onClick={handlePlay}
            disabled={launching || !selectedProfile}
            style={{ 
              flex: 1, 
              position: 'relative', 
              background: 'transparent',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '0',
              cursor: (launching || !selectedProfile) ? 'not-allowed' : 'pointer'
            }}
          >
            <div className="play-btn-progress" style={{ width: `${progress}%`, background: 'rgba(255,255,255,0.1)', position: 'absolute', left: 0, top: 0, height: '100%', transition: 'width 0.2s' }}></div>
            <span style={{ position: 'relative', zIndex: 1, fontSize: '24px', fontWeight: 'bold', color: 'white', letterSpacing: '2px' }}>
              {launching ? 'LAUNCHING' : 'LAUNCH'}
            </span>
            <span style={{ position: 'relative', zIndex: 1, fontSize: '14px', color: '#e2e8f0', marginTop: '2px' }}>
              {selectedProfile ? selectedProfile.name : 'Kein Profil ausgewählt'}
            </span>
          </button>
          
          <div style={{ width: '2px', background: '#2b5585', height: '100%' }}></div>
          
          <button 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={launching}
            style={{ 
              width: '60px', 
              background: 'transparent', 
              border: 'none', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              cursor: launching ? 'not-allowed' : 'pointer',
              color: 'white'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </button>
          
        </div>
        
        <div style={{ position: 'relative', width: '100%' }}>
          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '5px',
              left: 0,
              width: '100%',
              background: '#0a1930',
              border: '1px solid #2b5585',
              borderRadius: '4px',
              overflow: 'hidden',
              boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
              zIndex: 100
            }}>
              {profiles.length === 0 ? (
                <div style={{ padding: '15px', color: '#a0aec0', fontSize: '0.9rem', textAlign: 'center' }}>Keine Profile erstellt</div>
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
                      borderBottom: '1px solid #1a2c4e',
                      background: selectedProfileId === p.id ? '#1a2c4e' : 'transparent',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', color: 'white' }}>{p.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{p.loader} {p.version}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
