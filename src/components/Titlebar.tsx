import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Trash2, Plus, MonitorPlay } from 'lucide-react';
import { useAppStore } from '../store';
import SkinAvatar from './SkinAvatar';

export default function Titlebar({ 
  onLogout, 
  onLogin, 
  onOpenLogs
}: { 
  onLogout: (id: string) => void, 
  onLogin: () => void,
  onOpenLogs: () => void
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const { accounts, activeAccountId, activeSkinUrl, runningInstances, setActiveAccountId } = useAppStore();
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      if (maximized) {
        document.body.classList.add('maximized');
      } else {
        document.body.classList.remove('maximized');
      }
    });
    return () => {
      unlisten.then(f => f());
    };
  }, [appWindow]);

  const activeCreds = accounts.find((a: any) => a.id === activeAccountId) || null;

  return (
    <div data-tauri-drag-region className="drag-region h-[50px] bg-slate-900/60 backdrop-blur-md flex justify-between items-center border-b border-white/10 rounded-t-xl shrink-0 z-50">
      <div className="flex items-center pl-5 font-bold tracking-wide pointer-events-none">
        <img src="/icon.png" alt="Icon" className="w-6 h-6 rounded-md mr-3" />
        <span className="text-white text-sm">Caeser Client</span>
      </div>
      
      <div className="flex items-center h-full">
        {runningInstances > 0 && (
          <button 
            onClick={onOpenLogs}
            title="Instanzen anzeigen"
            className="no-drag flex items-center gap-1.5 mr-2.5 px-3 py-1 text-xs font-bold rounded-md bg-green-500/15 border border-green-500/40 text-green-500 transition-colors hover:bg-green-500/25"
          >
            <MonitorPlay size={14} />
            {runningInstances} {runningInstances === 1 ? 'INSTANZ' : 'INSTANZEN'}
          </button>
        )}
        
        {activeCreds && (
          <div className="no-drag relative flex items-center gap-3 px-3 py-1.5 mx-3 w-64 border border-white/15 rounded-md cursor-pointer transition-colors hover:bg-white/5" onClick={() => setDropdownOpen(!dropdownOpen)}>
            {activeSkinUrl ? (
              <SkinAvatar skinUrl={activeSkinUrl} size={32} />
            ) : (
              <img src={`https://minotar.net/helm/${activeCreds.id}/100.png`} alt="Avatar" className="w-8 h-8 rounded-md border border-accent" style={{ imageRendering: 'pixelated' }} />
            )}
            <span className="text-sm font-semibold flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{activeCreds.username}</span>
            
            {dropdownOpen && (
              <div 
                className="absolute top-[45px] -right-[1px] w-64 border border-white/10 rounded-b-lg flex flex-col z-50 shadow-2xl" 
                style={{ backgroundColor: '#0f172a' }}
                onClick={(e) => e.stopPropagation()}
              >
                {accounts.map((acc: any) => (
                  <div 
                    key={acc.id} 
                    className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors hover:bg-white/5 ${acc.id === activeAccountId ? 'border-b border-white/10 cursor-default hover:bg-transparent' : ''}`}
                    onClick={() => { setActiveAccountId(acc.id); setDropdownOpen(false); }}
                  >
                    <img src={`https://minotar.net/helm/${acc.id}/100.png`} alt="Avatar" className="w-6 h-6 rounded-md border border-accent" style={{ imageRendering: 'pixelated' }} />
                    <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">{acc.username}</span>
                    <button className="text-danger hover:bg-danger/10 p-1 rounded transition-colors" onMouseDown={(e) => { e.stopPropagation(); setDeleteAccountId(acc.id); }} onClick={(e) => e.stopPropagation()} title="Remove Account">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <div className="px-4 py-3 flex items-center gap-3 cursor-pointer text-accent hover:bg-white/5" onMouseDown={(e) => { e.stopPropagation(); onLogin(); setDropdownOpen(false); }} onClick={(e) => e.stopPropagation()}>
                  <Plus size={16} />
                  <span className="text-sm font-medium">Add Account</span>
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="flex h-full">
          <button className="no-drag w-[50px] h-full flex items-center justify-center text-accent transition-colors hover:bg-white/10" onClick={() => invoke('minimize_window')}>
            <Minus size={16} />
          </button>
          <button className="no-drag w-[50px] h-full flex items-center justify-center text-accent transition-colors hover:bg-white/10" onClick={() => invoke('maximize_window')}>
            <Square size={14} />
          </button>
          <button className="no-drag w-[50px] h-full flex items-center justify-center text-danger transition-colors hover:bg-[#e81123] hover:text-white" onClick={() => invoke('close_window')}>
            <X size={16} />
          </button>
        </div>
      </div>

      {deleteAccountId && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] animate-in fade-in duration-200">
          <div className="bg-surface border border-white/10 rounded-xl p-8 w-[400px] max-w-[90%] shadow-2xl">
            <h2 className="m-0 mb-4 text-xl font-bold">Account löschen</h2>
            <p className="text-slate-400 mb-6 text-sm">Möchtest du diesen Account wirklich entfernen? Du musst dich danach erneut anmelden.</p>
            <div className="flex justify-end gap-4">
              <button className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors" onClick={() => setDeleteAccountId(null)}>
                Abbrechen
              </button>
              <button 
                className="px-4 py-2 rounded-lg bg-danger text-white hover:bg-danger-hover transition-colors" 
                onClick={() => {
                  onLogout(deleteAccountId);
                  if (accounts.length === 1) setDropdownOpen(false);
                  setDeleteAccountId(null);
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
