import { useState, useEffect, useCallback } from "react";
import ProductCard from "./ProductCard";
import type { CarouselProduct } from "./carouselData";
import { useLanguage } from '../../../LanguageContext';

interface ProductCarouselProps {
  products: CarouselProduct[];
}

export default function ProductCarousel({ products }: ProductCarouselProps) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState(0);
  const n = products.length;

  const prev = useCallback(() => setCurrent((c) => (c - 1 + n) % n), [n]);
  const next = useCallback(() => setCurrent((c) => (c + 1) % n), [n]);

  /* Keyboard navigation */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next]);

  /* Auto-advance every 4 s (pauses on hover via state) */
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 4000);
    return () => clearInterval(id);
  }, [paused, next]);

  function getOffset(i: number) {
    let offset = ((i - current) % n + n) % n;
    if (offset > n / 2) offset -= n;
    return offset;
  }

  return (
    <div
      className="w-full py-12 px-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-6xl mx-auto text-center">

        {/* Header */}
        <p className="font-mono text-2xl text-highland-gold uppercase tracking-[0.2em] mb-6">
          {t('carousel.subtitle')}
        </p>

        <h2 className="font-heading font-black text-5xl md:text-6xl text-obsidian dark:text-white mb-6 tracking-tight">
          {t('carousel.title')}
        </h2>

        <p className="text-slate-700 dark:text-slate-300 max-w-5xl mx-auto text-2xl leading-relaxed mb-14">
          {t('carousel.desc')}
        </p>

        {/* Carousel */}
        <div className="relative flex items-center justify-center">

          {/* Left arrow */}
          <button
            className="absolute left-0 z-30 w-11 h-11 rounded-full bg-white border border-[#d4c4a0]
                       flex items-center justify-center text-[#5a4020] text-xl shadow-md
                       hover:bg-[#f5ede0] hover:border-[#a07832] hover:scale-110
                       transition-all duration-200 focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-[#a07832]"
            onClick={prev}
            aria-label="Previous product"
          >
            ←
          </button>

          {/* Track */}
          <div className="relative w-full h-[520px]" aria-live="polite" aria-atomic="true">
            {products.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                offset={getOffset(i)}
                total={n}
                onClick={() => setCurrent(i)}
              />
            ))}
          </div>

          {/* Right arrow */}
          <button
            className="absolute right-0 z-30 w-11 h-11 rounded-full bg-white border border-[#d4c4a0]
                       flex items-center justify-center text-[#5a4020] text-xl shadow-md
                       hover:bg-[#f5ede0] hover:border-[#a07832] hover:scale-110
                       transition-all duration-200 focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-[#a07832]"
            onClick={next}
            aria-label="Next product"
          >
            →
          </button>
        </div>

        {/* Dots */}
        <div className="flex gap-1 justify-center mt-8" role="tablist" aria-label="Product navigation">
          {products.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === current}
              aria-label={`Go to ${p.name}`}
              onClick={() => setCurrent(i)}
              className="group w-6 h-6 flex items-center justify-center border-none p-0 bg-transparent cursor-pointer transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a07832] rounded-full"
            >
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === current
                  ? "bg-[#a07832] scale-[1.4]"
                  : "bg-[#c8b890] group-hover:bg-[#a07832]/60"
              }`} />
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
