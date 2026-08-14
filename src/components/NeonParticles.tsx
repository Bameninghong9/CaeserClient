import { useMemo } from 'react';

export default function NeonParticles() {
  const particles = useMemo(() => {
    return Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: Math.random() * 8 + 4, // 4s to 12s floating up
      delay: Math.random() * 10,
      size: Math.random() * 4 + 2, // 2px to 6px
      opacity: Math.random() * 0.6 + 0.2
    }));
  }, []);

  return (
    <div style={{ zIndex: 0, pointerEvents: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
      {particles.map(p => (
        <div
          key={p.id}
          className="neon-particle"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            opacity: p.opacity
          }}
        />
      ))}
    </div>
  );
}
