import React from 'react';

const Topbar: React.FC = () => {
  return (
    <header className="bg-[#1b3d1e] text-white flex items-center justify-between px-4 sm:px-5 h-14 flex-shrink-0 shadow-md z-30 gap-3">
      <div className="flex items-center gap-3 font-bold text-base sm:text-lg tracking-tight whitespace-nowrap">
        <div className="w-8 h-8 bg-[#43a047] rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-white text-sm">eco</span>
        </div>
        <span className="truncate">Asella — Order Tracking</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_0_3px_rgba(74,222,128,.25)] animate-pulse"></div>
          <span className="text-[11px] opacity-60 hidden sm:inline">Live</span>
        </div>
        <div className="h-6 w-px bg-white/20 hidden sm:block"></div>
        <button className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 text-[11px] sm:text-xs font-bold transition">
          <span className="material-symbols-outlined text-xs">refresh</span> <span className="hidden sm:inline">Refresh</span>
        </button>
        <button className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 text-[11px] sm:text-xs font-bold transition">
          <span className="material-symbols-outlined text-xs">bar_chart</span> <span className="hidden sm:inline">Analytics</span>
        </button>
        <button className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-[#4caf50] border border-[#4caf50] hover:bg-[#66bb6a] text-[11px] sm:text-xs font-bold transition">
          <span className="material-symbols-outlined text-xs">download</span> <span className="hidden sm:inline">Export CSV</span>
        </button>
      </div>
    </header>
  );
};

export default Topbar;
