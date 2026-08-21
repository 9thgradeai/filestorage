'use client';

import { TerminalWindow, Copy } from '@phosphor-icons/react';
import Reveal from './Reveal';

const SNIPPET = `# register a user
curl -X POST $VAULT_URL/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@company.com","password":"Str0ng!Pass1"}'

# upload a file (magic bytes are checked server-side)
curl -X POST $VAULT_URL/api/files/upload \\
  -H "X-CSRF-Token: $CSRF" \\
  -F "file=@contract.pdf"

# mint an expiring share link
curl -X POST $VAULT_URL/api/files/1/share
# → { "share_url": "$VAULT_URL/shared/9f2c...a41e" }`;

export default function ApiSection() {
  return (
    <section className="section-pad">
      <div className="container">
        <div className="split-grid">
          <Reveal>
            <div className="sec-head" style={{ marginBottom: 0 }}>
              <h2>Built for developers.</h2>
              <p>
                A clean JSON API and cookie-first auth that also speaks Bearer tokens. Every
                capability of the dashboard is scriptable.
              </p>
              <div className="row" style={{ marginTop: '1.5rem', gap: '0.9rem', flexWrap: 'wrap' }}>
                {['JSON everywhere', 'CSRF-aware clients', 'Bearer-friendly'].map((t) => (
                  <span key={t} className="format-pill">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="code-block" style={{ position: 'relative' }}>
              <div
                className="eyebrow-pill"
                style={{
                  position: 'absolute',
                  top: '0.9rem',
                  right: '0.9rem',
                  fontSize: '0.6rem',
                  padding: '0.3rem 0.7rem',
                }}
              >
                <TerminalWindow size={12} weight="bold" aria-hidden="true" />
                REST API
              </div>
              {SNIPPET.split('\n').map((line, i) => (
                <div key={i} style={{ whiteSpace: 'pre' }}>
                  {line}
                </div>
              ))}
              <button
                className="side-icon"
                style={{ position: 'absolute', bottom: '0.9rem', right: '0.9rem' }}
                aria-label="Copy snippet"
                title="Copy snippet"
                onClick={() => navigator.clipboard.writeText(SNIPPET)}
              >
                <Copy size={15} weight="bold" aria-hidden="true" />
              </button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}