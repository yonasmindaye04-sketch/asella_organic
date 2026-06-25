import React, { useEffect } from 'react';
import Header from '../components/storefront/Header';
import Hero from '../components/storefront/Hero';
import DailyHighlights from '../components/storefront/DailyHighlights';
import BestSellers from '../components/storefront/BestSellers';
import StorySection from '../components/storefront/StorySection';
import Reviews from '../components/storefront/Reviews';
import ContactSection from '../components/storefront/ContactSection';
import Footer from '../components/storefront/Footer';
import OrderForm from '../components/storefront/OrderForm';

const Storefront: React.FC = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || params.get('aff');
    if (ref) {
      localStorage.setItem('referral_code', ref);
    }
  }, []);

  return (
    <>
      <Header />
      <Hero />
      <DailyHighlights />
      <BestSellers />
      <StorySection />
      <Reviews />
      <ContactSection />
      <Footer />
      <OrderForm />
    </>
  );
};

export default Storefront;
