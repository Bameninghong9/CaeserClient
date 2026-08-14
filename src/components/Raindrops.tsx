import { useMemo } from 'react';

export default function Raindrops() {
  const drops = useMemo(() => {
    return Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: Math.random() * 2.5 + 0.8, // Speed from 0.8s to 3.3s
      delay: Math.random() * 5, // Staggered start
      opacity: Math.random() * 0.7 + 0.3, // Opacity from 0.3 to 1.0
      thickness: Math.random() * 4 + 2 // Width from 2px to 6px
    }));
  }, []);

  return (
    <div className="raindrops-container">
      {drops.map(drop => (
        <div
          key={drop.id}
          className="raindrop"
          style={{
            left: `${drop.left}%`,
            width: `${drop.thickness}px`,
            animationDuration: `${drop.duration}s`,
            animationDelay: `${drop.delay}s`,
            opacity: drop.opacity
          }}
        />
      ))}
    </div>
  );
}
