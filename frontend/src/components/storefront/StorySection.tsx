import React from 'react';
import { useLanguage } from '../../LanguageContext';

const StorySection: React.FC = () => {
  const { t } = useLanguage();
  return (
    <section className="relative w-full py-16 lg:py-20 bg-parchment dark:bg-[#121212] overflow-hidden" id="story">
      {/* Subtle background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-parchment-mid rounded-full blur-[100px] opacity-40 -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-amber-50 rounded-full blur-[80px] opacity-30 translate-y-1/3 -translate-x-1/4"></div>
      </div>
      
      <div className="max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 relative z-10 px-6 lg:px-12 items-start">
        
        {/* Left: Typography & Story */}
        <div className="col-span-1 lg:col-span-5 flex flex-col gap-6 pt-2">
          
          
          <h2 className="font-display-lg font-black text-obsidian dark:text-white leading-[1.15]" style={{ fontSize: 'clamp(36px, 4.5vw, 56px)', letterSpacing: '-0.02em' }}>
            {t('story.title')}<br/>
            <span className="text-highland-gold">{t('story.titleHighlight')}</span>
          </h2>
          
         <p className="max-w-4xl font-sans text-slate-1000 text-2xl leading-10">
  {t('story.desc')}
</p>
        </div>
        
        {/* Right: Asymmetrical Feature Cards */}
        <div className="col-span-1 lg:col-span-7 relative min-h-[500px]">
          
          {/* Background Image (very subtle) */}
          <div className="absolute right-0 top-0 w-4/5 h-full rounded-[40px] overflow-hidden shadow-xl z-0 hidden lg:block border border-border">
            <img alt="Ethiopian highlands" className="w-full h-full object-cover opacity-10" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC3SNcIAbVkrboWtNudzWbLM2_73GNsTn4cLd1SWJJJqyhPwlMqe5tui1tCGn7UiBpLqj66amNVx46sAIuI9FQySnWJV9iHHzAcj_huIPncjDxiFAFTmXAZq9OsROGGkbuRn-a2qMmKSYW5g-VVi7hNUZWf7btjfNXNeegSG80sWUD_-5Gw5Rm4y6c0q6wIIR0ZCRGU5kQ61ALsNAd8vvgIkrbgohoNDsCBDJ5jitk4VrKw_o_3EysIuRyqxcfn3g8AnmrfrH-0oRc" />
            <div className="absolute inset-0 bg-gradient-to-l from-[#FAF9F6]/10 via-[#FAF9F6]/50 to-[#FAF9F6]"></div>
          </div>
          
          {/* Staggered Features */}
          <div className="relative z-10 flex flex-col gap-4 h-full justify-start">
            
            {/* Feature 1 */}
            <div className="flex items-start gap-4 bg-white dark:bg-obsidian p-4 rounded-xl border border-border shadow-sm hover:shadow-md hover:border-highland-gold transition-all duration-300 w-full lg:w-[80%]">
              <div className="w-12 h-12 shrink-0 rounded-full bg-parchment-mid flex items-center justify-center text-highland-gold">
                <span className="material-symbols-outlined">nature</span>
              </div>
              <div>
                <h3 className="text-base font-mono font-bold text-obsidian dark:text-white mb-1 uppercase tracking-wider">{t('story.feature1Title')}</h3>
                <p className="text-slate-700 dark:text-slate-300 text-2xl leading-relaxed">{t('story.feature1Desc')}</p>
              </div>
            </div>
            
            {/* Feature 2 */}
            <div className="flex items-start gap-4 bg-white dark:bg-obsidian p-4 rounded-xl border border-border shadow-sm hover:shadow-md hover:border-highland-gold transition-all duration-300 w-full lg:w-[80%] lg:ml-8">
              <div className="w-12 h-12 shrink-0 rounded-full bg-parchment-mid flex items-center justify-center text-highland-gold">
                <span className="material-symbols-outlined">handshake</span>
              </div>
              <div>
                <h3 className="text-base font-mono font-bold text-obsidian dark:text-white mb-1 uppercase tracking-wider">{t('story.feature2Title')}</h3>
                <p className="text-slate-700 dark:text-slate-300 text-2xl leading-relaxed">{t('story.feature2Desc')}</p>
              </div>
            </div>
            
            {/* Feature 3 */}
            <div className="flex items-start gap-4 bg-white dark:bg-obsidian p-4 rounded-xl border border-border shadow-sm hover:shadow-md hover:border-highland-gold transition-all duration-300 w-full lg:w-[80%] lg:ml-16">
              <div className="w-12 h-12 shrink-0 rounded-full bg-parchment-mid flex items-center justify-center text-highland-gold">
                <span className="material-symbols-outlined">science</span>
              </div>
              <div>
                <h3 className="text-base font-mono font-bold text-obsidian dark:text-white mb-1 uppercase tracking-wider">{t('story.feature3Title')}</h3>
                <p className="text-slate-700 dark:text-slate-300 text-2xl leading-relaxed">{t('story.feature3Desc')}</p>
              </div>
            </div>
            
            {/* Feature 4 */}
            <div className="flex items-start gap-4 bg-white dark:bg-obsidian p-4 rounded-xl border border-border shadow-sm hover:shadow-md hover:border-highland-gold transition-all duration-300 w-full lg:w-[80%] lg:ml-24">
              <div className="w-12 h-12 shrink-0 rounded-full bg-parchment-mid flex items-center justify-center text-highland-gold">
                <span className="material-symbols-outlined">award_star</span>
              </div>
              <div>
                <h3 className="text-base font-mono font-bold text-obsidian dark:text-white mb-1 uppercase tracking-wider">{t('story.feature4Title')}</h3>
                <p className="text-slate-700 dark:text-slate-300 text-2xl leading-relaxed">{t('story.feature4Desc')}</p>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </section>
  );
};

export default StorySection;



