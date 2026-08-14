import { useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Download, RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function Updater() {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const checkForUpdates = async () => {
    try {
      setChecking(true);
      const update = await check();
      
      if (update) {
        toast(`Update ${update.version} gefunden! Lade herunter...`, { duration: 4000 });
        setDownloading(true);
        let downloaded = 0;
        let contentLength = 0;
        
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 0;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                setProgress(Math.round((downloaded / contentLength) * 100));
              }
              break;
            case 'Finished':
              setProgress(100);
              break;
          }
        });

        toast.success('Update installiert! Starte neu...', { duration: 3000 });
        setTimeout(async () => {
          await relaunch();
        }, 2000);
      } else {
        toast.success('Du bist auf der neuesten Version!', { icon: <Check size={18} /> });
      }
    } catch (e) {
      console.error(e);
      toast.error(`Fehler beim Update: ${e}`);
    } finally {
      setChecking(false);
      setDownloading(false);
      setProgress(0);
    }
  };

  return (
    <div className="mt-auto mx-3 mb-3">
      {downloading ? (
        <div className="px-3 py-2 bg-slate-800/80 rounded-lg flex flex-col gap-2 shadow-[0_4px_15px_rgba(0,0,0,0.5)]">
          <div className="text-[11px] text-white/80 font-semibold tracking-wider uppercase text-center">Update lädt</div>
          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-accent-gradient transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[10px] text-center text-white/60 font-medium">{progress}%</div>
        </div>
      ) : (
        <button
          onClick={checkForUpdates}
          disabled={checking}
          className="w-full px-3 py-2.5 flex items-center justify-center gap-2 text-xs font-medium bg-slate-800/50 hover:bg-slate-700/60 text-white/80 hover:text-white rounded-lg transition-all"
        >
          {checking ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {checking ? 'Prüfe...' : 'Auf Update prüfen'}
        </button>
      )}
    </div>
  );
}
