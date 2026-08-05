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
        modInfo: mod,
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
  const [modToDelete, setModToDelete] = useState<{ fileName: string, modId?: string } | null>(null);

  const loadProfileData = async () => {
    if (activeProfile) {
      try {
        const res: any = await invoke('get_installed_mods', { profileName: activeProfile.name });
        if (res && res.rich_mods) {
          const modsObj: Record<string, ModData> = {};
          res.rich_mods.forEach((m: ModData) => {
            modsObj[m.id] = m;
          });
          setInstalledMods(modsObj);
        } else {
          setInstalledMods({});
        }
        if (res && res.local_files) {
          setLocalMods(res.local_files);
        } else {
          setLocalMods([]);
        }
      } catch (e) {
        console.error('Failed to load installed mods', e);
      }
    }
  };

  useEffect(() => {
    loadProfileData();
  }, [activeProfile]);

  const toggleMod = async (fileName: string, disable: boolean) => {
    try {
      await invoke('toggle_mod_file', { profileName: activeProfile?.name || '', fileName, disable });
      loadProfileData();
    } catch (e) {
      console.error('Failed to toggle mod', e);
    }
  };

  const deleteMod = (fileName: string, modId?: string) => {
    setModToDelete({ fileName, modId });
  };

  const confirmDeleteMod = async () => {
    if (!modToDelete) return;
    try {
      await invoke('delete_mod_file', { profileName: activeProfile?.name || '', fileName: modToDelete.fileName, modId: modToDelete.modId });
      loadProfileData();
    } catch (e) {
      console.error('Failed to delete mod', e);
    } finally {
      setModToDelete(null);
    }
  };

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
        
        <div style={{ padding: '0 20px', marginTop: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '16px' }}>Installierte Mods</h3>
          {installedModsList.length === 0 && localMods.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.7)' }}>Du hast noch keine Mods installiert.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {installedModsList.map(mod => {
                let displayVersion = mod.version;
                let isDisabled = false;
                if (!displayVersion) {
                  const normalizedName = mod.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const localFile = localMods.find(lm => {
                    const lmNorm = lm.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return lmNorm.includes(normalizedName) || lm.includes(mod.id);
                  });
                  if (localFile) {
                    isDisabled = localFile.endsWith('.disabled');
                    const cleanName = localFile.replace(/\.jar(\.disabled)?$/, '');
                    const parts = cleanName.split('-');
                    if (parts.length > 1) {
                      displayVersion = parts.slice(1).join('-');
                    } else {
                      displayVersion = cleanName;
                    }
                  }
                } else {
                  const normalizedName = mod.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const localFile = localMods.find(lm => {
                    const lmNorm = lm.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return lmNorm.includes(normalizedName) || lm.includes(mod.id);
                  });
                  if (localFile) {
                    isDisabled = localFile.endsWith('.disabled');
                  }
                }
                
                const matchedFile = localMods.find(lm => {
                    const lmNorm = lm.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return lmNorm.includes(mod.name.toLowerCase().replace(/[^a-z0-9]/g, '')) || lm.includes(mod.id);
                });
                
                return (
                <div key={mod.id} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '12px 16px', 
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '12px',
                  background: 'rgba(10, 10, 15, 0.4)',
                  opacity: isDisabled ? 0.5 : 1,
                  filter: isDisabled ? 'grayscale(100%)' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {mod.icon ? (
                      <img src={mod.icon} alt={mod.name} style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }} />
                    ) : (
                      <div style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', fontWeight: 'bold', fontSize: '10px', textAlign: 'center', lineHeight: '1.2' }}>
                        MOD
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '15px', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{mod.name}</div>
                      <div style={{ fontSize: '12px', color: '#a0aec0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {displayVersion || 'Unbekannt'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div 
                      onClick={() => { if(matchedFile) deleteMod(matchedFile, mod.id) }} 
                      style={{ cursor: 'pointer', color: '#f56565', padding: '4px', display: 'flex' }}
                      title="Mod löschen"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </div>
                    <div 
                      onClick={() => { if(matchedFile) toggleMod(matchedFile, !isDisabled) }}
                      style={{ cursor: 'pointer', width: '36px', height: '18px', background: isDisabled ? 'rgba(255,255,255,0.1)' : '#3182ce', display: 'flex', alignItems: 'center', justifyContent: isDisabled ? 'flex-start' : 'flex-end', padding: '2px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box' }}
                    >
                      <div style={{ width: '12px', height: '12px', background: isDisabled ? 'rgba(255,255,255,0.4)' : 'white' }}></div>
                    </div>
                  </div>
                </div>
              )})}
              {localMods.filter(lm => !installedModsList.find(im => lm.includes(im.name.replace(/ /g, '')) || lm.includes(im.id))).map((fileName, idx) => {
                const isDisabled = fileName.endsWith('.disabled');
                const cleanFileName = fileName.replace(/\.disabled$/, '');
                return (
                <div key={`local-${idx}`} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '12px 16px', 
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '12px',
                  background: 'rgba(10, 10, 15, 0.4)',
                  opacity: isDisabled ? 0.5 : 1,
                  filter: isDisabled ? 'grayscale(100%)' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', fontWeight: 'bold', fontSize: '10px', textAlign: 'center', lineHeight: '1.2' }}>
                      LOKAL<br/>MOD
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '15px', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{cleanFileName}</div>
                      <div style={{ fontSize: '12px', color: '#a0aec0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Lokale Datei
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div 
                      onClick={() => deleteMod(fileName)} 
                      style={{ cursor: 'pointer', color: '#f56565', padding: '4px', display: 'flex' }}
                      title="Mod löschen"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </div>
                    <div 
                      onClick={() => toggleMod(fileName, !isDisabled)}
                      style={{ cursor: 'pointer', width: '36px', height: '18px', background: isDisabled ? 'rgba(255,255,255,0.1)' : '#3182ce', display: 'flex', alignItems: 'center', justifyContent: isDisabled ? 'flex-start' : 'flex-end', padding: '2px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box' }}
                    >
                      <div style={{ width: '12px', height: '12px', background: isDisabled ? 'rgba(255,255,255,0.4)' : 'white' }}></div>
                    </div>
                  </div>
                </div>
              )})}
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
        
        {modToDelete && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: '#1a202c',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'white' }}>Mod löschen</h3>
              <p style={{ margin: 0, color: '#a0aec0', fontSize: '14px', lineHeight: '1.5' }}>
                Bist du sicher, dass du die Mod <strong style={{ color: 'white' }}>{modToDelete.fileName}</strong> wirklich löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button 
                  onClick={() => setModToDelete(null)}
                  style={{
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white',
                    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Abbrechen
                </button>
                <button 
                  onClick={confirmDeleteMod}
                  style={{
                    background: '#f56565', border: 'none', color: 'white',
                    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#e53e3e'}
                  onMouseOut={(e) => e.currentTarget.style.background = '#f56565'}
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
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
