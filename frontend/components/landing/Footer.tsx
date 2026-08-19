'use client';

import Link from 'next/link';
import { Brand } from '../Brand';

const COLS = [
  {
    title: 'Product',
    links: ['Features', 'Pricing', 'Security', 'Changelog'],
  },
  {
    title: 'Developers',
    links: ['API reference', 'Documentation', 'Status', 'Open source'],
  },
  {
    title: 'Company',
    links: ['About', 'Blog', 'Careers', 'Contact'],
  },
];

export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)' }}>
      <div className="footer-grid">
        <div className="footer-col footer-brand">
          <Brand />
          <p>Encrypted file storage with expiring shares, magic-byte validation, and sessions you can verify.</p>
        </div>
        {COLS.map((col) => (
          <div key={col.title} className="footer-col">
            <h4>{col.title}</h4>
            {col.links.map((l) => (
              <Link key={l} href="#">
                {l}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="footer-bottom">
        <span className="dim text-sm">© 2026 Vault</span>
        <div className="row" style={{ gap: '1.2rem' }}>
          <Link href="/login" className="link text-sm">
            Sign in
          </Link>
          <Link href="/register" className="link text-sm">
            Get started
          </Link>
          <span className="brand-mono">EXPRESS · POSTGRES · S3 · NEXT.JS</span>
        </div>
      </div>
    </footer>
  );
}