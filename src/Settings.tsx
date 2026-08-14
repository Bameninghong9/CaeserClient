import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, AppSettings } from './store';
import { Settings2, Monitor, Cpu } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useAppStore();

  useEffect(() => {
    invoke<AppSettings>('get_settings')
      .then(s => {
        setSettings(s);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        toast.error('Konnte Einstellungen nicht laden');
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    if (!settings || loading) return;
    const timer = setTimeout(() => {
      invoke('save_settings', { settings }).catch(console.error);
      if (settings.theme) {
        setTheme(settings.theme);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [settings, loading, setTheme]);

  if (loading || !settings) {
    return <div className="p-8 text-slate-400">Lade Einstellungen...</div>;
  }

  const currentRamGb = (settings.ram || 4096) / 1024;

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-accent-gradient flex items-center justify-center shadow-[0_4px_20px_rgba(59,130,246,0.4)]">
          <Settings2 size={24} className="text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Einstellungen</h1>
          <p className="text-slate-400 text-sm">Passe deinen Client an deine Bedürfnisse an.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Minecraft Settings */}
        <div className="bg-surface border border-white/10 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <Cpu size={20} className="text-accent" />
            <h2 className="text-xl font-bold text-white">Minecraft Leistung</h2>
          </div>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">Arbeitsspeicher (RAM)</label>
                <span className="text-sm font-bold text-accent">{currentRamGb.toFixed(1)} GB</span>
              </div>
              <input 
                type="range" 
                min="1024" 
                max="16384" 
                step="512" 
                value={settings.ram || 4096}
                onChange={(e) => setSettings({ ...settings, ram: parseInt(e.target.value) })}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <p className="text-xs text-slate-500 mt-2">Bestimmt, wie viel Speicher dem Spiel maximal zur Verfügung steht.</p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 block mb-2">Java Argumente (JVM)</label>
              <textarea 
                value={settings.java_args || ''}
                onChange={(e) => setSettings({ ...settings, java_args: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all min-h-[100px] resize-y font-mono"
                placeholder="-XX:+UseG1GC ..."
              />
              <p className="text-xs text-slate-500 mt-2">Fortgeschrittene Startparameter für Java. Leer lassen für Standard-Werte.</p>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer p-4 bg-slate-800/30 border border-slate-800 rounded-xl hover:border-slate-600 transition-all mb-4">
                <input
                  type="checkbox"
                  checked={settings.open_logs_after_start || false}
                  onChange={(e) => setSettings({ ...settings, open_logs_after_start: e.target.checked })}
                  className="w-5 h-5 rounded border-slate-700 text-accent focus:ring-accent focus:ring-offset-slate-900 bg-slate-800"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">Logs nach Start öffnen</span>
                  <span className="text-xs text-slate-500">Öffnet automatisch das Log-Fenster, wenn das Spiel gestartet wird.</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-4 bg-slate-800/30 border border-slate-800 rounded-xl hover:border-slate-600 transition-all">
                <input
                  type="checkbox"
                  checked={settings.enable_discord_rpc ?? true}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setSettings({ ...settings, enable_discord_rpc: enabled });
                    if (!enabled) {
                      invoke('clear_discord_status').catch(console.error);
                    }
                  }}
                  className="w-5 h-5 rounded border-slate-700 text-accent focus:ring-accent focus:ring-offset-slate-900 bg-slate-800"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">Discord Rich Presence</span>
                  <span className="text-xs text-slate-500">Zeigt deinen aktuellen Launcher-Status in Discord an.</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Launcher Settings */}
        <div className="bg-surface border border-white/10 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <Monitor size={20} className="text-accent" />
            <h2 className="text-xl font-bold text-white">Launcher Design</h2>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-3">Theme</label>
              <div className="grid grid-cols-2 gap-4">
                <label className={`flex flex-col items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition-all ${settings.theme === 'dark' || !settings.theme ? 'border-accent bg-accent/10' : 'border-slate-800 hover:border-slate-600 bg-slate-800/30'}`}>
                  <input 
                    type="radio" 
                    name="theme" 
                    value="dark" 
                    checked={settings.theme === 'dark' || !settings.theme} 
                    onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
                    className="hidden" 
                  />
                  <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-700 mb-2"></div>
                  <span className="font-semibold text-white">Dark Mode</span>
                </label>

                <label className={`flex flex-col items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition-all ${settings.theme === 'neon' ? 'border-purple-500 bg-purple-500/10' : 'border-slate-800 hover:border-slate-600 bg-slate-800/30'}`}>
                  <input 
                    type="radio" 
                    name="theme" 
                    value="neon" 
                    checked={settings.theme === 'neon'} 
                    onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
                    className="hidden" 
                  />
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 border border-purple-400 mb-2 shadow-[0_0_15px_rgba(168,85,247,0.5)]"></div>
                  <span className="font-semibold text-white">Neon Mode</span>
                </label>
                
                <label className={`flex flex-col items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition-all ${settings.theme === 'ocean' ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800 hover:border-slate-600 bg-slate-800/30'}`}>
                  <input 
                    type="radio" 
                    name="theme" 
                    value="ocean" 
                    checked={settings.theme === 'ocean'} 
                    onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
                    className="hidden" 
                  />
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-600 to-blue-500 border border-cyan-400 mb-2 shadow-[0_0_15px_rgba(8,145,178,0.5)]"></div>
                  <span className="font-semibold text-white">Ocean Mode</span>
                </label>
                
                <label className={`flex flex-col items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition-all ${settings.theme === 'forest' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 hover:border-slate-600 bg-slate-800/30'}`}>
                  <input 
                    type="radio" 
                    name="theme" 
                    value="forest" 
                    checked={settings.theme === 'forest'} 
                    onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
                    className="hidden" 
                  />
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 border border-emerald-400 mb-2 shadow-[0_0_15px_rgba(5,150,105,0.5)]"></div>
                  <span className="font-semibold text-white">Forest Mode</span>
                </label>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
