import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { RootState } from '../../store';
import { useLanguage, type Language } from '../../LanguageContext';

const Header: React.FC = () => {
  const [langOpen, setLangOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const { language, setLanguage } = useLanguage();

  const languageOptions: { code: Language; label: string; flag: string }[] = [
    { code: 'en', label: 'EN', flag: '🇺🇸' },
    { code: 'am', label: 'አማ', flag: '🇪🇹' },
    { code: 'or', label: 'OR', flag: '🇪🇹' },
  ];

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    setLangOpen(false);
  };

  return (
    <header className="bg-[#FAF9F6] sticky top-0 z-50 border-b border-[#d4ecd4]/60 backdrop-blur-md">
      <nav className="flex justify-between items-center w-full px-6 lg:px-12 h-[72px] max-w-[1400px] mx-auto">
        
        {/* Logo - Top Left Corner */}
        <Link to="/" className="flex items-center shrink-0 flex-1">
          <span className="font-comfortaa text-[20px] md:text-[24px] font-black text-obsidian tracking-tight uppercase select-none">
            Asella
          </span>
        </Link>

        {/* Center Links */}
        <div className="hidden md:flex items-center gap-10 lg:gap-12 flex-1 justify-center">
          <a href="#hero" className="text-[13px] font-bold text-obsidian/60 hover:text-highland-gold transition-colors uppercase tracking-[0.15em] relative group">
            Home
            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-highland-gold transition-all duration-300 group-hover:w-full"></span>
          </a>
          <a href="#products" className="text-[13px] font-bold text-obsidian/60 hover:text-highland-gold transition-colors uppercase tracking-[0.15em] relative group">
            Products
            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-highland-gold transition-all duration-300 group-hover:w-full"></span>
          </a>
          <a href="#story" className="text-[13px] font-bold text-obsidian/60 hover:text-highland-gold transition-colors uppercase tracking-[0.15em] relative group">
            About
            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-highland-gold transition-all duration-300 group-hover:w-full"></span>
          </a>
          <a href="#contact" className="text-[13px] font-bold text-obsidian/60 hover:text-highland-gold transition-colors uppercase tracking-[0.15em] relative group">
            Contact
            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-highland-gold transition-all duration-300 group-hover:w-full"></span>
          </a>
          <Link to="/track" className="text-[13px] font-bold text-obsidian/60 hover:text-highland-gold transition-colors uppercase tracking-[0.15em] relative group">
            Track Order
            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-highland-gold transition-all duration-300 group-hover:w-full"></span>
          </Link>
        </div>

        {/* Right Actions */}
        <div className="hidden md:flex items-center gap-4 shrink-0 flex-1 justify-end">
          
          {/* Language Toggle */}
          <div className="relative" id="lang-wrapper">
            <button 
              onClick={() => setLangOpen(!langOpen)}
              className="w-10 h-10 rounded-full border border-[#d4ecd4] bg-white flex items-center justify-center text-obsidian/60 hover:border-highland-gold hover:text-highland-gold transition-all shadow-sm"
              aria-label="Select language"
            >
              <span className="material-symbols-outlined text-[20px]">language</span>
            </button>
            
            {/* Dropdown */}
            {langOpen && (
              <div id="lang-dropdown" className="absolute right-0 top-12 w-36 bg-white rounded-2xl shadow-xl border border-[#d4ecd4] overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                {languageOptions.map((opt) => (
                  <button
                    key={opt.code}
                    onClick={() => handleLanguageChange(opt.code)}
                    className={`w-full px-4 py-2.5 text-left text-sm font-bold transition-colors flex items-center gap-2 ${
                      language === opt.code
                        ? 'bg-parchment-mid text-obsidian'
                        : 'text-obsidian/70 hover:bg-parchment-mid hover:text-obsidian'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${language === opt.code ? 'bg-highland-gold' : 'bg-slate-300'}`}></span>
                    <span>{opt.flag}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User Session or Login */}
          {isAuthenticated && user ? (
            <Link to="/dashboard" className="hidden md:flex items-center gap-2 bg-parchment-mid rounded-[40px] px-3.5 py-1.5 text-[0.85rem] font-semibold text-obsidian transition-transform hover:scale-105">
              <span className="w-2 h-2 rounded-full bg-highland-gold"></span>
              {user.name?.split(' ')[0] || 'User'}
            </Link>
          ) : (
            <Link to="/dashboard" className="h-10 px-5 rounded-full border border-[#d4ecd4] bg-white flex items-center gap-2 text-[13px] font-bold text-obsidian/70 hover:border-highland-gold hover:text-highland-gold transition-all shadow-sm uppercase tracking-wider">
              <span className="material-symbols-outlined text-[18px]">account_circle</span>
              Login
            </Link>
          )}

          {/* Dark Mode - Hidden on landing page */}
          <button 
            className="hidden w-10 h-10 rounded-full border border-[#d4ecd4] bg-white items-center justify-center text-obsidian/60 hover:border-highland-gold hover:text-highland-gold transition-all shadow-sm" 
          >
            <span className="material-symbols-outlined text-[20px]">dark_mode</span>
          </button>
        </div>

        {/* Mobile Toggle */}
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden w-10 h-10 rounded-full border border-[#d4ecd4] bg-white flex items-center justify-center text-obsidian shadow-sm"
        >
          <span className="material-symbols-outlined text-2xl">{mobileMenuOpen ? 'close' : 'menu'}</span>
        </button>
      </nav>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-[72px] left-0 w-full bg-white border-b border-[#d4ecd4] shadow-lg animate-in slide-in-from-top-2 duration-200 py-4 px-6 flex flex-col gap-4">
          <a href="#hero" onClick={() => setMobileMenuOpen(false)} className="text-sm font-bold text-obsidian/70 hover:text-highland-gold uppercase tracking-widest py-2 border-b border-parchment-mid">Home</a>
          <a href="#products" onClick={() => setMobileMenuOpen(false)} className="text-sm font-bold text-obsidian/70 hover:text-highland-gold uppercase tracking-widest py-2 border-b border-parchment-mid">Products</a>
          <a href="#story" onClick={() => setMobileMenuOpen(false)} className="text-sm font-bold text-obsidian/70 hover:text-highland-gold uppercase tracking-widest py-2 border-b border-parchment-mid">About</a>
          <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="text-sm font-bold text-obsidian/70 hover:text-highland-gold uppercase tracking-widest py-2 border-b border-parchment-mid">Contact</a>
          <Link to="/track" onClick={() => setMobileMenuOpen(false)} className="text-sm font-bold text-obsidian/70 hover:text-highland-gold uppercase tracking-widest py-2 border-b border-parchment-mid">Track Order</Link>
          
          <div className="pt-2">
            {isAuthenticated && user ? (
              <Link to="/dashboard" className="flex items-center justify-center gap-2 w-full py-3 bg-parchment-mid rounded-full text-sm font-bold text-obsidian">
                <span className="material-symbols-outlined text-lg">dashboard</span>
                Dashboard
              </Link>
            ) : (
              <Link to="/dashboard" className="flex items-center justify-center gap-2 w-full py-3 bg-obsidian rounded-full text-sm font-bold text-[#FAF9F6] uppercase tracking-wider">
                <span className="material-symbols-outlined text-lg">account_circle</span>
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
