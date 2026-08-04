import React, { useEffect } from 'react';
import Header from '../components/storefront/Header';
import Footer from '../components/storefront/Footer';
import ScrollReveal from '../components/ui/ScrollReveal';
import { useLanguage } from '../LanguageContext';

const PrivacyPolicy: React.FC = () => {
  const { t } = useLanguage();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-parchment dark:bg-obsidian text-obsidian dark:text-white flex flex-col">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto px-6 py-16 lg:py-24">
        <ScrollReveal variant="fade-up" duration={700}>
          <div className="text-center mb-12">
            <p className="font-mono text-sm uppercase tracking-widest text-highland-gold mb-2">Legal & Trust</p>
            <h1 className="font-heading font-black text-4xl md:text-5xl text-obsidian dark:text-white tracking-tight">
              {t('footer.privacyPolicy') || 'Privacy Policy'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 font-mono">
              Last Updated: August 4, 2026
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal variant="fade-up" duration={800} delay={100}>
          <div className="bg-white dark:bg-obsidian-mid p-8 md:p-12 rounded-3xl border border-border shadow-sm space-y-8 text-slate-700 dark:text-slate-200 leading-relaxed font-sans text-base">
            
            <section>
              <h2 className="text-xl font-bold text-obsidian dark:text-white mb-3 flex items-center gap-2">
                <span className="text-highland-gold font-mono text-base">01.</span> Introduction
              </h2>
              <p>
                Welcome to <strong>Asella Organic</strong>. We prioritize the trust and privacy of our customers. This Privacy Policy outlines how we collect, use, protect, and handle your personal information when you visit our website, place orders, or interact with our services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-obsidian dark:text-white mb-3 flex items-center gap-2">
                <span className="text-highland-gold font-mono text-base">02.</span> Information We Collect
              </h2>
              <p className="mb-2">We collect information necessary to fulfill your orders and improve your experience:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Order & Delivery Details:</strong> Name, phone number, delivery address (city, subcity, woreda, house number).</li>
                <li><strong>Payment Verification:</strong> Payment transaction receipts uploaded for manual verification.</li>
                <li><strong>Referral Information:</strong> Referral codes used when making purchases via affiliate links.</li>
                <li><strong>Usage Data:</strong> Basic browser telemetry for performance optimization.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-obsidian dark:text-white mb-3 flex items-center gap-2">
                <span className="text-highland-gold font-mono text-base">03.</span> How We Use Your Information
              </h2>
              <p className="mb-2">Your information is strictly used for:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Processing and delivering your organic product orders.</li>
                <li>Sending real-time delivery notifications via our customer tracking and Telegram fulfillment system.</li>
                <li>Providing customer support regarding order inquiries.</li>
                <li>Calculating referral commissions for authorized brand partners.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-obsidian dark:text-white mb-3 flex items-center gap-2">
                <span className="text-highland-gold font-mono text-base">04.</span> Data Security & Protection
              </h2>
              <p>
                We implement strict security measures including encrypted HTTP data transmission (SSL/TLS), role-based access control (RBAC), and 2-factor authentication for staff members. We do not sell, rent, or lease your personal data to third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-obsidian dark:text-white mb-3 flex items-center gap-2">
                <span className="text-highland-gold font-mono text-base">05.</span> Contact Us
              </h2>
              <p>
                If you have any questions or concerns regarding this Privacy Policy or your data, please contact our support team via our official channels on the storefront.
              </p>
            </section>

          </div>
        </ScrollReveal>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
