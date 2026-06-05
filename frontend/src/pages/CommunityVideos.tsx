import React from 'react';
import { Link } from 'react-router-dom';

const getEmbedUrl = (url: string) => {
  if (url.includes('youtube.com/shorts/')) {
    return url.replace('youtube.com/shorts/', 'youtube.com/embed/');
  }
  return url;
};

const CommunityVideos: React.FC = () => {
  const videos = [
    { id: 1, url: "https://www.youtube.com/shorts/B1xbxdx4Ipc", title: "Customer Testimonial 1" },
    { id: 2, url: "https://www.youtube.com/shorts/B1xbxdx4Ipc", title: "Customer Testimonial 2" },
    { id: 3, url: "https://www.youtube.com/shorts/B1xbxdx4Ipc", title: "Customer Testimonial 3" },
    { id: 4, url: "https://www.youtube.com/shorts/B1xbxdx4Ipc", title: "Customer Testimonial 4" },
    { id: 5, url: "https://www.youtube.com/shorts/B1xbxdx4Ipc", title: "Customer Testimonial 5" },
    { id: 6, url: "https://www.youtube.com/shorts/B1xbxdx4Ipc", title: "Customer Testimonial 6" },
  ];

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
