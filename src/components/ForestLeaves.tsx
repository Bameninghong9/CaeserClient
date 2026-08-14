import { useMemo } from 'react';

export default function ForestLeaves() {
  const leaves = useMemo(() => {
    return Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: Math.random() * 6 + 6, // 6s to 12s falling
      delay: Math.random() * 10,
      size: Math.random() * 10 + 6, // 6px to 16px
      opacity: Math.random() * 0.5 + 0.3
    }));
  }, []);

  return (
    <div style={{ zIndex: 0, pointerEvents: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
      {leaves.map(leaf => (
        <div
          key={leaf.id}
          className="forest-leaf"
          style={{
            left: `${leaf.left}%`,
            width: `${leaf.size}px`,
            height: `${leaf.size}px`,
            animationDuration: `${leaf.duration}s`,
            animationDelay: `${leaf.delay}s`,
            opacity: leaf.opacity
          }}
        />
      ))}
    </div>
  );
}
