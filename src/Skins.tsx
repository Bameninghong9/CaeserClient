import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Credentials, useAppStore } from './store';
import { useOutletContext } from 'react-router-dom';
import { SkinViewer, IdleAnimation } from 'skinview3d';

export interface LocalSkin {
  id: string;
  name: string;
  file_name: string;
  variant?: string;
}

export default function Skins() {
  const { activeCreds } = useOutletContext<{ activeCreds: Credentials | null }>();
  const setActiveSkinUrl = useAppStore(state => state.setActiveSkinUrl);
  
  const onSkinChanged = async () => {
    if (!activeCreds) return;
    try {
      const data: any = await invoke('get_user_skin_data', { accessToken: activeCreds.access_token });
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

  const [localSkins, setLocalSkins] = useState<LocalSkin[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSkinInfo, setActiveSkinInfo] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [promptInput, setPromptInput] = useState('');
  const [modalConfig, setModalConfig] = useState<{
    type: 'alert' | 'prompt' | 'confirm' | 'editSkin';
    title: string;
    message: string;
    defaultValue?: string;
    skinToEdit?: LocalSkin;
    onConfirm: (val?: any) => void;
    onCancel?: () => void;
  } | null>(null);

  const processSkinImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (img.width === 64 && (img.height === 64 || img.height === 32)) {
          resolve(dataUrl);
        } else if (img.width > 0 && img.height > 0) {
          // Auto-resize to 64x64 or 64x32
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = img.height === img.width / 2 ? 32 : 64;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject("Konnte das Bild nicht verarbeiten.");
            return;
          }
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } else {
          reject(`Ungültiges Bildformat: ${img.width}x${img.height}.`);
        }
      };
      img.onerror = () => reject("Defekte oder ungültige Bilddatei.");
      img.src = dataUrl;
    });
  };

  const fetchLocalSkins = async () => {
    try {
      const skins = await invoke<LocalSkin[]>('get_local_skins');
      setLocalSkins(skins);
    } catch (e) {
      console.error("Failed to fetch local skins", e);
    }
  };

  const fetchActiveSkin = async () => {
    if (!activeCreds) return;
    try {
      const data: any = await invoke('get_user_skin_data', { accessToken: activeCreds.access_token });
      setActiveSkinInfo(data);
    } catch (e) {
      console.error("Failed to fetch active skin info", e);
    }
  };

  useEffect(() => {
    fetchLocalSkins();
    if (activeCreds) {
      fetchActiveSkin();
    }
  }, [activeCreds]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawBase64 = event.target?.result as string;
        if (rawBase64) {
          try {
            const processedBase64 = await processSkinImage(rawBase64);
            const defaultName = file.name.split('.')[0];
            setPromptInput(defaultName);
            setModalConfig({
              type: 'prompt',
              title: 'Skin hinzufügen',
              message: 'Name für den Skin eingeben:',
              defaultValue: defaultName,
              onConfirm: async (newName) => {
                setModalConfig(null);
                if (!newName) newName = "Neuer Skin";
                try {
                  setLoading(true);
                  await invoke('add_local_skin', { name: newName, base64Data: processedBase64 });
                  await fetchLocalSkins();
                } catch (error) {
                  console.error("Error adding skin", error);
                  setModalConfig({
                    type: 'alert',
                    title: 'Fehler',
                    message: 'Fehler beim Hinzufügen des Skins: ' + error,
                    onConfirm: () => setModalConfig(null)
                  });
                } finally {
                  setLoading(false);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }
              },
              onCancel: () => {
                setModalConfig(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }
            });
          } catch (error) {
            setModalConfig({
              type: 'alert',
              title: 'Fehler',
              message: String(error),
              onConfirm: () => setModalConfig(null)
            });
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApplySkin = async (skin: LocalSkin) => {
    if (!activeCreds) return;
    try {
      setLoading(true);
      await invoke('apply_skin', { 
        accessToken: activeCreds.access_token, 
        fileName: skin.file_name, 
        variant: skin.variant || "classic"
      });
      setModalConfig({
        type: 'alert',
        title: 'Erfolg',
        message: 'Der Skin wurde erfolgreich angewendet!',
        onConfirm: () => setModalConfig(null)
      });
      if (onSkinChanged) onSkinChanged();
      await fetchActiveSkin();
    } catch (error) {
      console.error("Error applying skin", error);
      setModalConfig({
        type: 'alert',
        title: 'Fehler',
        message: 'Fehler beim Anwenden des Skins: ' + error,
        onConfirm: () => setModalConfig(null)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSkin = async (id: string) => {
    setModalConfig({
      type: 'confirm',
      title: 'Skin löschen',
      message: 'Soll dieser Skin wirklich gelöscht werden?',
      onConfirm: async () => {
        setModalConfig(null);
        try {
          await invoke('remove_local_skin', { id });
          await fetchLocalSkins();
        } catch (error) {
          console.error("Error removing skin", error);
        }
      },
      onCancel: () => setModalConfig(null)
    });
  };

  // We can render a preview using Crafatar API or similar, but for local skins 
  // we'll need to fetch the base64 to show it, or we can just show a placeholder box.
  // We'll implement a simple SkinPreview component below.

  return (
    <div className="main-content">
      <div className="profile-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '20px', marginBottom: '20px' }}>
        <h1 className="hero-title" style={{ margin: 0, fontSize: '24px' }}>Skins</h1>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="file" 
            accept="image/png" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            style={{ display: 'none' }} 
          />
          <button 
            className="btn" 
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }} 
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            SKIN HINZUFÜGEN
          </button>
        </div>
      </div>
      
      {activeSkinInfo && (
        <div style={{ marginBottom: '30px', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 style={{ fontSize: '16px', marginTop: 0, color: '#94a3b8' }}>Aktueller Skin</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '15px' }}>
            <div style={{ width: '100px', height: '200px' }}>
              <ActiveSkin3D url={
                activeSkinInfo.skins && activeSkinInfo.skins.length > 0 
                  ? activeSkinInfo.skins[0].url 
                  : `https://minotar.net/skin/${activeSkinInfo.id}`
              } />
            </div>
            <div>
              <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: 'white' }}>Variante: {activeSkinInfo.skins && activeSkinInfo.skins.length > 0 ? activeSkinInfo.skins[0].variant : 'classic'}</p>
              <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Wird im Spiel angezeigt</p>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '16px', marginBottom: '15px', color: '#94a3b8' }}>Bibliothek</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
        {localSkins.length === 0 && <p style={{ color: '#94a3b8' }}>Keine Skins in der Bibliothek.</p>}
        {localSkins.map(skin => (
          <LocalSkinCard 
            key={skin.id} 
            skin={skin} 
            onApply={() => handleApplySkin(skin)} 
            onDelete={() => handleDeleteSkin(skin.id)} 
            onEdit={() => {
              setModalConfig({
                type: 'editSkin',
                title: 'Skin bearbeiten',
                message: 'Passe den Skin an:',
                skinToEdit: skin,
                onConfirm: async (updates) => {
                  setModalConfig(null);
                  try {
                    setLoading(true);
                    await invoke('update_local_skin', {
                      id: skin.id,
                      name: updates.name,
                      variant: updates.variant
                    });
                    await fetchLocalSkins();
                  } catch (e) {
                    console.error("Failed to update skin", e);
                  } finally {
                    setLoading(false);
                  }
                },
                onCancel: () => setModalConfig(null)
              });
            }}
            loading={loading} 
          />
        ))}
      </div>

      {modalConfig && createPortal(
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
            background: modalConfig.type === 'editSkin' ? 'transparent' : 'var(--surface-color)',
            border: modalConfig.type === 'editSkin' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: modalConfig.type === 'editSkin' ? '0' : '12px',
            padding: modalConfig.type === 'editSkin' ? '0' : '30px',
            width: modalConfig.type === 'editSkin' ? '500px' : '400px',
            maxWidth: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            {modalConfig.type !== 'editSkin' && (
              <>
                <h2 style={{ margin: '0 0 15px 0', fontSize: '20px' }}>{modalConfig.title}</h2>
                <p style={{ color: '#94a3b8', margin: '0 0 25px 0' }}>{modalConfig.message}</p>
              </>
            )}
            
            {modalConfig.type === 'prompt' && (
              <input 
                type="text" 
                defaultValue={modalConfig.defaultValue}
                onChange={(e) => setPromptInput(e.target.value)}
                autoFocus
                style={{
                  width: '100%', padding: '10px', marginBottom: '20px', 
                  background: 'rgba(0,0,0,0.2)', border: '1px solid #3b82f6', 
                  borderRadius: '4px', color: 'white', boxSizing: 'border-box'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    modalConfig.onConfirm(promptInput || modalConfig.defaultValue);
                  }
                }}
              />
            )}
            {modalConfig.type === 'editSkin' && modalConfig.skinToEdit && (() => {
              return <EditSkinForm skin={modalConfig.skinToEdit} onConfirm={modalConfig.onConfirm} onCancel={() => { if (modalConfig.onCancel) modalConfig.onCancel(); setModalConfig(null); }} />;
            })()}

            {modalConfig.type !== 'editSkin' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              {(modalConfig.type === 'confirm' || modalConfig.type === 'prompt' || modalConfig.type === 'alert') && (
                <button 
                  className="btn" 
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }} 
                  onClick={() => {
                    if (modalConfig.onCancel) modalConfig.onCancel();
                    setModalConfig(null);
                  }}
                >
                  {modalConfig.type === 'alert' ? 'OK' : 'Abbrechen'}
                </button>
              )}
              {modalConfig.type === 'prompt' && (
                <button 
                  className="btn" 
                  onClick={() => modalConfig.onConfirm(promptInput || modalConfig.defaultValue)}
                >
                  Bestätigen
                </button>
              )}
              {modalConfig.type === 'confirm' && (
                <button 
                  className="btn" 
                  style={{ background: '#f56565', color: 'white' }}
                  onClick={() => modalConfig.onConfirm()}
                >
                  Bestätigen
                </button>
              )}
            </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function EditSkinForm({ skin, onConfirm, onCancel }: { skin: LocalSkin, onConfirm: (updates: any) => void, onCancel: () => void }) {
  const [name, setName] = useState(skin.name);
  const [variant, setVariant] = useState(skin.variant || 'classic');
  const [skinBase64, setSkinBase64] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>('get_local_skin_base64', { fileName: skin.file_name })
      .then(b64 => setSkinBase64(b64))
      .catch(console.error);
  }, [skin.file_name]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: '"Minecraft", "Minecraftia", monospace' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <span style={{ fontWeight: 'bold', fontSize: '14px', color: 'white' }}>SKIN-EIGENSCHAFTEN BEARBEITEN</span>
        <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '4px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div style={{ padding: '40px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0f172a' }}>
        
        <div style={{ width: '100%', maxWidth: '350px', marginBottom: '30px' }}>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', padding: '12px 15px', background: '#000000', border: '1px solid rgba(255,255,255,0.1)', color: 'white', boxSizing: 'border-box', fontSize: '16px', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ height: '200px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '40px' }}>
          {skinBase64 ? <Skin3DPreview base64={skinBase64} variant={variant} /> : <span style={{ color: '#94a3b8' }}>LÄDT...</span>}
        </div>

        <div style={{ display: 'flex', gap: '30px', marginBottom: '40px' }}>
          <label 
            onClick={() => setVariant('classic')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '12px', color: 'white' }}
          >
            <div style={{ 
              width: '20px', height: '20px', 
              border: '2px solid #3b82f6', 
              background: variant === 'classic' ? '#3b82f6' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {variant === 'classic' && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            </div>
            KLASSISCH (STEVE)
          </label>

          <label 
            onClick={() => setVariant('slim')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '12px', color: 'white' }}
          >
            <div style={{ 
              width: '20px', height: '20px', 
              border: '2px solid #555', 
              background: variant === 'slim' ? '#3b82f6' : 'transparent',
              borderColor: variant === 'slim' ? '#3b82f6' : '#555',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {variant === 'slim' && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            </div>
            SCHLANK (ALEX)
          </label>
        </div>

        <button 
          className="btn" 
          style={{ width: '100%', maxWidth: '250px', background: 'transparent', border: '1px solid #3b82f6', color: 'white', padding: '15px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'inherit' }}
          onClick={() => onConfirm({ name, variant })}
        >
          ÄNDERUNGEN SPEICHERN
        </button>

      </div>
    </div>
  );
}

function LocalSkinCard({ skin, onApply, onDelete, onEdit, loading }: { skin: LocalSkin, onApply: () => void, onDelete: () => void, onEdit: () => void, loading: boolean }) {
  const [skinBase64, setSkinBase64] = useState<string | null>(null);
  
  useEffect(() => {
    invoke<string>('get_local_skin_base64', { fileName: skin.file_name })
      .then(b64 => setSkinBase64(b64))
      .catch(console.error);
  }, [skin.file_name]);
  
  return (
    <div className="profile-card">
      <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
        {skinBase64 ? (
          <Skin3DPreview base64={skinBase64} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#94a3b8' }}>Lädt...</span>
          </div>
        )}
      </div>
      <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: 'white', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{skin.name}</h3>
      <div style={{ display: 'flex', gap: '5px' }}>
        <button className="btn" onClick={onApply} disabled={loading} style={{ flex: 1, padding: '8px' }}>Anwenden</button>
        <button className="btn" onClick={onEdit} disabled={loading} title="Bearbeiten" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.1)', color: 'white' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </button>
        <button className="btn-icon-danger" onClick={onDelete} disabled={loading} title="Löschen" style={{ padding: '8px 12px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </div>
  );
}

function ActiveSkin3D({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width: 100,
      height: 200,
      skin: url
    });
    
    viewer.animation = new IdleAnimation();
    
    return () => {
      viewer.dispose();
    };
  }, [url]);

  return <canvas ref={canvasRef} style={{ width: '100px', height: '200px', display: 'block' }} />;
}

function Skin3DPreview({ base64, variant = 'classic' }: { base64: string, variant?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width: 150,
      height: 200,
      skin: base64,
      model: variant === 'slim' ? 'slim' : 'default'
    });
    
    viewer.animation = new IdleAnimation();
    
    return () => {
      viewer.dispose();
    };
  }, [base64, variant]);
  
  return <canvas ref={canvasRef} style={{ width: '150px', height: '200px', display: 'block', margin: '0 auto' }} />;
}
