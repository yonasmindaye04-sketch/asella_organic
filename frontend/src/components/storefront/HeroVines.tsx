import React, { useRef, useCallback, useEffect, useState } from 'react';

/* ────────────────────────────────────────────────────────────────
   Interactive Vine — pushes away from the cursor / finger and
   springs back with a natural elastic bounce when released.
   ──────────────────────────────────────────────────────────────── */

interface VineProps {
  side: 'left' | 'right';
  children: React.ReactNode;
  height: string;
}

const InteractiveVine: React.FC<VineProps> = ({ side, children, height }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // Current transform values driven by pointer proximity
  const [transform, setTransform] = useState({ rotate: 0, translateX: 0 });
  const isHovering = useRef(false);

  // Idle sway handled by CSS when not interacting
  const idleAnimation = side === 'left'
    ? 'sway-left 8s ease-in-out infinite alternate'
    : 'sway-right 10s ease-in-out infinite alternate';

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();

    // Normalise pointer position within the vine's bounding box (0→1)
    const relX = (clientX - rect.left) / rect.width;   // 0 = left edge, 1 = right edge
    const relY = (clientY - rect.top) / rect.height;    // 0 = top (anchor), 1 = bottom (free tip)

    // Clamp
    const clampedX = Math.max(0, Math.min(1, relX));
    const clampedY = Math.max(0, Math.min(1, relY));

    // Physics: the further DOWN the vine, the more it can swing (like a real hanging vine)
    const leverage = clampedY;                           // 0 at anchor, 1 at tip

    // Push AWAY from the cursor horizontally
    // If cursor is on the right half of the vine → push left (negative rotation)
    const pushDirection = side === 'left'
      ? (clampedX - 0.4)   // push outward from center-left
      : -(clampedX - 0.6); // push outward from center-right

    const rotateDeg = pushDirection * leverage * 18;     // max ≈ ±18°
    const translatePx = pushDirection * leverage * 12;   // max ≈ ±12px

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      setTransform({ rotate: rotateDeg, translateX: translatePx });
    });
  }, [side]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    isHovering.current = true;
    handlePointerMove(e.clientX, e.clientY);
  }, [handlePointerMove]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    isHovering.current = true;
    const touch = e.touches[0];
    if (touch) handlePointerMove(touch.clientX, touch.clientY);
  }, [handlePointerMove]);

  const handlePointerLeave = useCallback(() => {
    isHovering.current = false;
    // Spring back to rest
    setTransform({ rotate: 0, translateX: 0 });
  }, []);

  // Clean up any pending rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const isInteracting = transform.rotate !== 0 || transform.translateX !== 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handlePointerLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={handlePointerLeave}
      className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} w-[150px] md:w-[250px] lg:w-[350px] ${height} z-[1] opacity-40 dark:opacity-20 cursor-pointer`}
      style={{
        transformOrigin: 'top center',
        // When interacting → use JS-driven transform; otherwise → CSS idle sway
        animation: isInteracting ? 'none' : idleAnimation,
        transform: isInteracting
          ? `rotate(${transform.rotate}deg) translateX(${transform.translateX}px)`
          : undefined,
        // Bouncy spring-back when releasing (cubic-bezier overshoots slightly)
        transition: isInteracting
          ? 'transform 0.08s ease-out'
          : 'transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      {children}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────
   HeroVines — the two decorative vine SVGs
   ──────────────────────────────────────────────────────────────── */

const HeroVines: React.FC = () => {
  return (
    <>
      {/* Left Vine */}
      <InteractiveVine side="left" height="h-[600px]">
        <svg viewBox="0 0 200 600" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-2xl">
          {/* Main stem */}
          <path d="M50 0 Q 30 150, 70 300 T 50 600" className="stroke-obsidian dark:stroke-[#3a5c3a]" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M80 0 Q 110 100, 60 250 T 100 500" className="stroke-obsidian dark:stroke-[#3a5c3a]" strokeWidth="4" fill="none" strokeLinecap="round" />
          
          {/* Leaves for main stem */}
          <path d="M55 50 Q 80 40, 90 60 Q 70 70, 55 50" className="fill-highland-gold" />
          <path d="M45 100 Q 20 90, 10 110 Q 30 120, 45 100" className="fill-highland-gold" />
          <path d="M60 180 Q 90 160, 105 185 Q 80 200, 60 180" className="fill-highland-gold" />
          <path d="M55 280 Q 25 270, 15 295 Q 40 310, 55 280" className="fill-highland-gold" />
          <path d="M65 380 Q 95 370, 105 395 Q 80 410, 65 380" className="fill-highland-gold" />
          <path d="M55 480 Q 25 470, 15 495 Q 40 510, 55 480" className="fill-highland-gold" />
          <path d="M52 560 Q 75 550, 85 570 Q 65 580, 52 560" className="fill-highland-gold" />

          {/* Leaves for secondary stem */}
          <path d="M90 80 Q 115 70, 125 90 Q 105 100, 90 80" className="fill-highland-gold" />
          <path d="M75 160 Q 50 150, 40 170 Q 60 180, 75 160" className="fill-highland-gold" />
          <path d="M70 240 Q 95 230, 105 250 Q 85 260, 70 240" className="fill-highland-gold" />
          <path d="M85 340 Q 110 330, 120 350 Q 100 360, 85 340" className="fill-highland-gold" />
          <path d="M90 440 Q 65 430, 55 450 Q 75 460, 90 440" className="fill-highland-gold" />
        </svg>
      </InteractiveVine>

      {/* Right Vine */}
      <InteractiveVine side="right" height="h-[650px]">
        <svg viewBox="0 0 200 650" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-2xl">
          {/* Main stem */}
          <path d="M150 0 Q 180 150, 130 300 T 160 650" className="stroke-obsidian dark:stroke-[#3a5c3a]" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M120 0 Q 90 100, 140 250 T 100 550" className="stroke-obsidian dark:stroke-[#3a5c3a]" strokeWidth="5" fill="none" strokeLinecap="round" />
          
          {/* Leaves for main stem */}
          <path d="M145 60 Q 120 50, 110 70 Q 130 80, 145 60" className="fill-highland-gold" />
          <path d="M158 120 Q 185 110, 195 130 Q 175 140, 158 120" className="fill-highland-gold" />
          <path d="M140 200 Q 110 180, 95 205 Q 120 220, 140 200" className="fill-highland-gold" />
          <path d="M138 300 Q 168 290, 178 315 Q 153 330, 138 300" className="fill-highland-gold" />
          <path d="M145 420 Q 115 410, 105 435 Q 130 450, 145 420" className="fill-highland-gold" />
          <path d="M150 520 Q 180 510, 190 535 Q 165 550, 150 520" className="fill-highland-gold" />
          <path d="M155 600 Q 130 590, 120 610 Q 140 620, 155 600" className="fill-highland-gold" />

          {/* Leaves for secondary stem */}
          <path d="M110 90 Q 85 80, 75 100 Q 95 110, 110 90" className="fill-highland-gold" />
          <path d="M125 180 Q 150 170, 160 190 Q 140 200, 125 180" className="fill-highland-gold" />
          <path d="M135 270 Q 110 260, 100 280 Q 120 290, 135 270" className="fill-highland-gold" />
          <path d="M115 370 Q 90 360, 80 380 Q 100 390, 115 370" className="fill-highland-gold" />
          <path d="M105 480 Q 130 470, 140 490 Q 120 500, 105 480" className="fill-highland-gold" />
        </svg>
      </InteractiveVine>
    </>
  );
};

export default HeroVines;
