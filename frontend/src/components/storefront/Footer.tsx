import React from 'react';
import { useLanguage } from '../../LanguageContext';

const TelegramIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" className="w-4 h-4 fill-current text-highland-gold" aria-hidden="true">
    <path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zM362.2 165.5l-34.3 161.4c-2.6 11.5-9.3 14.3-18.9 8.9l-52.2-38.5-25.2 24.3c-2.8 2.8-5.1 5.1-10.5 5.1l3.7-52.5 95.6-86.4c4.1-3.7-0.9-5.7-6.4-2.1l-118.1 74.5-50.9-16c-11.1-3.5-11.3-11.1 2.3-16.4l199-76.7c9.3-3.4 17.4 2.3 14.4 16.4z"/>
  </svg>
);

const WhatsAppIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-4 h-4 fill-current text-highland-gold" aria-hidden="true">
    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32 100.5 32 0 132.5 0 256c0 45.3 11.9 89.8 34.5 129.3L22.9 486l101.4-30.5c38.5 21 82.1 32.5 127.3 32.5 70.8 0 136.6-27.6 186.5-77.6 49.9-50 77.5-115.8 77.5-186.6-.1-59.2-23.7-115-65.7-156.9zm-157 242.2c-17.8 0-31.5-2.7-42.2-7.2l-75.3 22.7 22.3-73.5c-5.4-11-11.8-23.4-11.8-40.9 0-52.1 42.1-94.2 94.2-94.2 25.2 0 48.7 9.8 66.5 27.6 17.9 17.8 27.7 41.4 27.7 66.5 0 52.2-42.1 94.2-94.2 94.2zm49.8-95.1c-1.2-1.2-3.1-2.1-6.5-3.7-3.4-1.6-20.1-9.9-23.2-11.1-3.1-1.2-5.4-1.8-7.6.9-2.2 2.7-8.7 10.7-10.7 12.9-2 2.2-4 2.5-7.4.9-3.4-1.6-14.5-5.3-27.6-17.1-10.2-9.2-17.1-20.5-19.1-24-2-3.5-.2-5.4 1.5-7.1 1.5-1.5 3.4-4 5.1-6 1.7-2 2.3-3.4 3.4-5.7 1.1-2.3.6-4.3-.3-6-0.9-1.7-7.6-18.4-10.5-25.2-2.8-6.6-5.6-5.5-7.6-5.6-2 0-4.3-.3-6.5-.3-2.3 0-5.9.8-9 3.7-3.1 2.9-11.8 11.5-11.8 28.1s12.1 32.6 13.8 34.8c1.7 2.2 23.8 36.3 57.7 50.9 8.1 3.5 14.4 5.6 19.3 7.2 8.1 2.6 15.5 2.2 21.3 1.4 6.5-0.9 20.1-8.2 22.9-16.1 2.9-7.9 2.9-14.7 2-16.1-0.9-1.4-1.2-1.5-2.2-2.3z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-4 h-4 fill-current text-highland-gold" aria-hidden="true">
    <path d="M504 256C504 119 393 8 256 8S8 119 8 256c0 123.8 90.7 226.4 209.3 245V327.7h-63V256h63v-54.6c0-62.2 37-96.5 93.7-96.5 27.1 0 55.5 4.8 55.5 4.8v61h-31.3c-30.8 0-40.4 19.1-40.4 38.7V256h68.8l-11 71.7h-57.8V501C413.3 482.4 504 379.8 504 256z"/>
  </svg>
);

const InstagramIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-4 h-4 fill-current text-highland-gold" aria-hidden="true">
    <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/>
  </svg>
);

const TikTokIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-4 h-4 fill-current text-highland-gold" aria-hidden="true">
    <path d="M448 209.9a210.1 210.1 0 0 1-122.8-39.3V349.4A162.6 162.6 0 1 1 185 188.3V278.5a74.6 74.6 0 1 0 52.2 71.2V0h88a121.4 121.4 0 0 0 1.9 22.2h0A122.2 122.2 0 0 0 381 102.4a121.4 121.4 0 0 0 67 20.1z"/>
  </svg>
);

const Footer: React.FC = () => {
  const { t } = useLanguage();
  return (
    <footer className="bg-obsidian dark:bg-[#0A0A0A] text-white py-8 relative border-t border-highland-gold/10">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Row: Brand (Left) | Social Icons (Right) */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-5 border-b border-highland-gold/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-highland-gold text-2xl">eco</span>
            <span className="font-comfortaa text-lg font-black uppercase tracking-tight text-white select-none">
              Asella <span className="text-highland-gold">Organic</span>
            </span>
          </div>
        </div>

        {/* Main Grid: Columns */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-6 text-base font-sans">

          {/* Column 1: Developer */}
          <div>
            <h3 className="font-mono font-bold text-highland-gold mb-4 text-sm uppercase tracking-widest">Developer</h3>
            <ul className="space-y-2 text-parchment font-mono text-base">
              <li className="flex items-center gap-2">
                <TelegramIcon />
                <a href="https://t.me/yona64" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">@yona64</a>
              </li>
              <li className="flex items-center gap-2">
                <WhatsAppIcon />
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
            <h3 className="font-mono font-bold text-highland-gold mb-4 text-sm uppercase tracking-widest">{t('footer.paymentOptions')}</h3>
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
            <h3 className="font-mono font-bold text-highland-gold mb-4 text-sm uppercase tracking-widest">{t('footer.importantLinks')}</h3>
            <ul className="space-y-2 text-parchment font-mono text-base">
              <li><a href="/" className="hover:text-white transition-colors">{t('footer.home')}</a></li>
              <li><a href="#products" className="hover:text-white transition-colors">{t('footer.catalog')}</a></li>
              <li><a href="#story" className="hover:text-white transition-colors">{t('footer.ourStory')}</a></li>
              <li><a href="/" className="hover:text-white transition-colors">{t('footer.privacyPolicy')}</a></li>
            </ul>
          </div>

          {/* Column 4: Social Media */}
          <div>
            <h3 className="font-mono font-bold text-highland-gold mb-4 text-sm uppercase tracking-widest">{t('footer.followUs')}</h3>
            <ul className="space-y-2 text-parchment font-mono text-base">
              <li><a href="https://t.me/asella_organic" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors"><TelegramIcon /> Telegram</a></li>
              <li><a href="https://www.facebook.com/share/1FkhkuGamB/" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors"><FacebookIcon /> Facebook</a></li>
              <li><a href="https://www.instagram.com/asella_organic" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors"><InstagramIcon /> Instagram</a></li>
              <li><a href="https://www.tiktok.com/@asellaorganic" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors"><TikTokIcon /> TikTok</a></li>
            </ul>
          </div>

          {/* Column 5: Contact */}
          <div>
            <h3 className="font-mono font-bold text-highland-gold mb-4 text-sm uppercase tracking-widest">{t('footer.contact')}</h3>
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
