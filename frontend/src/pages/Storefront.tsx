import React, { useEffect, Suspense } from 'react';
import Header from '../components/storefront/Header';
import Hero from '../components/storefront/Hero';
import ScrollReveal from '../components/ui/ScrollReveal';

const DailyHighlights = React.lazy(() => import('../components/storefront/DailyHighlights'));
const BestSellers = React.lazy(() => import('../components/storefront/BestSellers'));
const StorySection = React.lazy(() => import('../components/storefront/StorySection'));
const ContactSection = React.lazy(() => import('../components/storefront/ContactSection'));
const Footer = React.lazy(() => import('../components/storefront/Footer'));
const OrderForm = React.lazy(() => import('../components/storefront/OrderForm'));

const Storefront: React.FC = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || params.get('aff');
    if (ref) {
      const code = ref.trim().toUpperCase();
      localStorage.setItem('referral_code', code);
      // Record the landing so the affiliate's engagement rate reflects real
      // link clicks, not just completed orders. Fire-and-forget: a failure
      // here must never affect the shopper's session.
      void fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/affiliate/track-click`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, path: window.location.pathname, source: 'storefront' }),
      }).catch(() => {});
    }

    if (window.location.hash) {
      setTimeout(() => {
        const el = document.querySelector(window.location.hash);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, []);

  return (
    <div className="storefront-page">
      <Header />
      <Hero />

      {/* Daily Highlights — fade up */}
      <ScrollReveal variant="fade-up" duration={800}>
        <Suspense fallback={null}><DailyHighlights /></Suspense>
      </ScrollReveal>

      {/* Best Sellers — zoom in from slightly below */}
      <ScrollReveal variant="zoom-in-up" duration={900} delay={50}>
        <Suspense fallback={null}><BestSellers /></Suspense>
      </ScrollReveal>

      {/* Story Section — slide from left */}
      <ScrollReveal variant="fade-left" duration={800} delay={0}>
        <Suspense fallback={null}><StorySection /></Suspense>
      </ScrollReveal>

      {/* Contact — slide from right */}
      <ScrollReveal variant="fade-right" duration={800} delay={0}>
        <Suspense fallback={null}><ContactSection /></Suspense>
      </ScrollReveal>

      {/* Footer — fade up */}
      <ScrollReveal variant="fade-up" duration={600} delay={0}>
        <Suspense fallback={null}><Footer /></Suspense>
      </ScrollReveal>

      <Suspense fallback={null}><OrderForm /></Suspense>
    </div>
  );
};

export default Storefront;
