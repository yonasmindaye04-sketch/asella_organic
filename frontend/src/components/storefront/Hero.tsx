import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { openOrderModal } from '../../store/slices/uiSlice';
import { useLanguage } from '../../LanguageContext';

const Hero: React.FC = () => {
  const dispatch = useDispatch();
  const { t } = useLanguage();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <section 
      id="hero"
      onMouseMove={handleMouseMove}
      className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden bg-parchment dark:bg-[#121212] py-12 lg:py-16" 
    >
      {/* Interactive Gold Glow that follows the mouse */}
      <div 
        className="pointer-events-none absolute inset-0 transition-opacity duration-300 z-0"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(197,160,89,0.12), transparent 40%)`
        }}
      />

      <div className="relative z-10 w-[95%] max-w-[1600px] mx-auto text-center flex flex-col items-center">
        
        {/* Title */}
        <h1 className="font-serif text-4xl md:text-5xl lg:text-7xl xl:text-[90px] leading-[1.05] mb-6 font-extrabold tracking-tight drop-shadow-md transition-all duration-300 hover:scale-105 hover:drop-shadow-2xl cursor-default">
          <span className="text-obsidian dark:text-white block">{t('hero.title1')}</span>
          <span className="text-highland-gold block mt-1">{t('hero.title2')}</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-xl lg:text-2xl xl:text-3xl text-obsidian dark:text-white mb-14 lg:mb-16 max-w-4xl mx-auto font-medium leading-relaxed">
          {t('hero.subtitle')}
        </p>

        {/* Buttons */}
        <div className="flex flex-col md:flex-row justify-center items-center gap-4 lg:gap-6 mb-14 lg:mb-20 w-full max-w-4xl mx-auto px-4 md:px-0">
          
          <button onClick={() => dispatch(openOrderModal({ mode: 'sales' }))} className="w-full max-w-[280px] md:max-w-none md:w-auto flex-1 px-6 py-3.5 lg:px-10 lg:py-4 bg-obsidian text-parchment rounded-full font-bold text-base md:text-sm lg:text-base hover:bg-obsidian-mid transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 lg:gap-3 animate-bounce">
            <span className="material-symbols-outlined text-base lg:text-xl">shopping_cart</span>
            {t('hero.btn.order')}
          </button>

          <a href="#story" className="w-full max-w-[280px] md:max-w-none md:w-auto flex-1 px-6 py-3.5 lg:px-10 lg:py-4 bg-obsidian text-parchment rounded-full font-bold text-base md:text-sm lg:text-base hover:bg-obsidian-mid hover:-translate-y-1 transition-all shadow-lg flex items-center justify-center gap-2 lg:gap-3">
            <span className="material-symbols-outlined text-base lg:text-xl">info</span>
            {t('hero.btn.about')}
          </a>

          <button onClick={() => dispatch(openOrderModal({ mode: 'franchise' }))} className="w-full max-w-[280px] md:max-w-none md:w-auto flex-1 px-6 py-3.5 lg:px-10 lg:py-4 bg-obsidian text-parchment rounded-full font-bold text-base md:text-sm lg:text-base hover:bg-obsidian-mid hover:-translate-y-1 transition-all shadow-lg flex items-center justify-center gap-2 lg:gap-3">
            <span className="material-symbols-outlined text-base lg:text-xl">inventory_2</span>
            {t('hero.btn.bulk')}
          </button>
        </div>

        {/* Stats Bar */}
        <div className="bg-white dark:bg-obsidian backdrop-blur-md rounded-[32px] shadow-sm border border-border py-4 lg:py-5 px-6 lg:px-10 w-full max-w-[80rem] mx-auto">
          <div className="flex flex-wrap justify-between items-center gap-x-6 lg:gap-x-10 gap-y-6">
            
            {/* Stat 1 */}
            <div className="flex flex-1 min-w-[200px] justify-center items-center gap-4">
              <div className="w-14 h-14 bg-highland-gold/10 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px] text-highland-gold" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
              </div>
              <div className="text-left">
                <div className="text-3xl lg:text-4xl font-extrabold text-obsidian dark:text-white leading-none">17+</div>
                <div className="text-base lg:text-lg font-bold text-obsidian dark:text-white mt-1.5 tracking-widest uppercase">{t('hero.stat.products')}</div>
              </div>
            </div>

            {/* Stat 2 */}
            <div className="flex flex-1 min-w-[200px] justify-center items-center gap-4">
              <div className="w-14 h-14 bg-highland-gold/10 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px] text-highland-gold" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
              </div>
              <div className="text-left">
                <div className="text-3xl lg:text-4xl font-extrabold text-obsidian dark:text-white leading-none">5000+</div>
                <div className="text-base lg:text-lg font-bold text-obsidian dark:text-white mt-1.5 tracking-widest uppercase">{t('hero.stat.customers')}</div>
              </div>
            </div>

            {/* Stat 3 */}
            <div className="flex flex-1 min-w-[200px] justify-center items-center gap-4">
              <div className="w-14 h-14 bg-highland-gold/10 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px] text-highland-gold" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              </div>
              <div className="text-left">
                <div className="text-3xl lg:text-4xl font-extrabold text-obsidian dark:text-white leading-none">100%</div>
                <div className="text-base lg:text-lg font-bold text-obsidian dark:text-white mt-1.5 tracking-widest uppercase">{t('hero.stat.natural')}</div>
              </div>
            </div>

            {/* Stat 4 */}
            <div className="flex flex-1 min-w-[200px] justify-center items-center gap-4">
              <div className="w-14 h-14 bg-highland-gold/10 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px] text-highland-gold" style={{ fontVariationSettings: "'FILL' 1" }}>agriculture</span>
              </div>
              <div className="text-left">
                <div className="text-3xl lg:text-4xl font-extrabold text-obsidian dark:text-white leading-none">10</div>
                <div className="text-base lg:text-lg font-bold text-obsidian dark:text-white mt-1.5 tracking-widest uppercase">{t('hero.stat.farms')}</div>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Background Blobs */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[15%] left-[5%] w-80 h-80 bg-highland-gold/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[10%] right-[5%] w-[28rem] h-[28rem] bg-obsidian/5 rounded-full blur-[100px]"></div>
      </div>
    </section>
  );
};

export default Hero;



