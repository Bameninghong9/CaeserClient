import { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import './index.css';

function LogViewer() {
  const [logs, setLogs] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlistenLog = listen<string>('game-log', (event) => {
      setLogs((prev) => [...prev, event.payload]);
    });

    const unlistenExit = listen('game-exit', () => {
      setLogs((prev) => [...prev, '--- Game Exited ---']);
    });

    return () => {
      unlistenLog.then((f) => f());
      unlistenExit.then((f) => f());
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', height: '100vh', overflowY: 'auto', background: '#000', color: '#0f0', boxSizing: 'border-box' }}>
      <h2 style={{ color: '#fff', marginTop: 0 }}>Minecraft Live Logs</h2>
      {logs.map((log, i) => (
        <div key={i}>{log}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

export default LogViewer;
