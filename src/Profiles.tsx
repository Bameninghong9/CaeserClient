import { useState, useMemo, useEffect } from 'react';
import ProfileWizard from './ProfileWizard';
import ModBrowser, { ModData } from './ModBrowser';
import { invoke } from '@tauri-apps/api/core';
import { Credentials } from './App';

export interface Profile {
  id: string;
  name: string;
  version: string;
  loader: string;
  loaderVersion?: string;
  ram: number;
}

export default function Profiles({ activeCreds }: { activeCreds: Credentials | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [showModBrowser, setShowModBrowser] = useState(false);
  
  // State for installed mods (ID -> ModData)
  const [installedMods, setInstalledMods] = useState<Record<string, ModData>>({});
  const [downloadingMods, setDownloadingMods] = useState<Record<string, boolean>>({});

  const [isLaunching, setIsLaunching] = useState(false);

  // Load profiles on mount
  useEffect(() => {
    invoke<Profile[]>('get_profiles')
      .then(loadedProfiles => {
        setProfiles(loadedProfiles);
      })
      .catch(e => console.error("Failed to load profiles:", e));
  }, []);

  const handleCreateProfile = (profile: Profile) => {
    const updatedProfiles = [...profiles, profile];
    setProfiles(updatedProfiles);
    setShowWizard(false);
    
    // Save to backend
    invoke('save_profiles', { profiles: updatedProfiles })
      .catch(e => console.error("Failed to save profiles:", e));
  };

  const handlePlay = async () => {
    if (!activeProfile) return;
    setIsLaunching(true);

    try {
      await invoke('launch_game', {
        version: activeProfile.version,
        loader: activeProfile.loader || "vanilla",
        loaderVersion: activeProfile.loaderVersion || "0.16.2",
        profileName: activeProfile.name,
        creds: activeCreds
      });
      
    } catch (e) {
      console.error("Failed to launch game", e);
      alert("Fehler beim Starten: " + e);
    } finally {
      // Wait a bit before resetting to simulate game running, 
      // or we can keep it launching until the game exits.
      setTimeout(() => setIsLaunching(false), 3000); 
    }
  };

  const handleToggleInstall = async (mod: ModData) => {
    if (installedMods[mod.id]) {
      // Uninstall (for now just UI, backend logic can be added later)
      setInstalledMods(prev => {
        const next = { ...prev };
        delete next[mod.id];
        return next;
      });
      return;
    }

    if (!activeProfile) return;

    setDownloadingMods(prev => ({ ...prev, [mod.id]: true }));

    try {
      await invoke('install_mod', {
        modId: mod.id,
        platform: mod.platform,
        gameVersion: activeProfile.version,
        loader: activeProfile.loader,
        profileName: activeProfile.name
      });

      // Update installed state on success
      setInstalledMods(prev => ({ ...prev, [mod.id]: mod }));
    } catch (e) {
      console.error("Failed to install mod:", e);
      alert("Fehler beim Herunterladen der Mod: " + e);
    } finally {
      setDownloadingMods(prev => {
        const next = { ...prev };
        delete next[mod.id];
        return next;
      });
    }
  };

  const [localMods, setLocalMods] = useState<string[]>([]);

  useEffect(() => {
    if (activeProfile) {
      invoke('get_installed_mods', { profileName: activeProfile.name })
        .then((mods: any) => setLocalMods(mods || []))
        .catch(console.error);
    }
  }, [activeProfile]);

  const installedModsList = Object.values(installedMods);

  if (showWizard) {
    return (
      <div className="main-content">
        <ProfileWizard onComplete={handleCreateProfile} onCancel={() => setShowWizard(false)} />
      </div>
    );
  }

  if (activeProfile) {
    return (
      <div className="main-content" style={{ position: 'relative' }}>
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setActiveProfile(null)}>
          &larr; Zurück
        </button>
        <div className="profile-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2 className="profile-name-large">{activeProfile.name}</h2>
            <div className="profile-badges" style={{ marginTop: '10px' }}>
              <span className="badge">{activeProfile.version}</span>
              <span className="badge">{activeProfile.loader}</span>
              <span className="badge">{activeProfile.ram} GB RAM</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
            <button 
                className={`btn ${isLaunching ? 'launching' : ''}`}
                onClick={handlePlay}
                disabled={isLaunching}
            >
                {isLaunching ? 'Starte...' : 'Spielen'}
            </button>
            <button className="btn" onClick={() => setShowModBrowser(true)}>
              Mod hinzufügen
            </button>
          </div>
        </div>
        
        <div className="glass-panel" style={{ padding: '20px', marginTop: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <h3>Installierte Mods</h3>
          {installedModsList.length === 0 && localMods.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '10px' }}>Du hast noch keine Mods installiert.</p>
          ) : (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
              {installedModsList.map(mod => (
                <div key={mod.id} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  background: 'rgba(255,255,255,0.05)', 
                  padding: '8px 12px', 
                  borderRadius: '8px',
                  border: '1px solid var(--glass-border)'
                }}>
                  <img src={mod.icon} alt={mod.name} style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{mod.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{mod.author}</div>
                  </div>
                </div>
              ))}
              {localMods.filter(lm => !installedModsList.find(im => lm.includes(im.name) || lm.includes(im.id))).map((fileName, idx) => (
                <div key={`local-${idx}`} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  background: 'rgba(255,255,255,0.05)', 
                  padding: '8px 12px', 
                  borderRadius: '8px',
                  border: '1px solid var(--glass-border)'
                }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    📦
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{fileName}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Lokale Datei</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showModBrowser && (
          <ModBrowser 
            onClose={() => setShowModBrowser(false)} 
            installedMods={installedMods}
            downloadingMods={downloadingMods}
            onToggleInstall={handleToggleInstall}
          />
        )}
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="profile-header">
        <h1 className="hero-title">Profile</h1>
        <button className="btn" onClick={() => setShowWizard(true)}>
          Profil erstellen
        </button>
      </div>
      
      <div className="version-grid" style={{ marginTop: '20px' }}>
        {profiles.length === 0 && <p>Keine Profile vorhanden. Erstelle eins!</p>}
        {profiles.map(p => (
          <div key={p.id} className="profile-card" onClick={() => setActiveProfile(p)}>
            <h3>{p.name}</h3>
            <div className="profile-badges">
              <span className="badge">{p.version}</span>
              <span className="badge">{p.loader}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
