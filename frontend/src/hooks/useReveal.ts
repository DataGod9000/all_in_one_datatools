import { useEffect, useRef, RefObject } from 'react';

/**
 * Intersection Observer: adds .visible to the element when it enters the viewport.
 * Use with .reveal, .reveal-scale, .reveal-left, .reveal-blur in animation-patterns.css.
 */
export function useReveal<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options?: { rootMargin?: string; threshold?: number }
) {
  const rootMargin = options?.rootMargin ?? '0px 0px -40px 0px';
  const threshold = options?.threshold ?? 0.1;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin, threshold]);
}
