'use client';

import Link from 'next/link';
import { Check } from '@phosphor-icons/react';
import Reveal from './Reveal';

const PLANS = [
  {
    name: 'Solo',
    price: '$0',
    per: 'forever',
    features: ['2 GB storage', 'Files up to 100 MB', 'Expiring share links', 'Community support'],
    cta: 'Get started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$9',
    per: 'per month',
    features: ['100 GB storage', 'Files up to 1 GB', 'Custom expiry windows', 'Priority support'],
    cta: 'Get started',
    highlight: true,
  },
  {
    name: 'Team',
    price: '$24',
    per: 'per month',
    features: ['1 TB shared storage', 'SSO-ready sessions', 'Audit log of every action', 'Dedicated support'],
    cta: 'Get started',
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <section className="section-pad" id="pricing">
      <div className="container">
        <Reveal>
          <div className="sec-head center">
            <h2>Pricing that scales with trust.</h2>
            <p>Start free. Upgrade when your vault does.</p>
          </div>
        </Reveal>
        <div className="pricing-grid">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08}>
              <div className={`price-card ${p.highlight ? 'highlight' : ''}`}>
                {p.highlight && <span className="price-pop">Most popular</span>}
                <div>
                  <div className="price-name">{p.name}</div>
                  <div className="price-tag">{p.price}</div>
                  <div className="price-per">{p.per}</div>
                </div>
                <ul className="price-feats">
                  {p.features.map((f) => (
                    <li key={f}>
                      <span className="ok">
                        <Check size={15} weight="bold" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`btn ${p.highlight ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {p.cta}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}