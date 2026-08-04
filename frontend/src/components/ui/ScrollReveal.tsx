import React from 'react';
import { useScrollReveal } from '../../hooks/useScrollReveal';

type AnimationVariant =
  | 'fade-up'       // slide from bottom
  | 'fade-down'     // slide from top
  | 'fade-left'     // slide from left
  | 'fade-right'    // slide from right
  | 'fade-in'       // simple opacity
  | 'zoom-in'       // scale from smaller
  | 'zoom-in-up';   // scale + slide up

interface ScrollRevealProps {
  children: React.ReactNode;
  variant?: AnimationVariant;
  delay?: number;      // delay in ms (0, 100, 200 …)
  duration?: number;   // duration in ms, default 700
  className?: string;
  threshold?: number;
}

const baseHidden: Record<AnimationVariant, React.CSSProperties> = {
  'fade-up':      { opacity: 0, transform: 'translateY(48px)' },
  'fade-down':    { opacity: 0, transform: 'translateY(-48px)' },
  'fade-left':    { opacity: 0, transform: 'translateX(-48px)' },
  'fade-right':   { opacity: 0, transform: 'translateX(48px)' },
  'fade-in':      { opacity: 0 },
  'zoom-in':      { opacity: 0, transform: 'scale(0.92)' },
  'zoom-in-up':   { opacity: 0, transform: 'scale(0.95) translateY(32px)' },
};

const baseVisible: React.CSSProperties = {
  opacity: 1,
  transform: 'none',
};

export default function ScrollReveal({
  children,
  variant = 'fade-up',
  delay = 0,
  duration = 700,
  className = '',
  threshold = 0.12,
}: ScrollRevealProps) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>({ threshold });

  const style: React.CSSProperties = {
    transitionProperty: 'opacity, transform',
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)', // spring-like easing
    transitionDelay: `${delay}ms`,
    willChange: 'opacity, transform',
    ...(isVisible ? baseVisible : baseHidden[variant]),
  };

  return (
    <div ref={ref} style={style} className={className}>
      {children}
    </div>
  );
}
