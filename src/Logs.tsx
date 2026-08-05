import { useEffect, useState, useRef, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './index.css';

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' | 'SYSTEM' | 'UNKNOWN';

interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  content: string;
  raw: string;
}

const btnStyle = {
  background: 'none',
  border: 'none',
  color: '#8b949e',
  cursor: 'pointer',
  fontSize: '14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px',
  borderRadius: '4px'
};

const levelColors: Record<LogLevel, string> = {
  ERROR: '#f44747',
  WARN: '#d7ba7d',
  INFO: '#4fc1ff',
  DEBUG: '#1abc9c',
  TRACE: '#8b949e',
  SYSTEM: '#a8c7fa',
  UNKNOWN: '#cccccc'
};

const levelBorders: Record<LogLevel, string> = {
  ERROR: '1px solid #662222',
  WARN: '1px solid #665522',
  INFO: '1px solid #224466',
  DEBUG: '1px solid #114444',
  TRACE: '1px solid #333333',
  SYSTEM: 'none',
  UNKNOWN: 'none'
};

const levelBg: Record<LogLevel, string> = {
  ERROR: '#331111',
  WARN: '#332211',
  INFO: '#112233',
  DEBUG: '#0a2222',
  TRACE: '#1a1a1a',
  SYSTEM: 'transparent',
  UNKNOWN: 'transparent'
};

let nextLogId = 1;

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<LogLevel, boolean>>({
    ERROR: true,
    WARN: true,
    INFO: true,
    DEBUG: true,
    TRACE: true,
    SYSTEM: true,
    UNKNOWN: true
  });
  const [following, setFollowing] = useState(true);
  
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    let unlistens: (() => void)[] = [];
    let logBuffer: LogEntry[] = [];
    let flushTimeout: any = null;

    const flushLogs = () => {
      if (logBuffer.length > 0) {
        const newLogs = [...logBuffer];
        setLogs(prev => {
          const combined = [...prev, ...newLogs];
          if (combined.length > 5000) {
            return combined.slice(combined.length - 5000);
          }
          return combined;
        });
        logBuffer = [];
      }
      flushTimeout = null;
    };

    const parseLogLine = (raw: string): LogEntry => {
      let timestamp = '';
      let level: LogLevel = 'UNKNOWN';
      let content = raw;

      const timeMatch = raw.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
      if (timeMatch) {
        timestamp = timeMatch[1];
        content = raw.substring(timeMatch[0].length).trim();
      } else {
        const now = new Date();
        timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      }

      const up = raw.toUpperCase();
      if (up.includes('[ERROR]') || up.includes('EXCEPTION')) level = 'ERROR';
      else if (up.includes('[WARN]')) level = 'WARN';
      else if (up.includes('[INFO]')) level = 'INFO';
      else if (up.includes('[DEBUG]')) level = 'DEBUG';
      else if (up.includes('[TRACE]')) level = 'TRACE';
      else if (up.includes('[SYSTEM]')) level = 'SYSTEM';
      
      if (level === 'UNKNOWN') {
        if (up.includes('/ERROR]')) level = 'ERROR';
        else if (up.includes('/WARN]')) level = 'WARN';
        else if (up.includes('/INFO]')) level = 'INFO';
        else if (up.includes('/DEBUG]')) level = 'DEBUG';
        else if (up.includes('/TRACE]')) level = 'TRACE';
        else level = 'INFO'; 
      }

      return {
        id: nextLogId++,
        timestamp,
        level,
        content,
        raw
      };
    };

    const setupListeners = async () => {
      const logUnlisten = await listen<string>('game-log', (event) => {
        logBuffer.push(parseLogLine(event.payload));
        if (!flushTimeout) {
          flushTimeout = setTimeout(flushLogs, 50);
        }
      });
      unlistens.push(logUnlisten);

      const exitUnlisten = await listen('game-exit', () => {
        logBuffer.push({
          id: nextLogId++,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          level: 'SYSTEM',
          content: '--- Game Exited. This window can now be closed. ---',
          raw: '--- Game Exited ---'
        });
        if (!flushTimeout) flushTimeout = setTimeout(flushLogs, 50);
      });
      unlistens.push(exitUnlisten);
      
      setLogs([
        {
          id: nextLogId++,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          level: 'SYSTEM',
          content: 'CaeserClient Log Console initialized. Waiting for game output...',
          raw: 'Initialized.'
        }
      ]);
    };

    setupListeners();

    return () => {
      unlistens.forEach(unlisten => unlisten());
      if (flushTimeout) clearTimeout(flushTimeout);
    };
  }, []);

  useEffect(() => {
    if (following && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, following]);

  const handleScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    if (following && !isAtBottom) {
      setFollowing(false);
    } else if (!following && isAtBottom) {
      setFollowing(true);
    }
  };

  const toggleFilter = (level: LogLevel) => {
    setFilters(prev => ({ ...prev, [level]: !prev[level] }));
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (log.level !== 'UNKNOWN' && log.level !== 'SYSTEM' && !filters[log.level]) return false;
      if (search && !log.raw.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, filters, search]);

  const clearLogs = () => {
    setLogs([]);
  };

  const FilterButton = ({ level, label }: { level: LogLevel, label: string }) => {
    const active = filters[level];
    return (
      <button 
        onClick={() => toggleFilter(level)}
        style={{
          background: active ? levelBg[level] : 'transparent',
          border: active ? levelBorders[level] : '1px solid #1e2229',
          color: active ? levelColors[level] : '#555',
          padding: '4px 12px',
          borderRadius: '2px',
          fontSize: '11px',
          fontWeight: 'bold',
          cursor: 'pointer',
          outline: 'none',
          transition: 'all 0.2s ease',
          boxShadow: active ? `0 0 5px ${levelBg[level]}` : 'none'
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{
      margin: 0,
      padding: 0,
      backgroundColor: '#0a0e14',
      color: '#d4d4d4',
      fontFamily: "'Consolas', 'Courier New', monospace",
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div data-tauri-drag-region style={{
        height: '40px',
        background: '#0a0e14',
        userSelect: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 15px',
        borderBottom: '1px solid #1e2229'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1a70ff', fontWeight: 'bold', fontSize: '13px', pointerEvents: 'none', letterSpacing: '1px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          MINECRAFT LOGS
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={btnStyle} onClick={() => appWindow.minimize()} className="window-hover">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button style={btnStyle} onClick={() => appWindow.toggleMaximize()} className="window-hover">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
          </button>
          <button style={{ ...btnStyle }} onClick={() => appWindow.close()} className="window-hover-close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
      
      <div style={{
        padding: '10px 15px',
        background: '#0d1117',
        borderBottom: '1px solid #1e2229',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: '8px', top: '7px', color: '#8b949e' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input 
              type="text" 
              placeholder="Logs durchsuchen..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: '#111216',
                border: '1px solid #1e2229',
                color: '#fff',
                padding: '4px 8px 4px 26px',
                borderRadius: '3px',
                fontSize: '12px',
                outline: 'none',
                width: '200px'
              }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <FilterButton level="ERROR" label="ERROR" />
            <FilterButton level="WARN" label="WARN" />
            <FilterButton level="INFO" label="INFO" />
            <FilterButton level="DEBUG" label="DEBUG" />
            <FilterButton level="TRACE" label="TRACE" />
          </div>
        </div>
        
        <button style={btnStyle} title="Settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>

      <div 
        ref={logContainerRef} 
        onScroll={handleScroll}
        style={{
          flex: 1,
          padding: '15px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          fontSize: '12px',
          lineHeight: 1.5,
          background: '#0d1117'
        }}
        className="custom-scrollbar"
      >
        {filteredLogs.map(log => (
          <div key={log.id} style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
            {log.timestamp && (
              <span style={{ color: '#4fc1ff', flexShrink: 0 }}>[{log.timestamp}]</span>
            )}
            <span style={{ 
              color: log.level === 'SYSTEM' ? '#a8c7fa' : 
                     log.level === 'ERROR' ? '#f44747' :
                     log.level === 'WARN' ? '#d7ba7d' : '#cccccc'
            }}>
              {log.content}
            </span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      <div style={{
        height: '35px',
        background: '#0a0e14',
        borderTop: '1px solid #1e2229',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 15px',
        fontSize: '11px',
        fontWeight: 'bold',
        color: '#8b949e'
      }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="4" x2="14" y2="4"></line><line x1="10" y1="4" x2="3" y2="4"></line><line x1="21" y1="12" x2="12" y2="12"></line><line x1="8" y1="12" x2="3" y2="12"></line><line x1="21" y1="20" x2="16" y2="20"></line><line x1="12" y1="20" x2="3" y2="20"></line><line x1="14" y1="2" x2="14" y2="6"></line><line x1="8" y1="10" x2="8" y2="14"></line><line x1="16" y1="18" x2="16" y2="22"></line></svg>
            {logs.length} LINES
          </div>
          
          <button 
            onClick={() => { setFollowing(!following); if (!following) logEndRef.current?.scrollIntoView(); }}
            style={{ 
              background: 'none', border: 'none', 
              color: following ? '#1a70ff' : '#8b949e', 
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' 
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
            FOLLOWING
          </button>
        </div>

        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button onClick={clearLogs} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }} className="hover-white">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            CLEAR
          </button>
          <button style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }} className="hover-white">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            UPLOAD
          </button>
        </div>
      </div>
      
      <style>{`
        .window-hover:hover { background: rgba(255,255,255,0.1); }
        .window-hover-close:hover { background: #e81123; color: white !important; }
        .hover-white:hover { color: #fff !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0d1117; border-left: 1px solid #1e2229; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #484f58; }
      `}</style>
    </div>
  );
}
