import React, { useEffect, Suspense } from 'react';
import Header from '../components/storefront/Header';
import Hero from '../components/storefront/Hero';

const DailyHighlights = React.lazy(() => import('../components/storefront/DailyHighlights'));
const BestSellers = React.lazy(() => import('../components/storefront/BestSellers'));
const StorySection = React.lazy(() => import('../components/storefront/StorySection'));
const Reviews = React.lazy(() => import('../components/storefront/Reviews'));
const ContactSection = React.lazy(() => import('../components/storefront/ContactSection'));
const Footer = React.lazy(() => import('../components/storefront/Footer'));
const OrderForm = React.lazy(() => import('../components/storefront/OrderForm'));

const Storefront: React.FC = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || params.get('aff');
    if (ref) {
      localStorage.setItem('referral_code', ref);
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
      <Suspense fallback={null}><DailyHighlights /></Suspense>
      <Suspense fallback={null}><BestSellers /></Suspense>
      <Suspense fallback={null}><StorySection /></Suspense>
      <Suspense fallback={null}><Reviews /></Suspense>
      <Suspense fallback={null}><ContactSection /></Suspense>
      <Suspense fallback={null}><Footer /></Suspense>
      <Suspense fallback={null}><OrderForm /></Suspense>
    </div>
  );
};

export default Storefront;
