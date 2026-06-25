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
    'nav.trackOrder': 'Track Order',
    'header.language': 'Select language',
    'header.organic': 'Organic',
    'common.welcome': 'Welcome',
    'common.logout': 'Logout',
    
    // Hero Section
    'hero.title1': "Nature's Purity,",
    'hero.title2': "Packaged for You.",
    'hero.subtitle': "Premium organic supplements, ethically sourced from Ethiopian farms and delivered with care.",
    'hero.btn.order': "Place an Order",
    'hero.btn.about': "About Us",
    'hero.btn.bulk': "Bulk Orders",
    'hero.stat.products': "Products",
    'hero.stat.customers': "Customers",
    'hero.stat.natural': "Natural",
    'hero.stat.farms': "Local Farms",
  },
  am: {
    'nav.home': 'ቤት',
    'nav.products': 'ምርቶች',
    'nav.about': 'ስለ እኛ',
    'nav.contact': 'አግኙን',
    'nav.login': 'ግባ',
    'nav.dashboard': 'ዳሽቦርድ',
    'nav.trackOrder': 'ትዕዛዝ ተከታተል',
    'header.language': 'ቋንቋ ይምረጡ',
    'header.organic': 'ኦርጋኒክ',
    'common.welcome': 'እንኳን ደህና መጣህ',
    'common.logout': 'ውጣ',

    // Hero Section
    'hero.title1': "የተፈጥሮ ንፅህና፣",
    'hero.title2': "ለእርስዎ ታሽጎ ቀርቧል።",
    'hero.subtitle': "ፕሪሚየም ኦርጋኒክ ተጨማሪዎች፣ ከኢትዮጵያ እርሻዎች በስነ-ምግባር የተገኙ እና በጥንቃቄ የሚደርሱ።",
    'hero.btn.order': "ትዕዛዝ ያስገቡ",
    'hero.btn.about': "ስለ እኛ",
    'hero.btn.bulk': "የጅምላ ትዕዛዞች",
    'hero.stat.products': "ምርቶች",
    'hero.stat.customers': "ደንበኞች",
    'hero.stat.natural': "ተፈጥሯዊ",
    'hero.stat.farms': "የሀገር ውስጥ እርሻዎች",
  },
  or: {
    'nav.home': 'Mana',
    'nav.products': 'Oomisha',
    'nav.about': 'Waaʼee Keenya',
    'nav.contact': 'Quunnamtii',
    'nav.login': 'Seeni',
    'nav.dashboard': 'Daashboordii',
    'nav.trackOrder': 'Ajaja Hordofi',
    'header.language': 'Afaan Filadhu',
    'header.organic': 'Uumamaa',
    'common.welcome': 'Baga Nagaan Dhuftan',
    'common.logout': 'Baʼi',

    // Hero Section
    'hero.title1': "Qulqullina Uumamaa,",
    'hero.title2': "Isiniif Qophaa'e.",
    'hero.subtitle': "Oomishaalee uumamaa qulqullina qaban, qonnaan bultoota Itoophiyaa irraa haala gaariin kan sassaabaman.",
    'hero.btn.order': "Ajaji",
    'hero.btn.about': "Waaʼee Keenya",
    'hero.btn.bulk': "Ajaja Jumlaa",
    'hero.stat.products': "Oomishaalee",
    'hero.stat.customers': "Maamiltoota",
    'hero.stat.natural': "Uumamaa",
    'hero.stat.farms': "Qonna Naannoo",
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
