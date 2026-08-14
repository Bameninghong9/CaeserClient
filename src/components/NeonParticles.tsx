import { useMemo } from 'react';

export default function NeonParticles() {
  const particles = useMemo(() => {
    const neonColors = ['#a855f7', '#ec4899', '#06b6d4', '#8b5cf6'];
    return Array.from({ length: 80 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: Math.random() * 8 + 6, // 6s to 14s floating up
      delay: Math.random() * 10,
      size: Math.random() * 5 + 2, // 2px to 7px
      opacity: Math.random() * 0.6 + 0.2,
      color: neonColors[Math.floor(Math.random() * neonColors.length)]
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
            opacity: p.opacity,
            background: p.color,
            color: p.color // used for currentColor in box-shadow
          }}
        />
      ))}
    </div>
  );
}
