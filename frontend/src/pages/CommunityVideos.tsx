import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const getEmbedUrl = (url: string) => {
  if (url.includes('youtube.com/shorts/')) {
    return url.replace('youtube.com/shorts/', 'youtube.com/embed/');
  }
  return url;
};

const CommunityVideos: React.FC = () => {
  const [videos] = useState(() => {
    const arr = [
      { id: 1, url: "https://youtube.com/shorts/gmab7MMwTS0", title: "Customer Testimonial 1" },
      { id: 2, url: "https://youtube.com/shorts/3mDx-b_aJUs", title: "Customer Testimonial 2" },
      { id: 3, url: "https://youtube.com/shorts/guFlqRD0I_E", title: "Customer Testimonial 3" },
      { id: 4, url: "https://youtube.com/shorts/zQhZzCupONw", title: "Customer Testimonial 4" },
      { id: 5, url: "https://youtube.com/shorts/HIBIcWbHPV4", title: "Customer Testimonial 5" },
      { id: 6, url: "https://youtube.com/shorts/pT8TXA9mGF8", title: "Customer Testimonial 6" },
      { id: 7, url: "https://youtube.com/shorts/3D6cqJygUBQ", title: "Customer Testimonial 7" },
      { id: 8, url: "https://youtube.com/shorts/OYRGBsWlblE", title: "Customer Testimonial 8" },
      { id: 9, url: "https://youtube.com/shorts/-AGzwaJFPA0", title: "Customer Testimonial 9" },
    ];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  });

  return (
    <div className="min-h-screen bg-[#FAF9F6] py-20 px-6 font-sans">
      <div className="max-w-7xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-obsidian hover:text-highland-gold font-mono text-xs font-bold uppercase tracking-widest mb-12 transition-colors duration-200">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Storefront
        </Link>
        
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="font-mono text-xs text-highland-gold uppercase tracking-[0.2em] mb-3">
            Shared Journeys
          </p>
          <h1 className="font-display-lg font-black text-obsidian text-4xl md:text-5xl leading-tight tracking-tight">
            More Community <span className="text-highland-gold">Voices</span>
          </h1>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10">
          {videos.map((v) => (
            <div key={v.id} className="bg-black rounded-3xl overflow-hidden shadow-sm border border-[#d4ecd4] hover:shadow-xl hover:border-highland-gold transition-all duration-500 h-[500px] w-full">
              <iframe
                src={getEmbedUrl(v.url)}
                title={v.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommunityVideos;
