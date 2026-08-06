import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function ProfileWizard({ onComplete, onCancel }: { onComplete: (profile: any) => void, onCancel: () => void }) {
  const [step, setStep] = useState(1);
  const [versions, setVersions] = useState<string[]>([]);
  const [versionSearch, setVersionSearch] = useState('');
  const [version, setVersion] = useState('');
  const [loader, setLoader] = useState('Vanilla');
  const [name, setName] = useState('');
  const [ram, setRam] = useState(4);

  useEffect(() => {
    invoke<string[]>('get_versions').then((v) => {
      let filtered = v.filter(ver => !ver.includes('w') && !ver.includes('pre') && !ver.includes('rc') && !ver.includes('Alpha') && !ver.includes('Beta'));
      filtered.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
      setVersions(filtered);
      if (filtered.length > 0) setVersion(filtered[0]);
    }).catch(console.error);
  }, []);

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

  return (
    <div className="wizard-container">
      <h2>Profil erstellen</h2>
      
      <div className="wizard-steps">
        <div className={`wizard-step ${step >= 1 ? 'completed' : ''} ${step === 1 ? 'active' : ''}`}>1</div>
        <div className={`wizard-step ${step >= 2 ? 'completed' : ''} ${step === 2 ? 'active' : ''}`}>2</div>
        <div className={`wizard-step ${step >= 3 ? 'completed' : ''} ${step === 3 ? 'active' : ''}`}>3</div>
      </div>

      <div className="wizard-content">
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
              {versions.filter(v => v.toLowerCase().includes(versionSearch.toLowerCase())).map(v => (
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
              ))}
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
            <div className="slider-container" style={{ marginTop: '20px' }}>
              <label>Arbeitsspeicher (RAM): {ram} GB</label>
              <input 
                type="range" 
                min="1" 
                max="32" 
                value={ram} 
                onChange={e => setRam(parseInt(e.target.value))} 
                className="range-slider"
              />
            </div>
          </>
        )}
      </div>

      <div className="wizard-actions">
        <button className="btn" style={{ background: 'transparent', color: 'white', border: '1px solid var(--glass-border)' }} onClick={onCancel}>
          Abbrechen
        </button>
        {step > 1 && (
          <button className="btn" style={{ background: 'transparent', color: 'white', border: '1px solid var(--glass-border)' }} onClick={() => setStep(step - 1)}>
            Zurück
          </button>
        )}
        <button className="btn" onClick={handleNext} disabled={(step === 1 && !version) || (step === 3 && !name)}>
          {step === 3 ? 'Erstellen' : 'Weiter'}
        </button>
      </div>
    </div>
  );
}
