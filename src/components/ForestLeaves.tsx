import { useMemo } from 'react';

export default function ForestLeaves() {
  const leaves = useMemo(() => {
    return Array.from({ length: 60 }).map((_, i) => {
      const isForeground = Math.random() > 0.6;
      return {
        id: i,
        left: Math.random() * 100,
        duration: Math.random() * 8 + 6, // 6s to 14s falling
        delay: Math.random() * 10,
        size: isForeground ? Math.random() * 15 + 10 : Math.random() * 8 + 4, // vary sizes based on depth
        opacity: isForeground ? Math.random() * 0.4 + 0.3 : Math.random() * 0.2 + 0.1,
        blur: isForeground ? 0 : Math.random() * 2 + 1, // background is blurry
        hue: Math.random() * 30 + 110 // from yellow-green (110) to pure green (140)
      };
    });
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
            background: `hsla(${leaf.hue}, 80%, 40%, ${leaf.opacity})`,
            filter: `blur(${leaf.blur}px) drop-shadow(0 0 5px hsla(${leaf.hue}, 80%, 40%, 0.4))`
          }}
        />
      ))}
    </div>
  );
}
