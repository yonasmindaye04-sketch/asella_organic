import React, { useState } from 'react';
import { api } from '../../services/api';
import { useLanguage } from '../../LanguageContext';
import ViewOnMap from './ViewOnMap';

const ContactSection: React.FC = () => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({ full_name: '', phone_number: '', preferred_date: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus('idle');
    try {
      const res = await api.post('/api/appointments', formData);
      if (res.success) {
        setStatus('success');
        setFormData({ full_name: '', phone_number: '', preferred_date: '', email: '' });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="py-16 bg-parchment dark:bg-[#121212]" id="contact">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-12">
        
        {/* Header */}
        <div className="text-center mb-10">
          <p className="font-mono text-2xl text-highland-gold uppercase tracking-[0.2em] mb-3">
            {t('contact.subtitle')}
          </p>
          <h2 className="font-display-lg font-black text-obsidian dark:text-white text-4xl md:text-5xl leading-tight tracking-tight mb-4">
            {t('contact.title')}<span className="text-highland-gold">{t('contact.titleHighlight')}</span>
          </h2>
          <p className="text-slate-700 dark:text-slate-300 max-w-4xl mx-auto leading-relaxed text-2xl">
            {t('contact.desc')}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 md:gap-8 lg:gap-16">
          
          {/* Left Column */}
          <div className="space-y-10 flex flex-col">
            
            {/* Customer Support */}
            <div>
              <h3 className="text-xl font-display-lg font-bold text-obsidian dark:text-white mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-highland-gold text-[28px]">support_agent</span>
                {t('contact.supportTitle')}
              </h3>
              
              <div className="flex flex-wrap gap-4">
                {/* Amharic */}
                <div className="flex flex-grow basis-[280px] xl:basis-[calc(50%-8px)] min-w-0 items-center justify-between p-4 bg-white dark:bg-obsidian rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
                  <div>
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-1">{t('contact.amharicSupport')}</p>
                    <p className="text-lg font-bold text-obsidian dark:text-white font-mono">+251 909 122 623</p>
                  </div>
                  <a href="tel:+251909122623" className="w-11 h-11 bg-parchment-mid dark:bg-[#1A301D] rounded-full flex items-center justify-center text-highland-gold hover:bg-highland-gold hover:text-obsidian dark:text-white transition-colors shadow-sm border border-border">
                    <span className="material-symbols-outlined text-lg">call</span>
                  </a>
                </div>

                {/* Afaan Oromoo */}
                <div className="flex flex-grow basis-[280px] xl:basis-[calc(50%-8px)] min-w-0 items-center justify-between p-4 bg-white dark:bg-obsidian rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
                  <div>
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-1">{t('contact.oromooSupport')}</p>
                    <p className="text-lg font-bold text-obsidian dark:text-white font-mono">+251 942 223 999</p>
                  </div>
                  <a href="tel:+251942223999" className="w-11 h-11 bg-parchment-mid dark:bg-[#1A301D] rounded-full flex items-center justify-center text-highland-gold hover:bg-highland-gold hover:text-obsidian dark:text-white transition-colors shadow-sm border border-border">
                    <span className="material-symbols-outlined text-lg">call</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Locations */}
            <div className="grid sm:grid-cols-2 gap-6 pt-4 border-t border-border">
              <ViewOnMap
                title={t('contact.storePiasaTitle')}
                address={t('contact.storePiasaDesc')}
                mapQuery="Piasa Store, Piazza Giorgis, Ethel Apartment, Addis Ababa, Ethiopia"
                directionsUrl="https://maps.app.goo.gl/mssptHZ9dAXRCbCh7"
                viewOnMapLabel={t('contact.viewOnMap')}
                triggerLabel={t('contact.directions')}
                directionsLabel={t('contact.directions')}
                closeLabel={t('contact.closeMap')}
                icon={<span className="material-symbols-outlined text-highland-gold text-[20px]">storefront</span>}
              />

              <ViewOnMap
                title={t('contact.officeTitle')}
                address={t('contact.officeDesc')}
                mapQuery="Asella Organic Head Office, Addis Ababa, Ethiopia"
                directionsUrl="https://maps.app.goo.gl/qUfZBHcAL2784skT6?g_st=ic"
                viewOnMapLabel={t('contact.viewOnMap')}
                triggerLabel={t('contact.visitUs')}
                triggerIcon="map"
                directionsLabel={t('contact.directions')}
                closeLabel={t('contact.closeMap')}
                icon={<span className="material-symbols-outlined text-highland-gold text-[20px]">apartment</span>}
              />
            </div>
          </div>

          {/* Right Column: Appointment Form */}
          <div className="self-start mx-auto max-w-[460px] w-full bg-obsidian dark:bg-[#0A0A0A] rounded-[32px] p-6 md:p-6 text-white shadow-xl flex flex-col border border-highland-gold/20 relative overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-highland-gold/5 rounded-full blur-2xl pointer-events-none"></div>
            
            <h3 className="text-xl md:text-2xl font-display-lg font-bold mb-5 flex items-center gap-2 relative z-10">
              <span className="material-symbols-outlined text-highland-gold text-[24px] md:text-[28px]">calendar_month</span>
              {t('contact.formTitle')}
            </h3>

            <form className="space-y-3 relative z-10" onSubmit={handleSubmit}>
              {status === 'success' && (
                <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-3 rounded-xl text-base mb-4">
                  {t('contact.formSuccess')}
                </div>
              )}
              {status === 'error' && (
                <div className="bg-red-600 text-white border border-red-500/30 text-red-400 p-3 rounded-xl text-base mb-4">
                  {t('contact.formError')}
                </div>
              )}

              <div>
                <label className="block text-sm font-mono font-bold text-highland-gold uppercase tracking-widest mb-1.5 ml-1">{t('contact.fullName')}</label>
                <input 
                  type="text" 
                  required
                  value={formData.full_name}
                  onChange={e => setFormData(p => ({...p, full_name: e.target.value}))}
                  placeholder={t('contact.fullNamePlaceholder')}
                  className="w-full px-4 py-2 bg-white border border-transparent rounded-xl text-obsidian placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-highland-gold focus:border-transparent transition-all text-base font-sans" 
                />
              </div>

              <div>
                <label className="block text-sm font-mono font-bold text-highland-gold uppercase tracking-widest mb-1.5 ml-1">{t('contact.phone')}</label>
                <input 
                  type="tel" 
                  required
                  value={formData.phone_number}
                  onChange={e => setFormData(p => ({...p, phone_number: e.target.value}))}
                  placeholder={t('contact.phonePlaceholder')}
                  className="w-full px-4 py-2 bg-white border border-transparent rounded-xl text-obsidian placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-highland-gold focus:border-transparent transition-all text-base font-mono" 
                />
              </div>

              <div>
                <label className="block text-sm font-mono font-bold text-highland-gold uppercase tracking-widest mb-1.5 ml-1">{t('contact.email')}</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData(p => ({...p, email: e.target.value}))}
                  placeholder={t('contact.emailPlaceholder')}
                  className="w-full px-4 py-2 bg-white border border-transparent rounded-xl text-obsidian placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-highland-gold focus:border-transparent transition-all text-base font-mono" 
                />
              </div>

              <div>
                <label htmlFor="delivery-date" className="block text-sm font-mono font-bold text-highland-gold uppercase tracking-widest mb-1.5 ml-1">{t('contact.date')}</label>
                <input 
                  id="delivery-date"
                  type="date" 
                  required
                  value={formData.preferred_date}
                  onChange={e => setFormData(p => ({...p, preferred_date: e.target.value}))}
                  className="w-full px-4 py-2 bg-white border border-transparent rounded-xl text-obsidian placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-highland-gold focus:border-transparent transition-all text-base font-mono" 
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full py-2.5 bg-highland-gold hover:bg-highland-gold-light text-obsidian dark:text-white font-mono font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-sm uppercase tracking-widest shadow-lg hover:shadow-highland-gold/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? t('common.sending') : t('common.submit')}
                  {!loading && <span className="material-symbols-outlined text-[16px]">arrow_forward</span>}
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </section>
  );
};

export default ContactSection;






