import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ProfileWizard from './ProfileWizard';
import ModBrowser, { ModData } from './ModBrowser';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Credentials } from './store';
import { useOutletContext, useLocation } from 'react-router-dom';

export interface Profile {
  id: string;
  name: string;
  version: string;
  loader: string;
  loader_version?: string;
  ram: number;
}

export interface DependencyInfo {
  id: string;
  platform: string;
}

export default function Profiles() {
  const { activeCreds } = useOutletContext<{ activeCreds: Credentials | null }>();
  const location = useLocation();
  const resetTrigger = location.key;
  
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  
  // State for installed mods (ID -> ModData)
  const [installedMods, setInstalledMods] = useState<Record<string, ModData>>({});
  const [downloadingMods, setDownloadingMods] = useState<Record<string, boolean | number>>({});

  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);

  const [modBrowserType, setModBrowserType] = useState<'mod' | 'resourcepack' | 'shader' | null>(null);
  const [cachedVersions, setCachedVersions] = useState<string[]>([]);
  
  // New States for Profile Content View
  const [activeTab, setActiveTab] = useState<'mods' | 'resourcepacks' | 'shaderpacks' | 'caeserclient'>('mods');
  const [contentSearchQuery, setContentSearchQuery] = useState('');
  
  const [availableUpdates, setAvailableUpdates] = useState<Record<string, string>>({});
  const [installingMods, setInstallingMods] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (resetTrigger !== undefined) {
      setActiveProfile(null);
      setModBrowserType(null);
    }
  }, [resetTrigger]);

  useEffect(() => {
    const unlisten = listen<{ id: string, progress: number }>('download-progress', (event) => {
      setDownloadingMods(prev => ({
        ...prev,
        [event.payload.id]: event.payload.progress
      }));
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

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
    setDeleteProfileId(id);
  };

  const launchProfile = async (profile: Profile) => {
    setIsLaunching(true);
    try {
      await invoke('launch_game', {
        version: profile.version,
        loader: profile.loader || "vanilla",
        loaderVersion: profile.loader_version || "0.16.2",
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

  const installDependency = async (dep: DependencyInfo, gameVersion: string, loader: string, profileName: string) => {
    // Check if already installed
    if (installedMods[dep.id]) return;
    
    let modData: ModData | null = null;
    
    if (dep.platform === 'modrinth') {
      try {
        const res = await fetch(`https://api.modrinth.com/v2/project/${dep.id}`);
        const data = await res.json();
        modData = {
          id: data.id,
          name: data.title,
          author: "Unknown",
          summary: data.description,
          icon: data.icon_url || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + data.id,
          platform: 'modrinth',
          itemType: 'mod'
        };
      } catch (e) { console.error(e); }
    } else if (dep.platform === 'curseforge') {
      try {
        const res = await fetch(`https://api.curse.tools/v1/cf/mods/${dep.id}`);
        const data = (await res.json()).data;
        modData = {
          id: data.id.toString(),
          name: data.name,
          author: data.authors && data.authors.length > 0 ? data.authors[0].name : 'Unknown',
          summary: data.summary,
          icon: (data.logo && data.logo.thumbnailUrl) ? data.logo.thumbnailUrl : 'https://api.dicebear.com/7.x/identicon/svg?seed=' + data.id,
          platform: 'curseforge',
          itemType: 'mod'
        };
      } catch (e) { console.error(e); }
    }

    if (modData) {
      setDownloadingMods(prev => ({ ...prev, [modData!.id]: true }));
      try {
        const deps = await invoke<DependencyInfo[]>('install_mod', {
          modInfo: modData,
          gameVersion,
          loader,
          profileName
        });
        
        setInstalledMods(prev => ({ ...prev, [modData!.id]: modData! }));
        loadProfileData();
        
        if (deps && deps.length > 0) {
          for (const childDep of deps) {
            await installDependency(childDep, gameVersion, loader, profileName);
          }
        }
      } catch (e) {
        console.error("Failed to install dependency", e);
      } finally {
        setDownloadingMods(prev => {
          const next = { ...prev };
          delete next[modData!.id];
          return next;
        });
      }
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
      const deps = await invoke<DependencyInfo[]>('install_mod', {
        modInfo: mod,
        gameVersion: activeProfile.version,
        loader: activeProfile.loader,
        profileName: activeProfile.name
      });

      // Update installed state on success
      setInstalledMods(prev => ({ ...prev, [mod.id]: mod }));
      loadProfileData();
      
      if (deps && deps.length > 0) {
        for (const dep of deps) {
          if (!installedMods[dep.id]) {
            await installDependency(dep, activeProfile.version, activeProfile.loader, activeProfile.name);
          }
        }
      }
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
  const [modToDelete, setModToDelete] = useState<{ fileName: string, modId?: string, itemType?: string } | null>(null);

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
          
          // Check for updates
          const updates: Record<string, string> = {};
          await Promise.all(res.rich_mods.map(async (mod: ModData) => {
            if (!mod.platform) return;
            try {
              const newVersion = await invoke<string | null>('check_mod_update', {
                modInfo: mod,
                gameVersion: activeProfile.version,
                loader: activeProfile.loader
              });
              if (newVersion) updates[mod.id] = newVersion;
            } catch (e) { console.error("Check update fail:", e); }
          }));
          setAvailableUpdates(updates);
          
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

  const handleUpdateMod = async (mod: ModData) => {
    if (!activeProfile) return;
    try {
        setInstallingMods(prev => new Set(prev).add(mod.id));
        setDownloadingMods(prev => ({ ...prev, [mod.id]: true }));
        
        // Find local filename
        let oldFileName = mod.id; // Fallback
        const res: any = await invoke('get_installed_mods', { profileName: activeProfile.name });
        if (res && res.local_files) {
            for (const f of res.local_files) {
                if (f.includes(mod.name.replace(/ /g, '')) || f.includes(mod.id)) {
                    oldFileName = f.includes('::') ? f.split('::')[1] : f;
                    break;
                }
            }
        }
        
        // Delete old file
        await invoke('delete_mod_file', { profileName: activeProfile.name, fileName: oldFileName, modId: mod.id, itemType: mod.itemType });
        
        // Install new file
        const deps = await invoke<DependencyInfo[]>('install_mod', {
            modInfo: mod,
            gameVersion: activeProfile.version,
            loader: activeProfile.loader,
            profileName: activeProfile.name
        });
        
        for (const dep of deps) {
            if (!installedMods[dep.id]) {
                await installDependency(dep, activeProfile.version, activeProfile.loader, activeProfile.name);
            }
        }
        
        setAvailableUpdates(prev => {
            const next = {...prev};
            delete next[mod.id];
            return next;
        });
        
        loadProfileData();
    } catch (e) {
        console.error("Update failed", e);
        alert("Fehler beim Updaten der Mod: " + e);
    } finally {
        setInstallingMods(prev => {
            const next = new Set(prev);
            next.delete(mod.id);
            return next;
        });
        setDownloadingMods(prev => {
            const next = { ...prev };
            delete next[mod.id];
            return next;
        });
    }
  };

  useEffect(() => {
    loadProfileData();
  }, [activeProfile]);

  const toggleMod = async (localFileId: string, disable: boolean) => {
    try {
      const [itemType, fileName] = localFileId.includes('::') ? localFileId.split('::') : ['mod', localFileId];
      await invoke('toggle_mod_file', { profileName: activeProfile?.name || '', fileName, disable, itemType });
      loadProfileData();
    } catch (e) {
      console.error('Failed to toggle mod', e);
    }
  };

  const deleteMod = (localFileId: string, modId?: string) => {
    const [itemType, fileName] = localFileId.includes('::') ? localFileId.split('::') : ['mod', localFileId];
    setModToDelete({ fileName, modId, itemType });
  };

  const confirmDeleteMod = async () => {
    if (!modToDelete) return;
    try {
      await invoke('delete_mod_file', { profileName: activeProfile?.name || '', fileName: modToDelete.fileName, modId: modToDelete.modId, itemType: modToDelete.itemType });
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
      <div className="main-content" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        {/* Top bar with Zurück */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', color: '#a0aec0', fontSize: '12px', letterSpacing: '1px', fontWeight: 'bold' }}>
          <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'color 0.2s' }} onClick={() => setActiveProfile(null)} onMouseOver={e => e.currentTarget.style.color = 'white'} onMouseOut={e => e.currentTarget.style.color = '#a0aec0'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            ZURÜCK <span style={{ opacity: 0.3, margin: '0 4px' }}>|</span> {activeProfile.name}
          </div>
        </div>

        {/* Header: Title + Play Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ width: '72px', height: '72px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> 
            </div>
            <div>
              <h2 style={{ fontSize: '32px', margin: 0, fontWeight: 700, letterSpacing: '0.5px' }}>{activeProfile.name}</h2>
              <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: '#a0aec0', marginTop: '10px', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> {activeProfile.version}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg> {activeProfile.loader}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg> {(activeProfile.ram / 1024).toFixed(1).replace('.0', '')} GB RAM</span>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className={`btn ${isLaunching ? 'launching' : ''}`} onClick={handlePlay} disabled={isLaunching} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 28px', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              {isLaunching ? 'STARTE...' : 'SPIELEN'}
            </button>
            <button onClick={() => invoke('open_profile_folder', { profileName: activeProfile.name }).catch(console.error)} style={{ width: '46px', height: '46px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }} title="Profilordner öffnen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            </button>
          </div>
        </div>

        {/* Split Layout Content */}
        <div style={{ display: 'flex', flex: 1, marginTop: '10px', overflow: 'hidden' }}>
          
          {/* Main Content Area (Left side) */}
          <div style={{ flex: 1, paddingRight: '32px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            
            {/* Search Bar + Add Mod Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }}></div>
                <input
                  type="text"
                  placeholder="mods durchsuchen..."
                  value={contentSearchQuery}
                  onChange={e => setContentSearchQuery(e.target.value)}
                  style={{ 
                    padding: '8px 0', 
                    fontSize: '13px', 
                    border: 'none', 
                    background: 'transparent', 
                    color: 'white', 
                    width: '300px',
                    outline: 'none',
                    letterSpacing: '0.5px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                {activeTab === 'mods' && (
                  <div 
                    onClick={() => setModBrowserType('mod')}
                    style={{ cursor: 'pointer', color: 'var(--accent-color)', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    MODS HINZUFÜGEN
                  </div>
                )}
                {activeTab === 'resourcepacks' && (
                  <div 
                    onClick={() => setModBrowserType('resourcepack')}
                    style={{ cursor: 'pointer', color: 'var(--accent-color)', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    RESSOURCENPAKETE HINZUFÜGEN
                  </div>
                )}
                {activeTab === 'shaderpacks' && (
                  <div 
                    onClick={() => setModBrowserType('shader')}
                    style={{ cursor: 'pointer', color: 'var(--accent-color)', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    SHADER-PAKETE HINZUFÜGEN
                  </div>
                )}
              </div>
            </div>
            
            {/* Grid Content */}
            {(() => {
                const isCaeserMod = (name: string, id: string) => name.toLowerCase().includes('caeserclient') || id.toLowerCase().includes('caeserclient');
                const filteredInstalled = installedModsList.filter(mod => {
                  const isCaeser = isCaeserMod(mod.name, mod.id);
                  const matchSearch = mod.name.toLowerCase().includes(contentSearchQuery.toLowerCase());
                  const modItemType = mod.itemType || 'mod';
                  if (activeTab === 'caeserclient') return modItemType === 'mod' && isCaeser && matchSearch;
                  if (activeTab === 'mods') return modItemType === 'mod' && !isCaeser && matchSearch;
                  if (activeTab === 'resourcepacks') return modItemType === 'resourcepack' && matchSearch;
                  if (activeTab === 'shaderpacks') return modItemType === 'shader' && matchSearch;
                  return false;
                });
                
                const filteredLocal = localMods.filter(lm => !installedModsList.find(im => lm.includes(im.name.replace(/ /g, '')) || lm.includes(im.id))).filter(lm => {
                  const [lmType, lmName] = lm.includes('::') ? lm.split('::') : ['mod', lm];
                  const matchSearch = lmName.toLowerCase().includes(contentSearchQuery.toLowerCase());
                  
                  if (activeTab === 'caeserclient') return lmType === 'mod' && matchSearch;
                  if (activeTab === 'mods') return false;
                  if (activeTab === 'resourcepacks') return lmType === 'resourcepack' && matchSearch;
                  if (activeTab === 'shaderpacks') return lmType === 'shader' && matchSearch;
                  return false;
                });
                
                if (filteredInstalled.length === 0 && filteredLocal.length === 0) {
                   return <p style={{ color: 'rgba(255,255,255,0.5)', padding: '20px 0' }}>Keine Einträge gefunden.</p>;
                }
                
                return (
                  <>
                    <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', marginBottom: '16px' }}></div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                      {filteredInstalled.map(mod => {
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
                      <div key={mod.id} className="mod-card" style={{ 
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
                            <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>{mod.name}</div>
                            <div style={{ fontSize: '11px', color: '#a0aec0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {displayVersion || 'Unbekannt'}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {availableUpdates[mod.id] && (
                            <button 
                              title={`Update to ${availableUpdates[mod.id]}`}
                              onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateMod(mod);
                              }}
                              disabled={installingMods.has(mod.id) || downloadingMods[mod.id] !== undefined}
                              style={{
                                  background: 'rgba(212, 175, 55, 0.1)',
                                  border: '1px solid rgba(212, 175, 55, 0.5)',
                                  color: '#d4af37',
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: (installingMods.has(mod.id) || downloadingMods[mod.id] !== undefined) ? 'wait' : 'pointer',
                                  opacity: (installingMods.has(mod.id) || downloadingMods[mod.id] !== undefined) ? 0.5 : 1
                              }}
                            >
                              {(installingMods.has(mod.id) || downloadingMods[mod.id] !== undefined) ? (
                                <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                              )}
                            </button>
                          )}
                          <div 
                            onClick={() => { if(matchedFile) deleteMod(matchedFile, mod.id) }} 
                            style={{ cursor: 'pointer', color: '#f56565', padding: '4px', display: 'flex' }}
                            title="Löschen"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                          </div>
                          <div 
                            onClick={() => { if(matchedFile) toggleMod(matchedFile, !isDisabled) }}
                            style={{ cursor: 'pointer', width: '32px', height: '16px', background: isDisabled ? 'rgba(255,255,255,0.1)' : 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: isDisabled ? 'flex-start' : 'flex-end', padding: '2px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box', borderRadius: '8px' }}
                          >
                            <div style={{ width: '10px', height: '10px', background: isDisabled ? 'rgba(255,255,255,0.4)' : 'white', borderRadius: '50%' }}></div>
                          </div>
                        </div>
                      </div>
                    )})}
                    {filteredLocal.map((fileName, idx) => {
                      const isDisabled = fileName.endsWith('.disabled');
                      const cleanFileName = fileName.replace(/\.disabled$/, '');
                      return (
                      <div key={`local-${idx}`} className="mod-card" style={{ 
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
                            <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>{cleanFileName}</div>
                            <div style={{ fontSize: '11px', color: '#a0aec0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              Lokale Datei
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div 
                            onClick={() => deleteMod(fileName)} 
                            style={{ cursor: 'pointer', color: '#f56565', padding: '4px', display: 'flex' }}
                            title="Löschen"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                          </div>
                          <div 
                            onClick={() => toggleMod(fileName, !isDisabled)}
                            style={{ cursor: 'pointer', width: '32px', height: '16px', background: isDisabled ? 'rgba(255,255,255,0.1)' : 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: isDisabled ? 'flex-start' : 'flex-end', padding: '2px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box', borderRadius: '8px' }}
                          >
                            <div style={{ width: '10px', height: '10px', background: isDisabled ? 'rgba(255,255,255,0.4)' : 'white', borderRadius: '50%' }}></div>
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                  </>
                );
              })()
            }
          </div>
          
          {/* Sidebar INHALTE (Right side) */}
          <div style={{ width: '220px', borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h4 style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', letterSpacing: '1.5px', marginBottom: '8px', paddingLeft: '12px' }}>INHALTE</h4>
            
            {[
              { id: 'mods', label: 'MODS', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>, count: installedModsList.filter(m => !m.name.toLowerCase().includes('caeserclient') && !m.id.toLowerCase().includes('caeserclient')).length },
              { id: 'resourcepacks', label: 'RESSOURCENPAKETE', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> },
              { id: 'shaderpacks', label: 'SHADER-PAKETE', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg> },
              { id: 'caeserclient', label: 'CAESER CLIENT', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg> }
            ].map(tab => (
              <div 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', cursor: 'pointer', borderRadius: '8px',
                  background: activeTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: activeTab === tab.id ? 'white' : 'rgba(255,255,255,0.6)',
                  fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                  transition: 'all 0.2s',
                  fontSize: '13px',
                  letterSpacing: '0.5px'
                }}
                onMouseOver={(e) => { if(activeTab !== tab.id) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'white'; } }}
                onMouseOut={(e) => { if(activeTab !== tab.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {tab.icon}
                  {tab.label}
                </div>
                {tab.count !== undefined && <span style={{ fontSize: '12px', opacity: 0.7 }}>{tab.count}</span>}
              </div>
            ))}
          </div>
        </div>

        {modBrowserType !== null && (
          <ModBrowser 
            onClose={() => setModBrowserType(null)} 
            installedMods={installedMods}
            downloadingMods={downloadingMods}
            onToggleInstall={handleToggleInstall}
            itemType={modBrowserType}
            gameVersion={activeProfile.version}
            loader={activeProfile.loader}
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
      <div className="profile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '20px', marginBottom: '20px' }}>
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
          <button className="btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }} onClick={() => setShowWizard(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            Profile erstellen
          </button>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '15px' }}>
        {profiles.length === 0 && <p style={{ color: '#94a3b8' }}>Keine Profile vorhanden. Erstelle eins!</p>}
        {profiles.length > 0 && filteredProfiles.length === 0 && <p style={{ color: '#94a3b8' }}>Kein Profil mit diesem Namen gefunden.</p>}
        {filteredProfiles.map(p => (
          <div 
            key={p.id} 
            onClick={() => setActiveProfile(p)} 
            style={{ 
              display: 'flex', 
              flexDirection: 'column',
              padding: '16px', 
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', marginBottom: '16px' }}>
              <div style={{ 
                width: '40px', height: '40px', 
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
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
              <button
                className="btn"
                onClick={(e) => {
                  e.stopPropagation();
                  launchProfile(p);
                }}
                style={{ flex: 1, justifyContent: 'center', background: 'transparent', border: '1px solid rgba(59, 130, 246, 0.5)', padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'white', textTransform: 'uppercase', letterSpacing: '1px' }}
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
                  setModBrowserType('mod');
                }}
                style={{ flex: 1, justifyContent: 'center', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'white', textTransform: 'uppercase', letterSpacing: '1px' }}
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

      {deleteProfileId && createPortal(
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
            <h2 style={{ margin: '0 0 15px 0', fontSize: '20px' }}>Profil löschen</h2>
            <p style={{ color: '#94a3b8', margin: '0 0 25px 0' }}>Möchtest du dieses Profil wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              <button 
                className="btn" 
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }} 
                onClick={() => setDeleteProfileId(null)}
              >
                Abbrechen
              </button>
              <button 
                className="btn" 
                style={{ background: 'var(--danger-color)' }} 
                onClick={() => {
                  const updatedProfiles = profiles.filter(p => p.id !== deleteProfileId);
                  setProfiles(updatedProfiles);
                  invoke('save_profiles', { profiles: updatedProfiles })
                    .catch(e => console.error("Failed to delete profile:", e));
                  setDeleteProfileId(null);
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
