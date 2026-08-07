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
    <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={{ flex: 1 }}></div>
      
      <div className="play-section" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '50px', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
        <div style={{ 
          display: 'flex', 
          width: '100%', 
          height: '85px', 
          background: 'var(--surface-color)', 
          border: '1px solid var(--glass-border)', 
          borderRadius: '12px', 
          overflow: 'hidden', 
          position: 'relative',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}>
          
          <button 
            className="btn play-btn" 
            onClick={handlePlay}
            disabled={launching || !selectedProfile}
            style={{ 
              flex: 1, 
              position: 'relative', 
              background: launching || !selectedProfile ? '#1e293b' : 'var(--accent-gradient)',
              border: 'none',
              borderRadius: '0',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '0',
              cursor: (launching || !selectedProfile) ? 'not-allowed' : 'pointer',
              boxShadow: 'none',
              transition: 'all 0.3s ease'
            }}
          >
            <div className="play-btn-progress" style={{ width: `${progress}%`, background: 'rgba(255,255,255,0.2)', position: 'absolute', left: 0, top: 0, height: '100%', transition: 'width 0.2s ease-out' }}></div>
            <span style={{ position: 'relative', zIndex: 1, fontSize: '26px', fontWeight: '800', color: 'white', letterSpacing: '3px', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
              {launching ? 'LAUNCHING' : 'LAUNCH'}
            </span>
            <span style={{ position: 'relative', zIndex: 1, fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginTop: '4px', fontWeight: '500' }}>
              {selectedProfile ? selectedProfile.name : 'Kein Profil ausgewählt'}
            </span>
          </button>
          
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', height: '100%', zIndex: 2 }}></div>
          
          <button 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={launching}
            style={{ 
              width: '65px', 
              background: launching ? '#1e293b' : 'var(--accent-gradient)',
              border: 'none', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              cursor: launching ? 'not-allowed' : 'pointer',
              color: 'white',
              transition: 'background 0.3s ease'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}>
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
