import React from 'react';
import { useLanguage } from '../../LanguageContext';

const Footer: React.FC = () => {
  const { t } = useLanguage();
  return (
    <footer className="bg-obsidian dark:bg-[#0A0A0A] text-white py-8 relative border-t border-highland-gold/10">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Row: Brand (Left) | Social Icons (Right) */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-5 border-b border-highland-gold/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-highland-gold text-2xl animate-pulse">eco</span>
            <span className="font-comfortaa text-lg font-black uppercase tracking-tight text-white select-none">
              Asella <span className="text-highland-gold">Organic</span>
            </span>
          </div>
        </div>

        {/* Main Grid: Columns */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-6 text-base font-sans">

          {/* Column 1: Developer */}
          <div>
            <h4 className="font-mono font-bold text-highland-gold mb-4 text-sm uppercase tracking-widest">Developer</h4>
            <ul className="space-y-2 text-parchment font-mono text-base">
              <li className="flex items-center gap-2">
                <i className="fab fa-telegram text-highland-gold text-base"></i>
                <a href="https://t.me/yona64" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">@yona64</a>
              </li>
              <li className="flex items-center gap-2">
                <i className="fab fa-whatsapp text-highland-gold text-base"></i>
                <a href="https://wa.me/2510910011818" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">0910011818</a>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-highland-gold text-lg">mail</span>
                <a href="mailto:yonasmindaye04@gmail.com" className="hover:text-white transition-colors break-all">yonasmindaye04@gmail.com</a>
              </li>
            </ul>
          </div>

          {/* Column 2: Payment */}
          <div>
            <h4 className="font-mono font-bold text-highland-gold mb-4 text-sm uppercase tracking-widest">{t('footer.paymentOptions')}</h4>
            <ul className="space-y-2 text-parchment font-mono text-base">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-highland-gold rounded-full"></span> Telebirr
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-highland-gold rounded-full"></span> CBE Birr
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-highland-gold rounded-full"></span> BOA Mobile
              </li>
            </ul>
          </div>

          {/* Column 3: Links */}
          <div>
            <h4 className="font-mono font-bold text-highland-gold mb-4 text-sm uppercase tracking-widest">{t('footer.importantLinks')}</h4>
            <ul className="space-y-2 text-parchment font-mono text-base">
              <li><a href="/" className="hover:text-white transition-colors">{t('footer.home')}</a></li>
              <li><a href="#products" className="hover:text-white transition-colors">{t('footer.catalog')}</a></li>
              <li><a href="#story" className="hover:text-white transition-colors">{t('footer.ourStory')}</a></li>
              <li><a href="/" className="hover:text-white transition-colors">{t('footer.privacyPolicy')}</a></li>
            </ul>
          </div>

          {/* Column 4: Social Media */}
          <div>
            <h4 className="font-mono font-bold text-highland-gold mb-4 text-sm uppercase tracking-widest">{t('footer.followUs')}</h4>
            <ul className="space-y-2 text-parchment font-mono text-base">
              <li><a href="https://t.me/asella_organic" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors"><i className="fab fa-telegram text-base"></i> Telegram</a></li>
              <li><a href="https://www.facebook.com/share/1FkhkuGamB/" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors"><i className="fab fa-facebook-f text-base"></i> Facebook</a></li>
              <li><a href="https://www.instagram.com/asella_organic" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors"><i className="fab fa-instagram text-base"></i> Instagram</a></li>
              <li><a href="https://www.tiktok.com/@asellaorganic" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors"><i className="fab fa-tiktok text-base"></i> TikTok</a></li>
            </ul>
          </div>

          {/* Column 5: Contact */}
          <div>
            <h4 className="font-mono font-bold text-highland-gold mb-4 text-sm uppercase tracking-widest">{t('footer.contact')}</h4>
            <ul className="space-y-2 text-parchment font-mono text-base">
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-highland-gold text-lg">mail</span>
                support@asellaorganic.com
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-highland-gold text-lg">call</span>
                +251 909 122 623
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-highland-gold text-lg">location_on</span>
                Asella, Ethiopia
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-4 border-t border-highland-gold/10 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-parchment font-mono">
          <p>{t('footer.rights')}</p>
          <div className="flex gap-4">
            <a href="/" className="hover:text-white transition-colors">{t('footer.privacyPolicy')}</a>
            <a href="/" className="hover:text-white transition-colors">{t('footer.termsOfService')}</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;



