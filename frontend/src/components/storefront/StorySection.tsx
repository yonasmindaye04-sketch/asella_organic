import React from 'react';

const StorySection: React.FC = () => {
  return (
    <section className="relative w-full py-16 lg:py-20 bg-[#FAF9F6] overflow-hidden" id="story">
      {/* Subtle background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-parchment-mid rounded-full blur-[100px] opacity-40 -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-amber-50 rounded-full blur-[80px] opacity-30 translate-y-1/3 -translate-x-1/4"></div>
      </div>
      
      <div className="max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 relative z-10 px-6 lg:px-12 items-start">
        
        {/* Left: Typography & Story */}
        <div className="col-span-1 lg:col-span-5 flex flex-col gap-6 pt-2">
          
          
          <h2 className="font-display-lg font-black text-obsidian leading-[1.15]" style={{ fontSize: 'clamp(36px, 4.5vw, 56px)', letterSpacing: '-0.02em' }}>
            Rooted in Heritage,<br/>
            <span className="text-highland-gold">Driven by Purity.</span>
          </h2>
          
         <p className="max-w-4xl font-sans text-slate-1000 text-2xl leading-10">
  Founded in the fertile valleys of Asella, our enterprise began with a simple
  mission: to preserve the ancient agricultural wisdom of Ethiopia while
  meeting international organic standards. We believe that true health comes
  from the earth, untouched and honored.
</p>
        </div>
        
        {/* Right: Asymmetrical Feature Cards */}
        <div className="col-span-1 lg:col-span-7 relative min-h-[500px]">
          
          {/* Background Image (very subtle) */}
          <div className="absolute right-0 top-0 w-4/5 h-full rounded-[40px] overflow-hidden shadow-xl z-0 hidden lg:block border border-[#d4ecd4]">
            <img alt="Ethiopian highlands" className="w-full h-full object-cover opacity-10" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC3SNcIAbVkrboWtNudzWbLM2_73GNsTn4cLd1SWJJJqyhPwlMqe5tui1tCGn7UiBpLqj66amNVx46sAIuI9FQySnWJV9iHHzAcj_huIPncjDxiFAFTmXAZq9OsROGGkbuRn-a2qMmKSYW5g-VVi7hNUZWf7btjfNXNeegSG80sWUD_-5Gw5Rm4y6c0q6wIIR0ZCRGU5kQ61ALsNAd8vvgIkrbgohoNDsCBDJ5jitk4VrKw_o_3EysIuRyqxcfn3g8AnmrfrH-0oRc" />
            <div className="absolute inset-0 bg-gradient-to-l from-[#FAF9F6]/10 via-[#FAF9F6]/50 to-[#FAF9F6]"></div>
          </div>
          
          {/* Staggered Features */}
          <div className="relative z-10 flex flex-col gap-4 h-full justify-start">
            
            {/* Feature 1 */}
            <div className="flex items-start gap-4 bg-white p-4 rounded-xl border border-[#d4ecd4] shadow-sm hover:shadow-md hover:border-highland-gold transition-all duration-300 w-full lg:w-[80%]">
              <div className="w-12 h-12 shrink-0 rounded-full bg-parchment-mid flex items-center justify-center text-highland-gold">
                <span className="material-symbols-outlined">nature</span>
              </div>
              <div>
                <h3 className="text-base font-mono font-bold text-obsidian mb-1 uppercase tracking-wider">100% Organic</h3>
                <p className="text-slate-700 text-2xl leading-relaxed">Every product is certified to be free from synthetic additives.</p>
              </div>
            </div>
            
            {/* Feature 2 */}
            <div className="flex items-start gap-4 bg-white p-4 rounded-xl border border-[#d4ecd4] shadow-sm hover:shadow-md hover:border-highland-gold transition-all duration-300 w-full lg:w-[80%] lg:ml-8">
              <div className="w-12 h-12 shrink-0 rounded-full bg-parchment-mid flex items-center justify-center text-highland-gold">
                <span className="material-symbols-outlined">handshake</span>
              </div>
              <div>
                <h3 className="text-base font-mono font-bold text-obsidian mb-1 uppercase tracking-wider">Ethically Sourced</h3>
                <p className="text-slate-700 text-2xl leading-relaxed">We support our community by providing fair wages and sustainable practices.</p>
              </div>
            </div>
            
            {/* Feature 3 */}
            <div className="flex items-start gap-4 bg-white p-4 rounded-xl border border-[#d4ecd4] shadow-sm hover:shadow-md hover:border-highland-gold transition-all duration-300 w-full lg:w-[80%] lg:ml-16">
              <div className="w-12 h-12 shrink-0 rounded-full bg-parchment-mid flex items-center justify-center text-highland-gold">
                <span className="material-symbols-outlined">science</span>
              </div>
              <div>
                <h3 className="text-base font-mono font-bold text-obsidian mb-1 uppercase tracking-wider">Quality Tested</h3>
                <p className="text-slate-700 text-2xl leading-relaxed">Rigorous laboratory testing for purity and potency in every batch.</p>
              </div>
            </div>
            
            {/* Feature 4 */}
            <div className="flex items-start gap-4 bg-white p-4 rounded-xl border border-[#d4ecd4] shadow-sm hover:shadow-md hover:border-highland-gold transition-all duration-300 w-full lg:w-[80%] lg:ml-24">
              <div className="w-12 h-12 shrink-0 rounded-full bg-parchment-mid flex items-center justify-center text-highland-gold">
                <span className="material-symbols-outlined">award_star</span>
              </div>
              <div>
                <h3 className="text-base font-mono font-bold text-obsidian mb-1 uppercase tracking-wider">Heritage & Tradition</h3>
                <p className="text-slate-700 text-2xl leading-relaxed">Combining generational agricultural knowledge with modern scientific refinement.</p>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </section>
  );
};

export default StorySection;
