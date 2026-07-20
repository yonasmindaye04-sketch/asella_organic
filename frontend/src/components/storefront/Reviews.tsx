import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../LanguageContext';



const ALL_VIDEOS = [
  { id: 1, url: "https://youtube.com/shorts/gmab7MMwTS0", title: "Customer Testimonial 1" },
  { id: 2, url: "https://youtube.com/shorts/3mDx-b_aJUs", title: "Customer Testimonial 2" },
  { id: 3, url: "https://youtube.com/shorts/guFlqRD0I_E", title: "Customer Testimonial 3" },
  { id: 4, url: "https://youtube.com/shorts/zQhZzCupONw", title: "Customer Testimonial 4" },
  { id: 5, url: "https://youtube.com/shorts/HIBIcWbHPV4", title: "Customer Testimonial 5" },
  { id: 6, url: "https://youtube.com/shorts/pT8TXA9mGF8", title: "Customer Testimonial 6" },
  { id: 7, url: "https://youtube.com/shorts/3D6cqJygUBQ", title: "Customer Testimonial 7" },
  { id: 8, url: "https://youtube.com/shorts/OYRGBsWlblE", title: "Customer Testimonial 8" },
  { id: 9, url: "https://youtube.com/shorts/-AGzwaJFPA0", title: "Customer Testimonial 9" },
  { id: 10, url: "https://youtube.com/shorts/-GYdXWQHchM", title: "Customer Testimonial 10" },
  
  
];

import { YouTubeFacade } from '../common/YouTubeFacade';

const Reviews: React.FC = () => {
  const { t } = useLanguage();
  const [videos] = useState(() => {
    const shuffled = [...ALL_VIDEOS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 4); // Pick 4 random videos
  });

  return (
    <section className="py-16 lg:py-20 bg-parchment dark:bg-[#121212] border-t border-border content-visibility-auto">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-12">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="font-mono text-2xl text-highland-gold uppercase tracking-[0.2em] mb-3">
            {t('reviews.subtitle')}
          </p>
          <h2 className="font-display-lg font-black text-obsidian dark:text-white text-4xl md:text-5xl leading-tight tracking-tight">
            {t('reviews.title')}<span className="text-highland-gold">{t('reviews.titleHighlight')}</span>
          </h2>
        </div>

        {/* Videos Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 max-w-7xl mx-auto">
          {videos.map((v) => (
            <div key={v.id} className="bg-black rounded-3xl overflow-hidden shadow-sm border border-border hover:shadow-xl hover:border-highland-gold transition-all duration-500 h-[550px] w-full">
              <YouTubeFacade url={v.url} title={v.title} />
            </div>
          ))}
        </div>
        
        {/* More Button */}
        <div className="mt-10 text-center">
          <Link to="/community-videos" className="inline-flex items-center gap-2 bg-obsidian hover:bg-obsidian-mid text-parchment px-8 py-4 rounded-full font-mono text-base font-bold uppercase tracking-widest transition-all duration-300 shadow-md">
            {t('reviews.moreVideos')}
            <span className="material-symbols-outlined text-[16px] text-highland-gold">arrow_forward</span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Reviews;



