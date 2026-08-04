import React, { useEffect } from 'react';
import Header from '../components/storefront/Header';
import Footer from '../components/storefront/Footer';
import ScrollReveal from '../components/ui/ScrollReveal';
import { useLanguage } from '../LanguageContext';

const TermsOfService: React.FC = () => {
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
              {t('footer.termsOfService') || 'Terms of Service'}
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
                <span className="text-highland-gold font-mono text-base">01.</span> Agreement to Terms
              </h2>
              <p>
                By accessing or using the <strong>Asella Organic</strong> website and services, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access our service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-obsidian dark:text-white mb-3 flex items-center gap-2">
                <span className="text-highland-gold font-mono text-base">02.</span> Products and Orders
              </h2>
              <p className="mb-2">When placing an order for our organic products:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>All products are subject to availability. We reserve the right to discontinue any product at any time.</li>
                <li>Prices are subject to change without notice.</li>
                <li>You agree to provide current, complete, and accurate purchase and account information for all purchases made at our store.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-obsidian dark:text-white mb-3 flex items-center gap-2">
                <span className="text-highland-gold font-mono text-base">03.</span> Payment and Delivery
              </h2>
              <p className="mb-2">Our payment and fulfillment process:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>We currently accept local mobile payment methods (Telebirr, CBE Birr, BOA Mobile).</li>
                <li>Delivery times are estimates and may vary based on location and external conditions.</li>
                <li>Orders are verified manually. If payment is not verified, the order may be canceled or delayed.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-obsidian dark:text-white mb-3 flex items-center gap-2">
                <span className="text-highland-gold font-mono text-base">04.</span> Limitation of Liability
              </h2>
              <p>
                In no event shall Asella Organic, nor its directors, employees, or partners, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-obsidian dark:text-white mb-3 flex items-center gap-2">
                <span className="text-highland-gold font-mono text-base">05.</span> Contact Us
              </h2>
              <p>
                If you have any questions about these Terms, please contact our support team.
              </p>
            </section>

          </div>
        </ScrollReveal>
      </main>

      <Footer />
    </div>
  );
};

export default TermsOfService;
