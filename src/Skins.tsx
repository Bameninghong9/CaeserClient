import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Credentials } from './App';
import { SkinViewer, IdleAnimation } from 'skinview3d';

export interface LocalSkin {
  id: string;
  name: string;
  file_name: string;
}

export default function Skins({ activeCreds }: { activeCreds: Credentials | null }) {
  const [localSkins, setLocalSkins] = useState<LocalSkin[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSkinInfo, setActiveSkinInfo] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [promptInput, setPromptInput] = useState('');
  const [modalConfig, setModalConfig] = useState<{
    type: 'alert' | 'prompt' | 'confirm';
    title: string;
    message: string;
    defaultValue?: string;
    onConfirm: (val?: string) => void;
    onCancel?: () => void;
  } | null>(null);

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
        const base64Data = event.target?.result as string;
        if (base64Data) {
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
                await invoke('add_local_skin', { name: newName, base64Data });
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
        variant: "classic" // For now hardcode classic, could add UI for slim
      });
      setModalConfig({
        type: 'alert',
        title: 'Erfolg',
        message: 'Skin erfolgreich angewendet!',
        onConfirm: () => setModalConfig(null)
      });
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
            <img 
              src={`https://crafatar.com/renders/body/${activeSkinInfo.id}?overlay=true`} 
              alt="Aktueller Skin" 
              style={{ width: '80px', height: '180px', objectFit: 'contain' }}
              onError={(e) => {
                // Fallback to face if body render fails
                e.currentTarget.src = `https://crafatar.com/avatars/${activeSkinInfo.id}?overlay=true`;
                e.currentTarget.style.width = '80px';
                e.currentTarget.style.height = '80px';
              }}
            />
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
            background: 'var(--surface-color)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '30px',
            width: '400px',
            maxWidth: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
          }}>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '20px' }}>{modalConfig.title}</h2>
            <p style={{ color: '#94a3b8', margin: '0 0 25px 0' }}>{modalConfig.message}</p>
            
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              {(modalConfig.type === 'confirm' || modalConfig.type === 'prompt') && (
                <button 
                  className="btn" 
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }} 
                  onClick={() => {
                    if (modalConfig.onCancel) modalConfig.onCancel();
                    setModalConfig(null);
                  }}
                >
                  Abbrechen
                </button>
              )}
              <button 
                className="btn" 
                style={{ background: modalConfig.type === 'confirm' ? 'var(--danger-color)' : 'var(--accent-color)' }} 
                onClick={() => modalConfig.onConfirm(modalConfig.type === 'prompt' ? (promptInput || modalConfig.defaultValue) : undefined)}
              >
                {modalConfig.type === 'confirm' ? 'Löschen' : 'OK'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function LocalSkinCard({ skin, onApply, onDelete, loading }: { skin: LocalSkin, onApply: () => void, onDelete: () => void, loading: boolean }) {
  const [imgData, setImgData] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);

  useEffect(() => {
    invoke<string>('get_local_skin_base64', { fileName: skin.file_name })
      .then(setImgData)
      .catch(console.error);
  }, [skin.file_name]);

  useEffect(() => {
    if (imgData && canvasRef.current) {
      if (!viewerRef.current) {
        viewerRef.current = new SkinViewer({
          canvas: canvasRef.current,
          width: 150,
          height: 150,
          skin: imgData
        });
        viewerRef.current.animation = new IdleAnimation();
      } else {
        viewerRef.current.loadSkin(imgData);
      }
    }
    return () => {
      if (viewerRef.current) {
        viewerRef.current.dispose();
        viewerRef.current = null;
      }
    };
  }, [imgData]);

  return (
    <div style={{ 
      background: 'rgba(255,255,255,0.02)', 
      border: '1px solid rgba(255,255,255,0.05)', 
      borderRadius: '8px', 
      padding: '15px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '15px',
      position: 'relative'
    }}>
      <div style={{ 
        width: '100%', 
        aspectRatio: '1', 
        background: 'rgba(0,0,0,0.2)', 
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        {imgData ? (
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ width: '40px', height: '40px', border: '2px solid rgba(255,255,255,0.1)', borderRadius: '50%', borderTopColor: '#3b82f6', animation: 'spin 1s linear infinite' }}></div>
        )}
      </div>
      
      <h3 style={{ margin: 0, fontSize: '14px', textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {skin.name}
      </h3>
      
      <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
        <button 
          className="btn" 
          style={{ flex: 1, padding: '6px', fontSize: '11px', letterSpacing: '0.5px' }} 
          onClick={onApply}
          disabled={loading}
        >
          Anwenden
        </button>
        <button 
          style={{ 
            background: 'rgba(245, 101, 101, 0.1)', 
            border: '1px solid rgba(245, 101, 101, 0.3)', 
            color: '#f56565', 
            borderRadius: '4px',
            padding: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={onDelete}
          disabled={loading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    </div>
  );
}
