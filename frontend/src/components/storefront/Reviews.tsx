import React from 'react';
import { Link } from 'react-router-dom';

const getEmbedUrl = (url: string) => {
  if (url.includes('youtube.com/shorts/')) {
    return url.replace('youtube.com/shorts/', 'youtube.com/embed/');
  }
  return url;
};

const Reviews: React.FC = () => {
  const videos = [
    { id: 1, url: "https://www.youtube.com/shorts/B1xbxdx4Ipc", title: "Customer Testimonial 1" },
    { id: 2, url: "https://www.youtube.com/shorts/B1xbxdx4Ipc", title: "Customer Testimonial 2" },
  ];

  return (
    <section className="py-16 lg:py-20 bg-[#FAF9F6] border-t border-[#d4ecd4]/60">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-12">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="font-mono text-sm text-highland-gold uppercase tracking-[0.2em] mb-3">
            Real Experiences
          </p>
          <h2 className="font-display-lg font-black text-obsidian text-4xl md:text-5xl leading-tight tracking-tight">
            Voices of Our <span className="text-highland-gold">Community</span>
          </h2>
        </div>

        {/* Videos Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 lg:gap-12 max-w-5xl mx-auto">
          {videos.map((v) => (
            <div key={v.id} className="bg-black rounded-3xl overflow-hidden shadow-sm border border-[#d4ecd4] hover:shadow-xl hover:border-highland-gold transition-all duration-500 h-[550px] w-full">
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
        
        {/* More Button */}
        <div className="mt-10 text-center">
          <Link to="/community-videos" className="inline-flex items-center gap-2 bg-obsidian hover:bg-obsidian-mid text-[#FAF9F6] px-8 py-4 rounded-full font-mono text-sm font-bold uppercase tracking-widest transition-all duration-300 shadow-md">
            More Videos
            <span className="material-symbols-outlined text-[16px] text-highland-gold">arrow_forward</span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Reviews;
