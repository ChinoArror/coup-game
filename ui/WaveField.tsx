import { useEffect, useRef } from 'react';
import { cn } from './cn';

const X_GAP = 10;
const Y_GAP = 32;
const FALLBACK_COLOR = 'oklch(68.5% 0.155 230)';

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in [0, 1]. */
function valueNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Decorative login backdrop: vertical polylines displaced by slow value noise.
 * Stroke color is the --primary token drawn at ~26% alpha. Reduced motion draws one static frame.
 */
export function WaveField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let color = FALLBACK_COLOR;
    let width = 0;
    let height = 0;
    let raf = 0;
    const start = performance.now();

    const readColor = () => {
      const value = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      return value || FALLBACK_COLOR;
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (seconds: number) => {
      context.clearRect(0, 0, width, height);
      context.strokeStyle = color;
      context.globalAlpha = 0.26;
      context.lineWidth = 1;
      for (let x = 0; x <= width + X_GAP; x += X_GAP) {
        context.beginPath();
        for (let y = -Y_GAP; y <= height + Y_GAP; y += Y_GAP) {
          const drift = valueNoise(x * 0.012 + seconds * 0.05, y * 0.01 + seconds * 0.03);
          const px = x + (drift - 0.5) * 46;
          if (y === -Y_GAP) context.moveTo(px, y);
          else context.lineTo(px, y);
        }
        context.stroke();
      }
      context.globalAlpha = 1;
    };

    const loop = (now: number) => {
      paint((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };

    const onResize = () => {
      resize();
      if (reduced) paint(0);
    };

    const observer = new MutationObserver(() => {
      color = readColor();
      if (reduced) paint(0);
    });

    color = readColor();
    resize();
    if (reduced) paint(0);
    else raf = requestAnimationFrame(loop);

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />;
}
