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
  const [searchQuery, setSearchQuery] = useState('');
  
  // State for installed mods (ID -> ModData)
  const [installedMods, setInstalledMods] = useState<Record<string, ModData>>({});
  const [downloadingMods, setDownloadingMods] = useState<Record<string, boolean>>({});

  const [isLaunching, setIsLaunching] = useState(false);
  const [cachedVersions, setCachedVersions] = useState<string[]>([]);

  // Load profiles and versions on mount
  useEffect(() => {
    invoke<Profile[]>('get_profiles')
      .then(loadedProfiles => {
        setProfiles(loadedProfiles);
      })
      .catch(e => console.error("Failed to load profiles:", e));

    invoke<string[]>('get_versions')
      .then(v => {
        let filtered = v.filter(ver => !ver.includes('w') && !ver.includes('pre') && !ver.includes('rc') && !ver.includes('Alpha') && !ver.includes('Beta'));
        filtered.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
        setCachedVersions(filtered);
      })
      .catch(e => console.error("Failed to preload versions:", e));
  }, []);

  const handleCreateProfile = (profile: Profile) => {
    const updatedProfiles = [...profiles, profile];
    setProfiles(updatedProfiles);
    setShowWizard(false);
    
    // Save to backend
    invoke('save_profiles', { profiles: updatedProfiles })
      .catch(e => console.error("Failed to save profiles:", e));
  };

  const handleDeleteProfile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Möchtest du dieses Profil wirklich löschen?')) return;
    
    const updatedProfiles = profiles.filter(p => p.id !== id);
    setProfiles(updatedProfiles);
    invoke('save_profiles', { profiles: updatedProfiles })
      .catch(e => console.error("Failed to delete profile:", e));
  };

  const launchProfile = async (profile: Profile) => {
    setIsLaunching(true);
    try {
      await invoke('launch_game', {
        version: profile.version,
        loader: profile.loader || "vanilla",
        loaderVersion: profile.loaderVersion || "0.16.2",
        profileName: profile.name,
        ram: profile.ram || 2,
        creds: activeCreds
      });
    } catch (e) {
      console.error("Failed to launch game", e);
      alert("Fehler beim Starten: " + e);
    } finally {
      setTimeout(() => setIsLaunching(false), 3000); 
    }
  };

  const handlePlay = async () => {
    if (!activeProfile) return;
    return launchProfile(activeProfile);
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
              <span className="badge">{activeProfile.ram > 128 ? (activeProfile.ram / 1024).toFixed(1).replace('.0', '') : activeProfile.ram} GB RAM</span>
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

  const filteredProfiles = profiles.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="main-content">
      <div className="profile-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            className="input"
            placeholder="Profile durchsuchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '14px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', width: '250px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            IMPORTIEREN
          </button>
          <button className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }} onClick={() => setShowWizard(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            ERSTELLEN
          </button>
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {profiles.length === 0 && <p style={{ color: '#94a3b8' }}>Keine Profile vorhanden. Erstelle eins!</p>}
        {profiles.length > 0 && filteredProfiles.length === 0 && <p style={{ color: '#94a3b8' }}>Kein Profil mit diesem Namen gefunden.</p>}
        {filteredProfiles.map(p => (
          <div 
            key={p.id} 
            onClick={() => setActiveProfile(p)} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '16px 20px', 
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ 
                width: '48px', height: '48px', 
                background: 'rgba(59, 130, 246, 0.1)', 
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '8px', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#3b82f6'
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>{p.name}</h3>
                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#94a3b8', alignItems: 'center' }}>
                  <span>{p.version}</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <span>{p.loader}</span>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                className="btn"
                onClick={(e) => {
                  e.stopPropagation();
                  launchProfile(p);
                }}
                style={{ background: 'transparent', border: '1px solid rgba(59, 130, 246, 0.5)', padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'white', textTransform: 'uppercase', letterSpacing: '1px' }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                  e.currentTarget.style.borderColor = '#3b82f6';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                SPIELEN
              </button>

              <button
                className="btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveProfile(p);
                  setShowModBrowser(true);
                }}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'white', textTransform: 'uppercase', letterSpacing: '1px' }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                MODS
              </button>
              
              <button
                onClick={(e) => handleDeleteProfile(e, p.id)}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#f56565',
                  cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '4px', transition: 'all 0.2s', height: '34px', width: '34px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(245, 101, 101, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(245, 101, 101, 0.3)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
                title="Profil löschen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {showWizard && (
        <div className="custom-modal-overlay">
          <ProfileWizard cachedVersions={cachedVersions} onComplete={handleCreateProfile} onCancel={() => setShowWizard(false)} />
        </div>
      )}
    </div>
  );
}
