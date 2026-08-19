'use client';

import Reveal from './Reveal';

const QUOTES = [
  {
    text: 'Vault replaced our shared Drive folder, and the \u201Cdid I remember to unshare it?\u201D anxiety went with it.',
    name: 'Maya Chen',
    role: 'Product Lead, Northwind',
  },
  {
    text: 'The rotating session model is the first auth I have reviewed in years where I had nothing to nitpick.',
    name: 'Diego Alvarez',
    role: 'Staff Engineer, Meridian',
  },
  {
    text: 'We ship links to clients and they just expire. No revoke dance, no orphaned files.',
    name: 'Priya Nair',
    role: 'Ops Manager, Foundry Labs',
  },
];

export default function Testimonials() {
  return (
    <section className="section-pad">
      <div className="container">
        <Reveal>
          <div className="sec-head center">
            <h2>People who stopped worrying about their files.</h2>
          </div>
        </Reveal>
        <div className="quote-grid">
          {QUOTES.map((q, i) => (
            <Reveal key={q.name} delay={i * 0.08}>
              <div className="quote-card">
                <p className="quote-text">\u201C{q.text}\u201D</p>
                <div className="quote-attrib">
                  <span className="avatar">{q.name.split(' ').map((n) => n[0]).join('')}</span>
                  <div>
                    <div className="quote-name">{q.name}</div>
                    <div className="quote-role">{q.role}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}