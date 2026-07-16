import React, { useState } from 'react';
import { api } from '../../services/api';
import { useLanguage } from '../../LanguageContext';

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

        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-stretch">
          
          {/* Left Column */}
          <div className="space-y-10 flex flex-col justify-center">
            
            {/* Customer Support */}
            <div>
              <h3 className="text-xl font-display-lg font-bold text-obsidian dark:text-white mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-highland-gold text-[28px]">support_agent</span>
                {t('contact.supportTitle')}
              </h3>
              
              <div className="space-y-4">
                {/* Amharic */}
                <div className="flex items-center justify-between p-4 bg-white dark:bg-obsidian rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
                  <div>
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-1">{t('contact.amharicSupport')}</p>
                    <p className="text-lg font-bold text-obsidian dark:text-white font-mono">+251 909 122 623</p>
                  </div>
                  <a href="tel:+251909122623" className="w-11 h-11 bg-parchment-mid dark:bg-[#1A301D] rounded-full flex items-center justify-center text-highland-gold hover:bg-highland-gold hover:text-obsidian dark:text-white transition-colors shadow-sm border border-border">
                    <span className="material-symbols-outlined text-lg">call</span>
                  </a>
                </div>

                {/* Afaan Oromoo */}
                <div className="flex items-center justify-between p-4 bg-white dark:bg-obsidian rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
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
              <div className="bg-white dark:bg-obsidian p-5 rounded-2xl border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-highland-gold text-[20px]">storefront</span>
                  <h4 className="font-bold text-obsidian dark:text-white text-base">{t('contact.storePiasaTitle')}</h4>
                </div>
                <p className="text-base text-slate-900 dark:text-slate-300 mb-3 leading-relaxed">
                  {t('contact.storePiasaDesc')}
                </p>
                <a href="https://maps.app.goo.gl/mssptHZ9dAXRCbCh7" className="inline-flex items-center gap-1.5 text-sm font-mono font-bold uppercase tracking-wider text-highland-gold hover:text-highland-gold-light transition-colors">
                  <span className="material-symbols-outlined text-[14px]">explore</span>
                  {t('contact.directions')}
                </a>
              </div>

              <div className="bg-white dark:bg-obsidian p-5 rounded-2xl border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-highland-gold text-[20px]">apartment</span>
                  <h4 className="font-bold text-obsidian dark:text-white text-base">{t('contact.officeTitle')}</h4>
                </div>
                <p className="text-base text-slate-900 dark:text-slate-300 mb-3 leading-relaxed">
                  {t('contact.officeDesc')}
                </p>
                <a href="https://maps.app.goo.gl/qUfZBHcAL2784skT6?g_st=ic" className="inline-flex items-center gap-1.5 text-sm font-mono font-bold uppercase tracking-wider text-highland-gold hover:text-highland-gold-light transition-colors">
                  <span className="material-symbols-outlined text-[14px]">map</span>
                  {t('contact.visitUs')}
                </a>
              </div>
            </div>
          </div>

          {/* Right Column: Appointment Form */}
          <div className="bg-obsidian dark:bg-[#0A0A0A] rounded-[32px] p-6 md:p-8 text-white shadow-xl flex flex-col justify-center border border-highland-gold/20 relative overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-highland-gold/5 rounded-full blur-2xl pointer-events-none"></div>
            
            <h3 className="text-2xl md:text-3xl font-display-lg font-bold mb-6 flex items-center gap-3 relative z-10">
              <span className="material-symbols-outlined text-highland-gold text-[28px] md:text-[32px]">calendar_month</span>
              {t('contact.formTitle')}
            </h3>

            <form className="space-y-4 relative z-10" onSubmit={handleSubmit}>
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
                  className="w-full px-4 py-2.5 bg-white border border-transparent rounded-xl text-obsidian placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-highland-gold focus:border-transparent transition-all text-base font-sans" 
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
                  className="w-full px-4 py-2.5 bg-white border border-transparent rounded-xl text-obsidian placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-highland-gold focus:border-transparent transition-all text-base font-mono" 
                />
              </div>

              <div>
                <label className="block text-sm font-mono font-bold text-highland-gold uppercase tracking-widest mb-1.5 ml-1">{t('contact.email')}</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData(p => ({...p, email: e.target.value}))}
                  placeholder={t('contact.emailPlaceholder')}
                  className="w-full px-4 py-2.5 bg-white border border-transparent rounded-xl text-obsidian placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-highland-gold focus:border-transparent transition-all text-base font-mono" 
                />
              </div>

              <div>
                <label className="block text-sm font-mono font-bold text-highland-gold uppercase tracking-widest mb-1.5 ml-1">{t('contact.date')}</label>
                <input 
                  type="date" 
                  required
                  value={formData.preferred_date}
                  onChange={e => setFormData(p => ({...p, preferred_date: e.target.value}))}
                  className="w-full px-4 py-2.5 bg-white border border-transparent rounded-xl text-obsidian placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-highland-gold focus:border-transparent transition-all text-base font-mono" 
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full py-3 bg-highland-gold hover:bg-highland-gold-light text-obsidian dark:text-white font-mono font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-base uppercase tracking-widest shadow-lg hover:shadow-highland-gold/25 disabled:opacity-50 disabled:cursor-not-allowed"
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






