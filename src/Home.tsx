import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useOutletContext } from 'react-router-dom';
import { ChevronDown, Play } from 'lucide-react';
import { Credentials, AppSettings, useAppStore } from './store';
import { Profile } from './Profiles';
import { toast } from 'sonner';

export default function Home() {
  const { activeCreds } = useOutletContext<{ activeCreds: Credentials | null }>();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [launching, setLaunching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const { theme, setTheme } = useAppStore();

  useEffect(() => {
    Promise.all([
      invoke<Profile[]>('get_profiles'),
      invoke<{ last_played_profile: string | null }>('get_settings')
    ])
      .then(([p, settingsRes]) => {
        const s = settingsRes as unknown as AppSettings;
        setProfiles(p);
        setSettings(s);
        if (s.theme) {
          setTheme(s.theme);
        }
        if (s.last_played_profile && p.find(x => x.id === s.last_played_profile)) {
          setSelectedProfileId(s.last_played_profile);
        } else if (p.length > 0) {
          setSelectedProfileId(p[0].id);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedProfileId && settings) {
      invoke('save_settings', { settings: { ...settings, last_played_profile: selectedProfileId } }).catch(console.error);
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
        ram: selectedProfile.ram || settings?.ram || 4096,
        javaArgs: settings?.java_args || "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions",
        creds: activeCreds 
      });
      setProgress(100);
      setTimeout(() => setProgress(0), 500);
      toast.success('Spiel gestartet!');
    } catch (e) {
      console.error(e);
      toast.error(`Start fehlgeschlagen: ${e}`);
      setProgress(0);
    } finally {
      clearInterval(interval);
      setLaunching(false);
    }
  };

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  return (
    <div className="flex-1 flex flex-col h-full relative p-8">
      <div className="flex-1"></div>
      
      <div className="relative flex flex-col items-center pb-12 w-full max-w-[500px] mx-auto">
        <div className="flex w-full h-[85px] bg-surface border border-white/10 rounded-xl overflow-hidden relative shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all">
          
          <button 
            className={`flex-1 relative flex flex-col justify-center items-center p-0 transition-all duration-300 ${
              launching || !selectedProfile 
                ? 'bg-slate-800 cursor-not-allowed' 
                : theme === 'neon' ? 'bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 cursor-pointer shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                : theme === 'ocean' ? 'bg-gradient-to-r from-cyan-600 to-blue-500 hover:from-cyan-500 hover:to-blue-400 cursor-pointer shadow-[0_0_20px_rgba(8,145,178,0.4)]'
                : theme === 'forest' ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 cursor-pointer shadow-[0_0_20px_rgba(5,150,105,0.4)]'
                : 'bg-accent-gradient hover:bg-accent-gradient-hover cursor-pointer'
            }`}
            onClick={handlePlay}
            disabled={launching || !selectedProfile}
          >
            <div 
              className="absolute left-0 top-0 h-full bg-white/20 transition-[width] duration-200 ease-out" 
              style={{ width: `${progress}%` }}
            />
            <span className="relative z-10 text-[26px] font-extrabold text-white tracking-[3px] drop-shadow-md flex items-center gap-2">
              {!launching && <Play fill="currentColor" size={24} className="mt-0.5" />}
              {launching ? 'LAUNCHING' : 'LAUNCH'}
            </span>
            <span className="relative z-10 text-sm text-white/80 mt-1 font-medium">
              {selectedProfile ? selectedProfile.name : 'Kein Profil ausgewählt'}
            </span>
          </button>
          
          <div className="w-[1px] bg-white/10 h-full relative z-20"></div>
          
          <button 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={launching}
            className={`w-[65px] flex justify-center items-center text-white transition-all duration-300 ${
              launching 
                ? 'bg-slate-800 cursor-not-allowed' 
                : theme === 'neon' ? 'bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 cursor-pointer shadow-[0_0_20px_rgba(236,72,153,0.4)]'
                : theme === 'ocean' ? 'bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 cursor-pointer shadow-[0_0_20px_rgba(59,130,246,0.4)]'
                : theme === 'forest' ? 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 cursor-pointer shadow-[0_0_20px_rgba(20,184,166,0.4)]'
                : 'bg-accent-gradient hover:bg-accent-gradient-hover cursor-pointer'
            }`}
          >
            <ChevronDown size={24} className={`transition-transform duration-300 ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
        </div>
        
        <div className="relative w-full">
          {dropdownOpen && (
            <div className="absolute top-2 left-0 w-full bg-[#0a1930] border border-[#2b5585] rounded-lg overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.5)] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              {profiles.length === 0 ? (
                <div className="p-4 text-slate-400 text-sm text-center">Keine Profile erstellt</div>
              ) : (
                profiles.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => {
                      setSelectedProfileId(p.id);
                      setDropdownOpen(false);
                    }}
                    className={`p-3 cursor-pointer border-b border-[#1a2c4e] transition-colors hover:bg-[#1a2c4e]/50 ${
                      selectedProfileId === p.id ? 'bg-[#1a2c4e]' : 'bg-transparent'
                    }`}
                  >
                    <div className="font-bold text-white">{p.name}</div>
                    <div className="text-xs text-slate-400">{p.loader} {p.version}</div>
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
