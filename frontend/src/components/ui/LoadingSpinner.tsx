import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--cream)] relative overflow-hidden">
      <div className="relative flex items-center justify-center">
        {/* Glow behind the leaf */}
        <div className="absolute w-24 h-24 rounded-full bg-highland-gold opacity-20 blur-xl animate-pulse"></div>
        
        {/* Leaf SVG */}
        <svg 
          className="w-12 h-12 text-highland-gold animate-breathe" 
          viewBox="0 0 24 24" 
          fill="currentColor" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 22C12 22 4 16 4 10C4 6.7 6.7 4 10 4C11.3 4 12.5 4.5 13.4 5.3C14.3 4.5 15.5 4 16.8 4C20.1 4 22.8 6.7 22.8 10C22.8 16 12 22 12 22ZM10 6C7.8 6 6 7.8 6 10C6 14.1 11.2 18.7 12 19.4C12.8 18.7 18.8 14.1 18.8 10C18.8 7.8 17 6 14.8 6C13 6 11.5 7.2 11.1 8.9L10 6Z"/>
          <path d="M12 22C12 22 12 13 18 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </div>
      <p className="mt-6 text-highland-gold font-bold text-[13px] tracking-[0.2em] uppercase animate-pulse">Asella Organic</p>
    </div>
  );
};

export default LoadingSpinner;
