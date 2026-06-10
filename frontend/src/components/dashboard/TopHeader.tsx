import React from 'react';
import ThemeToggle from '../ui/ThemeToggle';

const TopHeader: React.FC = () => {
  return (
    <header className="h-20 flex items-center justify-between px-8 border-b border-surface-container bg-surface-container-lowest z-10 shadow-sm">
      <div className="flex items-center gap-4">
        <button className="md:hidden text-on-surface-variant hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-xl">menu</span>
        </button>
        <div>
          <h2 className="text-lg font-semibold text-on-surface font-headline-md">Hi <span>Adaline Horton</span>,</h2>
          <p className="text-sm text-on-surface-variant">Welcome back, <span className="font-medium text-primary">Super Admin</span>!</p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        
        {/* Role Switcher */}
        <select className="bg-surface border border-outline-variant text-sm text-on-surface rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary font-data-mono cursor-pointer transition-colors hover:border-primary-fixed-dim">
          <option value="admin">View as Admin</option>
          <option value="manager">View as Manager</option>
          <option value="staff">View as Staff</option>
        </select>

        {/* Date Display */}
        <div className="hidden sm:flex items-center gap-2 bg-surface text-on-surface-variant px-4 py-2 rounded-lg border border-surface-container cursor-pointer hover:bg-surface-variant transition-colors">
          <span className="material-symbols-outlined text-sm">calendar_today</span>
          <span className="text-sm font-data-mono">Jul 19, 2022</span>
        </div>

        {/* Search */}
        <div className="relative hidden lg:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 transform -translate-y-1/2 text-on-surface-variant text-sm pointer-events-none">search</span>
          <input className="pl-10 pr-4 py-2 bg-surface border border-surface-container rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-64 font-data-mono placeholder-on-surface-variant transition-shadow" placeholder="Type to search" type="text" />
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <button className="relative text-on-surface-variant hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-xl">notifications</span>
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-error rounded-full border-2 border-surface-container-lowest animate-pulse"></span>
        </button>
      </div>
    </header>
  );
};

export default TopHeader;
