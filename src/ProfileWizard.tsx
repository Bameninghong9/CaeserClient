import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function ProfileWizard({ cachedVersions, onComplete, onCancel }: { cachedVersions: string[], onComplete: (profile: any) => void, onCancel: () => void }) {
  const [step, setStep] = useState(1);
  const [versions, setVersions] = useState<string[]>(cachedVersions);
  const [versionSearch, setVersionSearch] = useState('');
  const [version, setVersion] = useState(cachedVersions.length > 0 ? cachedVersions[0] : '');
  const [loader, setLoader] = useState('Vanilla');
  const [name, setName] = useState('');
  const [ram, setRam] = useState(4096);

  useEffect(() => {
    // If cachedVersions was empty initially but gets updated (though it shouldn't be, it's preloaded)
    if (versions.length === 0 && cachedVersions.length > 0) {
      setVersions(cachedVersions);
      if (!version) setVersion(cachedVersions[0]);
    }
  }, [cachedVersions]);

  const handleNext = () => {
    if (step === 1 && !version) return;
    if (step === 2 && !loader) return;
    if (step === 3 && !name) return;
    
    if (step === 3) {
      onComplete({
        id: Math.random().toString(36).substring(7),
        name,
        version,
        loader,
        ram
      });
    } else {
      setStep(step + 1);
    }
  };

  const getTitle = () => {
    if (step === 1) return "MINECRAFT VERSION WÄHLEN";
    if (step === 2) return "SPIELVERSION WÄHLEN";
    return "PROFILDETAILS";
  };

  return (
    <div className="wizard-modal">
      <div className="wizard-modal-header">
        <h2 style={{ fontSize: '14px', margin: 0, letterSpacing: '2px' }}>{getTitle()}</h2>
        <button className="wizard-close-btn" onClick={onCancel}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div className="wizard-content" style={{ padding: '20px', border: 'none', background: 'transparent' }}>
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <input 
                type="text"
                placeholder="Versionen suchen..."
                value={versionSearch}
                onChange={(e) => setVersionSearch(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  padding: '10px 15px',
                  color: 'white',
                  width: '100%',
                  maxWidth: '300px'
                }}
              />
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '15px',
              maxHeight: '400px',
              overflowY: 'auto',
              paddingRight: '10px'
            }}>
              {versions.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', letterSpacing: '1px' }}>
                  LADE VERSIONEN...
                </div>
              ) : (
                versions.filter(v => v.toLowerCase().includes(versionSearch.toLowerCase())).map(v => (
                  <div 
                    key={v} 
                    onClick={() => setVersion(v)}
                    style={{
                      background: version === v ? 'transparent' : '#0f172a',
                      border: version === v ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                      padding: '20px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                      boxShadow: version === v ? '0 0 15px rgba(59,130,246,0.3) inset' : 'none'
                    }}
                    onMouseOver={(e) => {
                      if (version !== v) {
                        e.currentTarget.style.border = '1px solid rgba(255,255,255,0.2)';
                        e.currentTarget.style.background = '#1e293b';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (version !== v) {
                        e.currentTarget.style.border = '1px solid rgba(255,255,255,0.05)';
                        e.currentTarget.style.background = '#0f172a';
                      }
                    }}
                  >
                    <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace' }}>{v}</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>Release</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {step === 2 && (
          <>
            <h3 style={{ textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '20px' }}>SPIELVERSION</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px'
            }}>
              {[
                { id: 'Vanilla', bg: 'url("/assets/vanilla.png")' },
                { id: 'Fabric', bg: 'url("/assets/fabric.png")' },
                { id: 'Forge', bg: 'url("/assets/forge.png")' },
                { id: 'NeoForge', bg: 'url("/assets/neoforge.png")' }
              ].map(l => (
                <div 
                  key={l.id}
                  onClick={() => setLoader(l.id)}
                  style={{
                    height: '140px',
                    backgroundColor: '#1e293b',
                    backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.7)), ${l.bg}`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    border: loader === l.id ? '2px solid #3b82f6' : '2px solid transparent',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                    transition: 'transform 0.2s, border 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <span style={{ 
                    position: 'relative', 
                    zIndex: 1, 
                    fontSize: '24px', 
                    fontWeight: 'bold', 
                    fontFamily: 'monospace', 
                    color: 'white',
                    textTransform: 'uppercase',
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                  }}>{l.id}</span>
                </div>
              ))}
            </div>
          </>
        )}
        
        {step === 3 && (
          <>
            <h3>Details anpassen</h3>
            <input 
              type="text" 
              className="input-modern" 
              placeholder="Profilname" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
            <div className="slider-container" style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>Empfohlen: 4096 MB</div>
              <div style={{ color: 'white', fontSize: '15px', fontWeight: 'bold' }}>
                {ram} MB ({ (ram / 1024).toFixed(1).replace('.0', '') } GB)
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: '12px', marginTop: '10px' }}>
                <span>1 GB</span>
                <span style={{ position: 'absolute', left: `calc(${(ram - 1024) / (16384 - 1024) * 100}% - 30px)`, textAlign: 'center', width: '60px' }}>
                  {ram} MB
                </span>
                <span>16384 MB</span>
              </div>
              
              <div className="range-slider-wrapper" style={{ position: 'relative', width: '100%', marginTop: '5px' }}>
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  height: '4px',
                  background: '#3b82f6',
                  width: `${(ram - 1024) / (16384 - 1024) * 100}%`,
                  zIndex: 1,
                  pointerEvents: 'none'
                }}></div>
                <input 
                  type="range" 
                  min="1024" 
                  max="16384" 
                  step="512"
                  value={ram} 
                  onChange={e => setRam(parseInt(e.target.value))} 
                  className="range-slider"
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="wizard-actions" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '15px 20px', margin: 0 }}>
        {step > 1 && (
          <button className="btn" style={{ background: 'transparent', color: 'white', border: '1px solid var(--glass-border)', marginRight: 'auto' }} onClick={() => setStep(step - 1)}>
            ZURÜCK
          </button>
        )}
        <button 
          className="btn" 
          onClick={handleNext} 
          disabled={(step === 1 && !version) || (step === 3 && !name)}
          style={{ padding: '8px 24px', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', background: 'transparent', border: '1px solid var(--accent-color)' }}
        >
          {step === 3 ? 'ERSTELLEN' : 'WEITER'} &rarr;
        </button>
      </div>
    </div>
  );
}
