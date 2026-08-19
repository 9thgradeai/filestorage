'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CaretDown } from '@phosphor-icons/react';
import Reveal, { EASE } from './Reveal';

const FAQS = [
  {
    q: 'Can people without an account download my shared files?',
    a: 'Yes. Public share links are open to anyone with the URL, and they stop working after 7 days. To revoke early, toggle the file private in the dashboard.',
  },
  {
    q: 'What encryption is used at rest?',
    a: 'Files are stored private in your S3 bucket with server-side AES-256 encryption. They stream to your browser over TLS and are forced to download as attachments.',
  },
  {
    q: 'How are my sessions protected?',
    a: 'Access tokens live for 15 minutes inside HttpOnly cookies. Refresh tokens rotate on every use and are revoked server-side on logout, so nothing survives in localStorage.',
  },
  {
    q: 'What file types are supported?',
    a: 'Anything the backend is configured to accept. Uploads are validated by their magic bytes rather than the client filename, so renamed or spoofed files are rejected.',
  },
  {
    q: 'Where do my files actually live?',
    a: 'In your own AWS S3 bucket. Vault never stores file bytes in the database, so there is no lock-in if you ever want to migrate.',
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();

  return (
    <section className="section-pad" id="faq">
      <div className="container">
        <Reveal>
          <div className="sec-head center">
            <h2>Questions, answered.</h2>
          </div>
        </Reveal>
        <Reveal>
          <div className="faq">
            {FAQS.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={f.q} className={`faq-item ${isOpen ? 'open' : ''}`}>
                  <button
                    className="faq-q"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {f.q}
                    <CaretDown className="faq-chevron" size={16} weight="bold" />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduce ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        style={{ overflow: 'hidden' }}
                      >
                        <p className="faq-a">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}