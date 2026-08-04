import { useEffect, useRef, useState } from 'react';

interface UseScrollRevealOptions {
  threshold?: number;   // 0–1, how much of the element must be visible
  rootMargin?: string;  // e.g. '0px 0px -80px 0px' triggers a bit before edge
  once?: boolean;       // only animate once (recommended)
}

/**
 * Returns a ref to attach to your element, and a boolean `isVisible`
 * that becomes true once the element enters the viewport.
 */
export function useScrollReveal<T extends Element = HTMLDivElement>(
  options: UseScrollRevealOptions = {}
) {
  const { threshold = 0.12, rootMargin = '0px 0px -60px 0px', once = true } = options;
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, isVisible };
}
