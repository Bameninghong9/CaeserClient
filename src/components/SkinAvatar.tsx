import { useEffect, useRef } from 'react';

export default function SkinAvatar({ skinUrl, size = 32 }: { skinUrl: string | null, size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!skinUrl || !canvasRef.current) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = canvasRef.current!.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
    };
    img.src = skinUrl;
  }, [skinUrl, size]);

  if (!skinUrl) {
    return <div style={{ width: size, height: size }} className="bg-white/10 rounded-md border border-accent" />;
  }

  return <canvas ref={canvasRef} width={size} height={size} className="rounded-md border border-accent" style={{ imageRendering: 'pixelated', width: size, height: size }} />;
}
