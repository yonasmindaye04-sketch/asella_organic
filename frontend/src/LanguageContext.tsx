import React, { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'en' | 'am' | 'or';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
  en: {
    'nav.home': 'Home',
    'nav.products': 'Products',
    'nav.about': 'About',
    'nav.contact': 'Contact',
    'nav.login': 'Login',
    'nav.dashboard': 'Dashboard',
    'header.language': 'Select language',
    'header.organic': 'Organic',
    'common.welcome': 'Welcome',
    'common.logout': 'Logout',
  },
  am: {
    'nav.home': 'ቤት',
    'nav.products': 'ምርቶች',
    'nav.about': 'ስለ እኛ',
    'nav.contact': 'ติດต่อ',
    'nav.login': 'ግባ',
    'nav.dashboard': 'dashboard',
    'header.language': 'ቋንቋ ይምረጡ',
    'header.organic': 'ኦርጋኒክ',
    'common.welcome': 'እንኳን ደህና መጣህ',
    'common.logout': 'ውጣ',
  },
  or: {
    'nav.home': 'Mana',
    'nav.products': 'Nyaata',
    'nav.about': 'Waaʼee Keenya',
    'nav.contact': 'Quunnamtii',
    'nav.login': 'Seene',
    'nav.dashboard': 'Qajeelfama',
    'header.language': 'Afaan Filadi',
    'header.organic': 'Organic',
    'common.welcome': 'Baga Nagaa Dhufe',
    'common.logout': 'Ba\'i',
  },
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const savedLanguage = localStorage.getItem('selectedLanguage') as Language | null;
    if (savedLanguage && ['en', 'am', 'or'].includes(savedLanguage)) {
      setLanguageState(savedLanguage);
      document.documentElement.lang = savedLanguage;
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('selectedLanguage', lang);
    document.documentElement.lang = lang;
  };

  const t = (key: string): string => {
    return translations[language][key] || translations['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
