import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { RootState } from '../../store';
import { useLanguage, type Language } from '../../LanguageContext';

const Header: React.FC = () => {
  const [langOpen, setLangOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault();
    if (location.pathname !== '/') {
      navigate(`/${hash}`);
    } else {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        window.history.pushState(null, '', hash);
      }
    }
    setMobileMenuOpen(false);
  };

  const renderLanguageToggle = () => (
    <div className="relative" id="lang-wrapper">
      <button 
        onClick={() => setLangOpen(!langOpen)}
        className="w-10 h-10 rounded-full border border-border bg-white dark:bg-obsidian flex items-center justify-center text-obsidian/60 dark:text-white/70 hover:border-highland-gold hover:text-highland-gold transition-all shadow-sm"
        aria-label="Select language"
      >
        <span className="material-symbols-outlined text-[20px]">language</span>
      </button>
      
      {langOpen && (
        <div id="lang-dropdown" className="absolute right-0 top-12 w-36 bg-white dark:bg-obsidian rounded-2xl shadow-xl border border-border overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
          {languageOptions.map((opt) => (
            <button
              key={opt.code}
              onClick={() => handleLanguageChange(opt.code)}
              className={`w-full px-4 py-2.5 text-left text-base font-bold transition-colors flex items-center gap-2 ${
                language === opt.code
                  ? 'bg-parchment-mid text-obsidian dark:text-white'
                  : 'text-obsidian dark:text-white hover:bg-parchment-mid hover:text-obsidian dark:text-white'
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
  );

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
    <header className="bg-parchment dark:bg-[#121212] sticky top-0 z-50 border-b border-border backdrop-blur-md">
      <nav className="flex justify-between items-center w-full px-4 lg:px-10 h-[72px] max-w-[1600px] mx-auto">
        
        {/* Logo - Top Left Corner */}
        <Link to="/" className="flex items-center shrink-0 flex-1">
          <span className="font-comfortaa text-[20px] md:text-[24px] font-black text-obsidian dark:text-white tracking-tight uppercase select-none flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4caf50] text-[32px]">eco</span>
            Asella Organic
          </span>
        </Link>

        {/* Center Links */}
        <div className="hidden md:flex items-center gap-10 lg:gap-12 flex-1 justify-center">
          <a href="#hero" onClick={(e) => handleNavClick(e, '#hero')} className="text-base font-bold text-obsidian dark:text-white hover:text-highland-gold transition-colors uppercase tracking-[0.15em] relative group">
            {t('nav.home')}
            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-highland-gold transition-all duration-300 group-hover:w-full"></span>
          </a>
          <a href="#products" onClick={(e) => handleNavClick(e, '#products')} className="text-base font-bold text-obsidian dark:text-white hover:text-highland-gold transition-colors uppercase tracking-[0.15em] relative group">
            {t('nav.products')}
            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-highland-gold transition-all duration-300 group-hover:w-full"></span>
          </a>
          <a href="#story" onClick={(e) => handleNavClick(e, '#story')} className="text-base font-bold text-obsidian dark:text-white hover:text-highland-gold transition-colors uppercase tracking-[0.15em] relative group">
            {t('nav.about')}
            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-highland-gold transition-all duration-300 group-hover:w-full"></span>
          </a>
          <a href="#contact" onClick={(e) => handleNavClick(e, '#contact')} className="text-base font-bold text-obsidian dark:text-white hover:text-highland-gold transition-colors uppercase tracking-[0.15em] relative group">
            {t('nav.contact')}
            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-highland-gold transition-all duration-300 group-hover:w-full"></span>
          </a>
          <Link to="/track" className="text-base font-bold text-obsidian dark:text-white hover:text-highland-gold transition-colors uppercase tracking-[0.15em] relative group">
            {t('nav.trackOrder')}
            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-highland-gold transition-all duration-300 group-hover:w-full"></span>
          </Link>
        </div>

        {/* Right Actions */}
        <div className="hidden md:flex items-center gap-4 shrink-0 flex-1 justify-end">
          
          {/* Language Toggle */}
          {renderLanguageToggle()}

          {/* User Session or Login */}
          {isAuthenticated && user ? (
            <Link to="/dashboard" className="hidden md:flex items-center gap-2 bg-parchment-mid rounded-[40px] px-3.5 py-1.5 text-base font-semibold text-obsidian dark:text-white transition-transform hover:scale-105">
              <span className="w-2 h-2 rounded-full bg-highland-gold"></span>
              {user.name?.split(' ')[0] || t('common.welcome')}
            </Link>
          ) : (
            <Link to="/dashboard" className="h-10 px-5 rounded-full border border-border bg-white dark:bg-obsidian flex items-center gap-2 text-base font-bold text-obsidian dark:text-white hover:border-highland-gold hover:text-highland-gold transition-all shadow-sm uppercase tracking-wider">
              <span className="material-symbols-outlined text-[18px]">account_circle</span>
              {t('nav.login')}
            </Link>
          )}
        </div>

        {/* Mobile Toggle */}
        <div className="md:hidden flex items-center gap-3">
          {renderLanguageToggle()}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-10 h-10 rounded-full border border-border bg-white dark:bg-obsidian flex items-center justify-center text-obsidian dark:text-white shadow-sm"
          >
            <span className="material-symbols-outlined text-2xl">{mobileMenuOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </nav>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-[72px] left-0 w-full bg-white dark:bg-obsidian border-b border-border shadow-lg animate-in slide-in-from-top-2 duration-200 py-4 px-6 flex flex-col gap-4">
          <a href="#hero" onClick={(e) => handleNavClick(e, '#hero')} className="text-base font-bold text-obsidian dark:text-white hover:text-highland-gold uppercase tracking-widest py-2 border-b border-parchment-mid">{t('nav.home')}</a>
          <a href="#products" onClick={(e) => handleNavClick(e, '#products')} className="text-base font-bold text-obsidian dark:text-white hover:text-highland-gold uppercase tracking-widest py-2 border-b border-parchment-mid">{t('nav.products')}</a>
          <a href="#story" onClick={(e) => handleNavClick(e, '#story')} className="text-base font-bold text-obsidian dark:text-white hover:text-highland-gold uppercase tracking-widest py-2 border-b border-parchment-mid">{t('nav.about')}</a>
          <a href="#contact" onClick={(e) => handleNavClick(e, '#contact')} className="text-base font-bold text-obsidian dark:text-white hover:text-highland-gold uppercase tracking-widest py-2 border-b border-parchment-mid">{t('nav.contact')}</a>
          <Link to="/track" onClick={() => setMobileMenuOpen(false)} className="text-base font-bold text-obsidian dark:text-white hover:text-highland-gold uppercase tracking-widest py-2 border-b border-parchment-mid">{t('nav.trackOrder')}</Link>
          
          <div className="pt-2">
            {isAuthenticated && user ? (
              <Link to="/dashboard" className="flex items-center justify-center gap-2 w-full py-3 bg-parchment-mid rounded-full text-base font-bold text-obsidian dark:text-white">
                <span className="material-symbols-outlined text-lg">dashboard</span>
                {t('nav.dashboard')}
              </Link>
            ) : (
              <Link to="/dashboard" className="flex items-center justify-center gap-2 w-full py-3 bg-obsidian rounded-full text-base font-bold text-parchment uppercase tracking-wider">
                <span className="material-symbols-outlined text-lg">account_circle</span>
                {t('nav.login')}
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;



