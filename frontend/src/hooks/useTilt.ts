import { useEffect, useRef, RefObject } from 'react';

/**
 * 3D tilt on hover — adds depth to cards/panels.
 * Use on a wrapper element; it applies transformStyle and mouse-based rotateX/rotateY.
 */
export function useTilt<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options?: { maxDeg?: number }
) {
  const maxDeg = options?.maxDeg ?? 10;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.transformStyle = 'preserve-3d';
    el.style.perspective = '1000px';

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `rotateY(${x * maxDeg}deg) rotateX(${-y * maxDeg}deg)`;
    };

    const onLeave = () => {
      el.style.transform = 'rotateY(0) rotateX(0)';
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [ref, maxDeg]);
}
