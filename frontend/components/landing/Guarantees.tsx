'use client';

import { ShieldCheck, LockKey, DownloadSimple } from '@phosphor-icons/react';
import Reveal from './Reveal';

const ITEMS = [
  {
    icon: ShieldCheck,
    title: 'Zero tokens in localStorage',
    body: 'Access and refresh tokens live in HttpOnly cookies. The refresh token rotates on every use and is revoked server-side on logout.',
  },
  {
    icon: LockKey,
    title: 'Double-submit CSRF',
    body: 'Every mutating browser request must echo the signed cookie back as a header. API clients using Bearer tokens are CSRF-exempt.',
  },
  {
    icon: DownloadSimple,
    title: 'Forced download, always',
    body: 'Shared files stream from S3 over TLS as attachments with nosniff. Nothing renders inline, nothing gets cached open.',
  },
];

export default function Guarantees() {
  return (
    <section className="section-pad" id="security">
      <div className="container">
        <Reveal>
          <div className="sec-head">
            <h2>Security you can verify, not just read about.</h2>
            <p>
              Every claim below is enforced in the code, not pasted on a landing page. That is the
              whole point of this product.
            </p>
          </div>
        </Reveal>
        <div className="guarantee-grid">
          {ITEMS.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.08}>
              <div className="guarantee">
                <span className="bento-icon" aria-hidden="true">
                  <item.icon size={20} weight="duotone" />
                </span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}