import { useState, useEffect } from 'react';

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

export const MOCK_MODS_CURSEFORGE: ModData[] = [
  { id: '101', name: 'Just Enough Items (JEI)', author: 'mezz', summary: 'Item and Recipe viewing mod for Minecraft, built from the ground up for stability and performance.', icon: 'https://avatars.githubusercontent.com/u/10041838?s=200&v=4', platform: 'curseforge' },
  { id: '102', name: 'Mouse Tweaks', author: 'YaLTeR', summary: 'Replaces the standard RMB dragging mechanic, adds two new LMB dragging mechanics and an ability to quickly move items with the scroll wheel.', icon: 'https://avatars.githubusercontent.com/u/799496?s=200&v=4', platform: 'curseforge' },
  { id: '103', name: 'AppleSkin', author: 'squeek502', summary: 'Food/hunger-related HUD improvements', icon: 'https://avatars.githubusercontent.com/u/983918?s=200&v=4', platform: 'curseforge' },
];

export default function ModBrowser({ 
  onClose, 
  installedMods, 
  downloadingMods,
  onToggleInstall,
  itemType = 'mod'
}: { 
  onClose: () => void, 
  installedMods: Record<string, ModData>,
  downloadingMods: Record<string, boolean>,
  onToggleInstall: (mod: ModData) => void,
  itemType?: 'mod' | 'resourcepack' | 'shader'
}) {
  const [platform, setPlatform] = useState<'modrinth' | 'curseforge'>('modrinth');
  const [searchQuery, setSearchQuery] = useState('');
  const [modrinthMods, setModrinthMods] = useState<ModData[]>([]);
  const [curseforgeMods, setCurseforgeMods] = useState<ModData[]>([]);
  const [, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchMods = async () => {
      setIsLoading(true);
      try {
        if (platform === 'modrinth') {
          const query = searchQuery ? `&query=${encodeURIComponent(searchQuery)}` : '';
          const res = await fetch(`https://api.modrinth.com/v2/search?limit=15&facets=[["project_type:${itemType}"]]${query}`);
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
          const res = await fetch(`https://api.curse.tools/v1/cf/mods/search?gameId=432&classId=${classId}&pageSize=15${query}`);
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
  }, [platform, searchQuery]);

  const displayedMods = platform === 'modrinth' ? modrinthMods : curseforgeMods;

  return (
    <>
      <div className="mod-drawer-overlay" onClick={onClose} />
      <div className="mod-drawer">
        <div className="mod-drawer-header">
          <div className="mod-drawer-title">
            <h2>
              {itemType === 'resourcepack' ? 'Ressourcenpakete hinzufügen' : 
               itemType === 'shader' ? 'Shader-Pakete hinzufügen' : 
               'Mods hinzufügen'}
            </h2>
            <button className="close-btn" onClick={onClose}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          <div className="platform-toggle">
            <button 
              className={`platform-btn ${platform === 'modrinth' ? 'active modrinth' : ''}`}
              onClick={() => setPlatform('modrinth')}
            >
              Modrinth
            </button>
            <button 
              className={`platform-btn ${platform === 'curseforge' ? 'active curseforge' : ''}`}
              onClick={() => setPlatform('curseforge')}
            >
              CurseForge
            </button>
          </div>
          
          <input 
            type="text" 
            className="search-bar" 
            placeholder={`${platform === 'modrinth' ? 'Modrinth' : 'CurseForge'} durchsuchen...`} 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="mod-list">
          {displayedMods.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '20px' }}>
              Keine Mods gefunden.
            </div>
          )}
          
          {displayedMods.map(mod => (
            <div key={mod.id} className="mod-item">
              <img src={mod.icon} alt={mod.name} className="mod-icon" />
              <div className="mod-info">
                <div className="mod-name">{mod.name}</div>
                <div className="mod-author">by {mod.author}</div>
                <div className="mod-summary">{mod.summary}</div>
                <button 
                  className={`install-btn ${installedMods[mod.id] ? 'installed' : ''}`}
                  onClick={() => onToggleInstall(mod)}
                  disabled={downloadingMods[mod.id]}
                >
                  {downloadingMods[mod.id] ? 'Lade...' : installedMods[mod.id] ? 'Installiert ✓' : 'Installieren'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
