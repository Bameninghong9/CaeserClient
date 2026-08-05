import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

const btnStyle = {
  background: 'none',
  border: 'none',
  color: '#ccc',
  cursor: 'pointer',
  fontSize: '14px'
};

export default function Logs() {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const unlistens: (() => void)[] = [];

    const setupListeners = async () => {
      const logUnlisten = await listen<string>('game-log', (event) => {
        if (!logContainerRef.current) return;
        
        const line = document.createElement('div');
        line.style.margin = '0';
        line.style.padding = '2px 0';
        line.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
        
        const msg = event.payload;
        if (msg.includes('[WARN]')) {
          line.style.color = '#d7ba7d';
        } else if (msg.includes('[ERROR]') || msg.toLowerCase().includes('exception')) {
          line.style.color = '#f44747';
        } else if (msg.includes('[INFO]')) {
          line.style.color = '#4fc1ff';
        } else {
          line.style.color = '#cccccc';
        }
        
        line.textContent = msg;
        logContainerRef.current.appendChild(line);
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      });
      unlistens.push(logUnlisten);

      const exitUnlisten = await listen('game-exit', () => {
        if (!logContainerRef.current) return;
        const line = document.createElement('div');
        line.style.color = '#cccccc';
        line.textContent = "\n[SYSTEM] Game exited. This window can now be closed.";
        logContainerRef.current.appendChild(line);
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      });
      unlistens.push(exitUnlisten);
    };

    setupListeners();

    return () => {
      unlistens.forEach(unlisten => unlisten());
    };
  }, []);

  return (
    <div style={{
      margin: 0,
      padding: 0,
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4',
      fontFamily: "'Consolas', 'Courier New', monospace",
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div data-tauri-drag-region style={{
        height: '30px',
        background: '#2d2d2d',
        userSelect: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 10px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
      }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#cccccc', pointerEvents: 'none' }}>
          Minecraft Live Logs
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={btnStyle} onClick={() => appWindow.minimize()}>_</button>
          <button style={btnStyle} onClick={() => appWindow.toggleMaximize()}>☐</button>
          <button style={{ ...btnStyle, color: '#ff5f56' }} onClick={() => appWindow.close()}>X</button>
        </div>
      </div>
      
      <div ref={logContainerRef} style={{
        flex: 1,
        padding: '10px',
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        fontSize: '13px',
        lineHeight: 1.4
      }}>
        <div style={{ color: '#4fc1ff' }}>CaeserClient Log Console initialized.</div>
      </div>
    </div>
  );
}
