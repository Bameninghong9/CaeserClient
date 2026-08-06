import { useEffect, useState, useRef, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
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

interface InstanceInfo {
  instance_id: string;
  profile_name: string;
  username: string;
  start_time: string;
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
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  
  // Dictionary of logs per instance
  const [logsDict, setLogsDict] = useState<Record<string, LogEntry[]>>({});
  
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

  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (startTimeStr: string) => {
    try {
      const startMs = new Date(startTimeStr).getTime();
      const diffMs = Math.max(0, nowMs - startMs);
      const s = Math.floor((diffMs / 1000) % 60);
      const m = Math.floor((diffMs / (1000 * 60)) % 60);
      const h = Math.floor(diffMs / (1000 * 60 * 60));
      if (h > 0) return `${h}h ${m}m ${s}s`;
      return `${m}m ${s}s`;
    } catch {
      return '';
    }
  };

  useEffect(() => {
    let unlistens: (() => void)[] = [];
    
    // Instead of interval flushing, we'll just use a small buffer per instance to prevent re-renders
    let logBuffer: Record<string, LogEntry[]> = {};
    let flushTimeout: any = null;

    const flushLogs = () => {
      if (Object.keys(logBuffer).length > 0) {
        const currentBuffer = logBuffer;
        logBuffer = {};
        setLogsDict(prev => {
          const next = { ...prev };
          for (const [iId, newLogs] of Object.entries(currentBuffer)) {
            const combined = [...(next[iId] || []), ...newLogs];
            // Keep last 5000 lines
            next[iId] = combined.length > 5000 ? combined.slice(combined.length - 5000) : combined;
          }
          return next;
        });
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
      const logUnlisten = await listen<{ instance_id: string, line: string }>('game-log', (event) => {
        const { instance_id, line } = event.payload;
        if (!logBuffer[instance_id]) logBuffer[instance_id] = [];
        logBuffer[instance_id].push(parseLogLine(line));
        
        if (!flushTimeout) {
          flushTimeout = setTimeout(flushLogs, 50);
        }
      });
      unlistens.push(logUnlisten);

      const startUnlisten = await listen<InstanceInfo>('instance-started', (event) => {
        setInstances(prev => {
          // check if exists
          if (prev.find(i => i.instance_id === event.payload.instance_id)) return prev;
          return [...prev, event.payload];
        });
        setLogsDict(prev => ({
          ...prev,
          [event.payload.instance_id]: [{
            id: nextLogId++,
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
            level: 'SYSTEM',
            content: '--- Game Started ---',
            raw: 'Started'
          }]
        }));
        setActiveInstanceId(prev => prev ? prev : event.payload.instance_id);
      });
      unlistens.push(startUnlisten);

      const stopUnlisten = await listen<{ instance_id: string }>('instance-stopped', (event) => {
        const stoppedId = event.payload.instance_id;
        
        // Add stopped log
        if (!logBuffer[stoppedId]) logBuffer[stoppedId] = [];
        logBuffer[stoppedId].push({
          id: nextLogId++,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          level: 'SYSTEM',
          content: '--- Game Exited ---',
          raw: 'Exited'
        });
        if (!flushTimeout) flushTimeout = setTimeout(flushLogs, 50);

        setInstances(prev => {
          const next = prev.filter(i => i.instance_id !== stoppedId);
          if (next.length === 0) {
            // Close the window if no instances left
            appWindow.close();
          } else {
            // If active was closed, switch to another
            setActiveInstanceId(curr => curr === stoppedId ? next[0].instance_id : curr);
          }
          return next;
        });
      });
      unlistens.push(stopUnlisten);
    };

    setupListeners();

    return () => {
      unlistens.forEach(unlisten => unlisten());
      if (flushTimeout) clearTimeout(flushTimeout);
    };
  }, []);

  const activeLogs = activeInstanceId ? (logsDict[activeInstanceId] || []) : [];

  useEffect(() => {
    if (following && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activeLogs, following]);

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
    return activeLogs.filter(log => {
      if (log.level !== 'UNKNOWN' && log.level !== 'SYSTEM' && !filters[log.level]) return false;
      if (search && !log.raw.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [activeLogs, filters, search]);

  const clearLogs = () => {
    if (activeInstanceId) {
      setLogsDict(prev => ({ ...prev, [activeInstanceId]: [] }));
    }
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
      <div data-tauri-drag-region 
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            getCurrentWindow().startDragging();
          }
        }}
        style={{
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
          <button style={btnStyle} onClick={() => invoke('minimize_window')} className="window-hover">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button style={btnStyle} onClick={() => invoke('maximize_window')} className="window-hover">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
          </button>
          <button style={{ ...btnStyle }} onClick={() => invoke('close_window')} className="window-hover-close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Area (Logs) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e2229' }}>
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
              background: '#0d1117',
              userSelect: 'text'
            }}
            className="custom-scrollbar"
          >
            {activeInstanceId ? (
              filteredLogs.length > 0 ? (
                filteredLogs.map(log => (
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
                ))
              ) : (
                <div style={{ color: '#555', fontStyle: 'italic', padding: '10px' }}>Keine Logs gefunden.</div>
              )
            ) : (
              <div style={{ color: '#555', fontStyle: 'italic', padding: '10px' }}>Warte auf Spielstart...</div>
            )}
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
                {activeLogs.length} LINES
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
            </div>
          </div>
        </div>
        
        {/* Right Sidebar (Instances) */}
        <div style={{
          width: '260px',
          background: '#0d1117',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '15px',
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#1a70ff',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid #1e2229'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 14H7v-2h2v2zm0-4H7V8h2v2zm4 4h-2v-2h2v2zm0-4h-2V8h2v2zm4 4h-2v-2h2v2zm0-4h-2V8h2v2z"/></svg>
            INSTANZEN
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }} className="custom-scrollbar">
            {instances.length === 0 ? (
              <div style={{ color: '#555', fontStyle: 'italic', fontSize: '11px', textAlign: 'center', marginTop: '20px' }}>
                Keine aktiven Instanzen
              </div>
            ) : (
              instances.map(inst => {
                const isActive = activeInstanceId === inst.instance_id;
                return (
                  <div 
                    key={inst.instance_id}
                    onClick={() => setActiveInstanceId(inst.instance_id)}
                    style={{
                      background: isActive ? 'rgba(26, 112, 255, 0.1)' : 'transparent',
                      border: isActive ? '1px solid #1a70ff' : '1px solid #1e2229',
                      borderRadius: '6px',
                      padding: '12px',
                      marginBottom: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                    className="instance-card"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '13px' }}>
                        {inst.profile_name}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: '#8b949e', fontFamily: 'monospace' }}>
                          {formatUptime(inst.start_time)}
                        </span>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2ea043', boxShadow: '0 0 5px #2ea043' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#8b949e' }}>
                      <img 
                        src={`https://minotar.net/helm/${inst.username}/16.png`} 
                        alt="avatar" 
                        style={{ width: '16px', height: '16px', borderRadius: '2px', imageRendering: 'pixelated' }}
                        onError={(e) => { e.currentTarget.src = 'https://minotar.net/helm/MHF_Steve/16.png'; }}
                      />
                      {inst.username}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          <div style={{
            padding: '15px',
            borderTop: '1px solid #1e2229',
            fontSize: '11px',
            color: '#8b949e',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>{instances.length} LÄUFT</span>
          </div>
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
        .instance-card:hover { border-color: #4fc1ff !important; }
      `}</style>
    </div>
  );
}
