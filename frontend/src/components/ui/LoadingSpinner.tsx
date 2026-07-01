import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--cream)]">
      <div className="relative flex items-center justify-center">
        {/* Outer glowing ring */}
        <div className="absolute w-16 h-16 rounded-full border-4 border-emerald-100 dark:border-emerald-900 animate-ping opacity-30"></div>
        {/* Inner spinning ring */}
        <div className="w-12 h-12 rounded-full border-4 border-transparent border-t-emerald-600 border-r-emerald-500 animate-spin"></div>
        {/* Center dot */}
        <div className="absolute w-2 h-2 bg-emerald-700 rounded-full"></div>
      </div>
      <p className="mt-4 text-emerald-800 font-semibold text-sm tracking-widest uppercase animate-pulse">Loading...</p>
    </div>
  );
};

export default LoadingSpinner;
