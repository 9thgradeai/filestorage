'use client';

import Nav from '../components/landing/Nav';
import Hero from '../components/landing/Hero';
import Ticker from '../components/landing/Ticker';
import Guarantees from '../components/landing/Guarantees';
import StickyStack from '../components/landing/StickyStack';
import Features from '../components/landing/Features';
import ApiSection from '../components/landing/ApiSection';
import HowItWorks from '../components/landing/HowItWorks';
import Faq from '../components/landing/Faq';
import CtaBand from '../components/landing/CtaBand';
import Footer from '../components/landing/Footer';

export default function HomePage() {
  return (
    <div>
      <Nav />
      <Hero />
      <Ticker />
      <Guarantees />
      <StickyStack />
      <Features />
      <ApiSection />
      <HowItWorks />
      <Faq />
      <CtaBand />
      <Footer />
    </div>
  );
}