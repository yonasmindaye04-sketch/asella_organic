import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const getEmbedUrl = (url: string) => {
  if (url.includes('youtube.com/shorts/')) {
    const id = url.split('youtube.com/shorts/')[1]?.split('?')[0];
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
  }
  if (url.includes('youtu.be/')) {
    const id = url.split('youtu.be/')[1]?.split('?')[0];
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
  }
  if (url.includes('youtube.com/watch?v=')) {
    const id = new URLSearchParams(url.split('?')[1]).get('v');
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
  }
  return url;
};

interface Video { id: number; url: string; title: string; }

/** Only renders the iframe once it enters the viewport */
const LazyIframe: React.FC<{ src: string; title: string }> = ({ src, title }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full h-full bg-black">
      {visible ? (
        <iframe
          src={src}
          title={title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-neutral-900 animate-pulse">
          <span className="material-symbols-outlined text-white/60 text-[64px]">play_circle</span>
        </div>
      )}
    </div>
  );
};

const CommunityVideos: React.FC = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/videos`);
      const json = await res.json();
      if (json.success) setVideos(json.data);
      else setError('Failed to load videos.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

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
          {!loading && videos.length > 0 && (
            <p className="text-slate-700 text-sm mt-3 font-mono">{videos.length} videos</p>
          )}
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[500px] rounded-3xl bg-neutral-200 animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="text-center">
            <span className="material-symbols-outlined text-[56px] text-red-300 block mb-3">error_outline</span>
            <p className="text-red-600 font-bold">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && videos.length === 0 && (
          <p className="text-center text-slate-700 font-mono text-lg">No videos available yet. Check back soon!</p>
        )}

        {/* Grid */}
        {!loading && !error && videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10">
            {videos.map((v) => (
              <div
                key={v.id}
                className="bg-black rounded-3xl overflow-hidden shadow-sm border border-[#d4ecd4] hover:shadow-xl hover:border-highland-gold transition-all duration-500 h-[500px] w-full"
              >
                <LazyIframe src={getEmbedUrl(v.url)} title={v.title} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunityVideos;
