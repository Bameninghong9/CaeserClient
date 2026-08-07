import { useState, useEffect } from 'react';
import { X, Download, Check } from 'lucide-react';

export interface ModData {
  id: string;
  name: string;
  author: string;
  summary: string;
  icon: string;
  platform: 'modrinth' | 'curseforge';
  version?: string;
  itemType?: string;
}

export default function ModBrowser({ 
  onClose, 
  installedMods, 
  downloadingMods,
  onToggleInstall,
  itemType = 'mod',
  gameVersion,
  loader
}: { 
  onClose: () => void, 
  installedMods: Record<string, ModData>,
  downloadingMods: Record<string, boolean | number>,
  onToggleInstall: (mod: ModData) => void,
  itemType?: 'mod' | 'resourcepack' | 'shader',
  gameVersion: string,
  loader: string
}) {
  const [platform, setPlatform] = useState<'modrinth' | 'curseforge'>('modrinth');
  const [searchQuery, setSearchQuery] = useState('');
  const [modrinthMods, setModrinthMods] = useState<ModData[]>([]);
  const [curseforgeMods, setCurseforgeMods] = useState<ModData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchMods = async () => {
      setIsLoading(true);
      try {
        if (platform === 'modrinth') {
          const query = searchQuery ? `&query=${encodeURIComponent(searchQuery)}` : '';
          
          let facets = `[["project_type:${itemType}"]]`;
          if (itemType === 'mod') {
            facets = `[["project_type:${itemType}"],["versions:${gameVersion}"],["categories:${loader.toLowerCase()}"]]`;
          } else {
             facets = `[["project_type:${itemType}"],["versions:${gameVersion}"]]`;
          }

          const res = await fetch(`https://api.modrinth.com/v2/search?limit=16&facets=${facets}${query}`);
          const data = await res.json();
          
          const mods: ModData[] = data.hits.map((hit: any) => ({
            id: hit.project_id,
            name: hit.title,
            author: hit.author,
            summary: hit.description,
            icon: hit.icon_url || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + hit.project_id,
            platform: 'modrinth',
            itemType: itemType
          }));
          
          setModrinthMods(mods);
        } else if (platform === 'curseforge') {
          const query = searchQuery ? `&searchFilter=${encodeURIComponent(searchQuery)}` : '';
          
          let classId = 6; // mods
          if (itemType === 'resourcepack') classId = 12;
          if (itemType === 'shader') classId = 6552;
          
          // gameId 432 = Minecraft
          let modLoaderType = '';
          if (itemType === 'mod') {
            if (loader.toLowerCase() === 'fabric') modLoaderType = '&modLoaderType=4';
            else if (loader.toLowerCase() === 'forge') modLoaderType = '&modLoaderType=1';
          }
          
          const res = await fetch(`https://api.curse.tools/v1/cf/mods/search?gameId=432&classId=${classId}&gameVersion=${gameVersion}${modLoaderType}&pageSize=16${query}`);
          const data = await res.json();
          
          const mods: ModData[] = data.data.map((mod: any) => ({
            id: mod.id.toString(),
            name: mod.name,
            author: mod.authors && mod.authors.length > 0 ? mod.authors[0].name : 'Unknown',
            summary: mod.summary,
            icon: (mod.logo && mod.logo.thumbnailUrl) ? mod.logo.thumbnailUrl : 'https://api.dicebear.com/7.x/identicon/svg?seed=' + mod.id,
            platform: 'curseforge',
            itemType: itemType
          }));
          
          setCurseforgeMods(mods);
        }
      } catch (e) {
        console.error(`Failed to fetch from ${platform}`, e);
      } finally {
        setIsLoading(false);
      }
    };
    
    const timer = setTimeout(fetchMods, 300);
    return () => clearTimeout(timer);
  }, [platform, searchQuery, gameVersion, loader, itemType]);

  const displayedMods = platform === 'modrinth' ? modrinthMods : curseforgeMods;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      <div className="fixed top-[50px] right-0 bottom-0 w-[800px] max-w-full bg-surface border-l border-white/10 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-6 border-b border-white/10 flex flex-col gap-5">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold m-0">
              {itemType === 'resourcepack' ? 'Ressourcenpakete' : 
               itemType === 'shader' ? 'Shader-Pakete' : 
               'Mods'} hinzufügen
            </h2>
            <button 
              className="text-slate-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors flex items-center justify-center" 
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="flex bg-black/20 p-1 rounded-lg">
            <button 
              className={`flex-1 py-2.5 rounded-md text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 ${platform === 'modrinth' ? 'bg-[#00af5c] text-white shadow-lg shadow-[#00af5c]/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              onClick={() => setPlatform('modrinth')}
            >
              Modrinth
            </button>
            <button 
              className={`flex-1 py-2.5 rounded-md text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 ${platform === 'curseforge' ? 'bg-[#f16436] text-white shadow-lg shadow-[#f16436]/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              onClick={() => setPlatform('curseforge')}
            >
              CurseForge
            </button>
          </div>
          
          <input 
            type="text" 
            className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-accent transition-colors" 
            placeholder={`${platform === 'modrinth' ? 'Modrinth' : 'CurseForge'} durchsuchen...`} 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && displayedMods.length === 0 ? (
            <div className="flex justify-center items-center h-40 text-slate-400">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : displayedMods.length === 0 ? (
            <div className="text-center text-slate-400 mt-10">
              Keine Einträge für {gameVersion} ({loader}) gefunden.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {displayedMods.map(mod => (
                <div key={mod.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4 transition-all duration-200 hover:bg-white/10 hover:-translate-y-0.5 hover:shadow-lg">
                  <img src={mod.icon} alt={mod.name} className="w-16 h-16 rounded-lg bg-black/40 object-cover shrink-0" />
                  
                  <div className="flex-1 flex flex-col min-w-0">
                    <div className="font-bold text-[15px] text-white truncate pr-2">{mod.name}</div>
                    <div className="text-xs text-slate-400 mb-1.5">by {mod.author}</div>
                    <div className="text-xs text-slate-300 line-clamp-2 leading-relaxed flex-1">{mod.summary}</div>
                    
                    <button 
                      className={`mt-3 py-1.5 px-3 rounded-md text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 self-start ${installedMods[mod.id] ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/10 hover:bg-accent hover:text-white border border-transparent'}`}
                      onClick={() => onToggleInstall(mod)}
                      disabled={!!downloadingMods[mod.id]}
                    >
                      {typeof downloadingMods[mod.id] === 'number' ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          {Math.round(downloadingMods[mod.id] as number)}%
                        </>
                      ) : downloadingMods[mod.id] ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Lade...
                        </>
                      ) : installedMods[mod.id] ? (
                        <>
                          <Check size={14} /> Installiert
                        </>
                      ) : (
                        <>
                          <Download size={14} /> Installieren
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
