import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { openOrderModal } from '../../store/slices/uiSlice';

const Hero: React.FC = () => {
  const dispatch = useDispatch();
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
      className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden bg-[#FAF9F6] py-12 lg:py-16" 
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
        <h1 className="font-serif text-[48px] md:text-[70px] lg:text-[90px] xl:text-[100px] leading-[1.05] mb-6 font-extrabold tracking-tight drop-shadow-md transition-all duration-300 hover:scale-105 hover:drop-shadow-2xl cursor-default">
          <span className="text-obsidian block">Nature's Purity,</span>
          <span className="text-highland-gold block mt-1">Packaged for You.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-xl lg:text-2xl xl:text-3xl text-obsidian mb-14 lg:mb-16 max-w-4xl mx-auto font-medium leading-relaxed">
          Premium organic supplements, ethically sourced from Ethiopian farms and delivered with care.
        </p>

        {/* Buttons */}
        <div className="flex flex-col md:flex-row justify-center items-center gap-4 lg:gap-6 mb-14 lg:mb-20 w-full max-w-4xl mx-auto px-4 md:px-0">
          
          <button onClick={() => dispatch(openOrderModal({ mode: 'sales' }))} className="w-full max-w-[280px] md:max-w-none md:w-auto flex-1 px-6 py-3.5 lg:px-10 lg:py-4 bg-obsidian text-[#FAF9F6] rounded-full font-bold text-base md:text-sm lg:text-base hover:bg-obsidian-mid transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 lg:gap-3 animate-bounce">
            <span className="material-symbols-outlined text-base lg:text-xl">shopping_cart</span>
            Place an Order
          </button>

          <a href="#story" className="w-full max-w-[280px] md:max-w-none md:w-auto flex-1 px-6 py-3.5 lg:px-10 lg:py-4 bg-obsidian text-[#FAF9F6] rounded-full font-bold text-base md:text-sm lg:text-base hover:bg-obsidian-mid hover:-translate-y-1 transition-all shadow-lg flex items-center justify-center gap-2 lg:gap-3">
            <span className="material-symbols-outlined text-base lg:text-xl">info</span>
            About Us
          </a>

          <button onClick={() => dispatch(openOrderModal({ mode: 'franchise' }))} className="w-full max-w-[280px] md:max-w-none md:w-auto flex-1 px-6 py-3.5 lg:px-10 lg:py-4 bg-obsidian text-[#FAF9F6] rounded-full font-bold text-base md:text-sm lg:text-base hover:bg-obsidian-mid hover:-translate-y-1 transition-all shadow-lg flex items-center justify-center gap-2 lg:gap-3">
            <span className="material-symbols-outlined text-base lg:text-xl">inventory_2</span>
            Bulk Orders
          </button>
        </div>

        {/* Stats Bar */}
        <div className="bg-white/80 backdrop-blur-md rounded-[32px] shadow-sm border border-[#d4ecd4] py-4 lg:py-5 px-6 lg:px-10 w-full max-w-[80rem] mx-auto">
          <div className="flex flex-wrap justify-between items-center gap-x-6 lg:gap-x-10 gap-y-6">
            
            {/* Stat 1 */}
            <div className="flex flex-1 min-w-[200px] justify-center items-center gap-4">
              <div className="w-14 h-14 bg-highland-gold/10 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px] text-highland-gold" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
              </div>
              <div className="text-left">
                <div className="text-3xl lg:text-4xl font-extrabold text-obsidian leading-none">17+</div>
                <div className="text-base lg:text-lg font-bold text-obsidian mt-1.5 tracking-widest uppercase">Products</div>
              </div>
            </div>

            {/* Stat 2 */}
            <div className="flex flex-1 min-w-[200px] justify-center items-center gap-4">
              <div className="w-14 h-14 bg-highland-gold/10 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px] text-highland-gold" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
              </div>
              <div className="text-left">
                <div className="text-3xl lg:text-4xl font-extrabold text-obsidian leading-none">5000+</div>
                <div className="text-base lg:text-lg font-bold text-obsidian mt-1.5 tracking-widest uppercase">Customers</div>
              </div>
            </div>

            {/* Stat 3 */}
            <div className="flex flex-1 min-w-[200px] justify-center items-center gap-4">
              <div className="w-14 h-14 bg-highland-gold/10 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px] text-highland-gold" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              </div>
              <div className="text-left">
                <div className="text-3xl lg:text-4xl font-extrabold text-obsidian leading-none">100%</div>
                <div className="text-base lg:text-lg font-bold text-obsidian mt-1.5 tracking-widest uppercase">Natural</div>
              </div>
            </div>

            {/* Stat 4 */}
            <div className="flex flex-1 min-w-[200px] justify-center items-center gap-4">
              <div className="w-14 h-14 bg-highland-gold/10 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px] text-highland-gold" style={{ fontVariationSettings: "'FILL' 1" }}>agriculture</span>
              </div>
              <div className="text-left">
                <div className="text-3xl lg:text-4xl font-extrabold text-obsidian leading-none">10</div>
                <div className="text-base lg:text-lg font-bold text-obsidian mt-1.5 tracking-widest uppercase">Local Farms</div>
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
