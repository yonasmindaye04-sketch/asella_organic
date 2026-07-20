import React, { useState } from 'react';

const extractVideoId = (url: string) => {
  if (url.includes('youtube.com/shorts/')) {
    return url.split('youtube.com/shorts/')[1]?.split('?')[0];
  }
  if (url.includes('youtu.be/')) {
    return url.split('youtu.be/')[1]?.split('?')[0];
  }
  if (url.includes('youtube.com/watch?v=')) {
    return new URLSearchParams(url.split('?')[1]).get('v');
  }
  // fallback for already embedded urls or unknowns
  if (url.includes('youtube.com/embed/')) {
    return url.split('youtube.com/embed/')[1]?.split('?')[0];
  }
  if (url.includes('youtube-nocookie.com/embed/')) {
    return url.split('youtube-nocookie.com/embed/')[1]?.split('?')[0];
  }
  return '';
};

export const YouTubeFacade: React.FC<{ url: string; title: string }> = ({ url, title }) => {
  const [loaded, setLoaded] = useState(false);
  const videoId = extractVideoId(url);

  if (!videoId) {
    // Fallback if URL is invalid
    return (
      <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-white/50 text-sm">
        Invalid Video URL
      </div>
    );
  }

  if (loaded) {
    return (
      <iframe
        className="w-full h-full border-0"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
        title={title}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <button
      onClick={() => setLoaded(true)}
      aria-label={`Play video: ${title}`}
      className="relative w-full h-full group block cursor-pointer"
    >
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt={title}
        loading="lazy"
        className="w-full h-full object-cover"
      />
      <span className="material-symbols-outlined absolute inset-0 m-auto w-16 h-16 flex items-center justify-center bg-black/50 rounded-full text-white text-4xl group-hover:bg-black/70 transition-colors duration-300">
        play_arrow
      </span>
    </button>
  );
};
