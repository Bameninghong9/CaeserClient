import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function ProfileWizard({ onComplete, onCancel }: { onComplete: (profile: any) => void, onCancel: () => void }) {
  const [step, setStep] = useState(1);
  const [versions, setVersions] = useState<string[]>([]);
  const [version, setVersion] = useState('');
  const [loader, setLoader] = useState('Vanilla');
  const [name, setName] = useState('');
  const [ram, setRam] = useState(4);

  useEffect(() => {
    invoke<string[]>('get_versions').then((v) => {
      const filtered = v.filter(ver => !ver.includes('w') && !ver.includes('pre') && !ver.includes('rc') && !ver.includes('Alpha') && !ver.includes('Beta'));
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
          <>
            <h3>Minecraft Version wählen</h3>
            <select className="select-modern" value={version} onChange={e => setVersion(e.target.value)}>
              {versions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </>
        )}
        
        {step === 2 && (
          <>
            <h3>Modloader wählen</h3>
            <div className="loader-grid">
              {['Vanilla', 'Fabric', 'Forge', 'NeoForge'].map(l => (
                <div 
                  key={l}
                  className={`loader-card ${loader === l ? 'selected' : ''}`}
                  onClick={() => setLoader(l)}
                >
                  <div className="loader-icon">
                    {/* Placeholder icon based on name */}
                    {l === 'Vanilla' ? '🧊' : l === 'Fabric' ? '🧶' : l === 'Forge' ? '🔨' : '🌱'}
                  </div>
                  <span>{l}</span>
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
