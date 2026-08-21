'use client';

import { Fingerprint, ArrowsClockwise, Hourglass, ShieldCheck, Sparkle } from '@phosphor-icons/react';
import Reveal from './Reveal';

export default function Features() {
  return (
    <section className="section-pad" id="features">
      <div className="container">
        <Reveal>
          <div className="sec-head center">
            <h2>Every layer trusts nothing.</h2>
            <p>
              A security checklist that is actually implemented, not aspirational.
            </p>
          </div>
        </Reveal>

        <div className="bento">
          <Reveal className="bento-wide">
            <div className="bento-cell cell-glow">
              <span className="bento-icon" aria-hidden="true">
                <Fingerprint size={20} weight="duotone" />
              </span>
              <h3>Content-aware validation</h3>
              <p>
                Uploads are inspected by magic bytes, not the client&apos;s word. Extension and MIME
                mismatches are rejected before anything touches storage.
              </p>
              <div className="term-card">
                <div>
                  <span className="dim">$ </span>vault inspect contract.pdf
                </div>
                <div>mime_type&nbsp;&nbsp;&nbsp;-&gt; application/pdf&nbsp;&nbsp;<span className="ok">[ok]</span></div>
                <div>magic_bytes -&gt; %PDF-1.7&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="ok">[ok]</span></div>
                <div>verdict&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-&gt; <span className="ok">accepted</span></div>
              </div>
            </div>
          </Reveal>

          <Reveal className="bento-tall" delay={0.08}>
            <div className="bento-cell">
              <span className="bento-icon" aria-hidden="true">
                <ArrowsClockwise size={20} weight="duotone" />
              </span>
              <h3>Rotating sessions</h3>
              <p>
                Access tokens expire in 15 minutes. Refresh tokens rotate on every use and are
                revoked server-side on logout.
              </p>
              <div className="term-card">
                <div className="dim">access → 15 min</div>
                <div className="dim">refresh → rotates</div>
                <div className="ok">logout → revoked</div>
              </div>
            </div>
          </Reveal>

          <Reveal className="bento-tall" delay={0.08}>
            <div className="bento-cell">
              <span className="bento-icon" aria-hidden="true">
                <Hourglass size={20} weight="duotone" />
              </span>
              <h3>Expiring shares</h3>
              <p>
                Public links die on a timer. Flip a file public and mint a link that stops working
                after 7 days.
              </p>
              <div className="link-card">
                <div className="link-url">/shared/9f2c…a41e</div>
                <div>expires → in 7 days</div>
              </div>
            </div>
          </Reveal>

          <Reveal className="bento-wide" delay={0.08}>
            <div className="bento-cell">
              <span className="bento-icon" aria-hidden="true">
                <Sparkle size={20} weight="duotone" />
              </span>
              <h3>AI that knows your vault</h3>
              <p>
                Ask in plain language — &quot;find my photos&quot;, &quot;how much storage do I
                have?&quot;, &quot;star the report&quot;. The assistant searches, organizes, and
                manages your files for you.
              </p>
              <div className="term-card">
                <div><span className="dim">you: </span>find my photos</div>
                <div>
                  <span className="dim">vault ai: </span>Found 12 files matching
                  &quot;photos&quot; <span className="ok">[shown]</span>
                </div>
                <div><span className="dim">you: </span>star the newest one</div>
                <div>
                  <span className="dim">vault ai: </span>Starred
                  &quot;vacation-2026.jpg&quot; <span className="ok">[done]</span>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal className="bento-wide" delay={0.08}>
            <div className="bento-cell">
              <span className="bento-icon" aria-hidden="true">
                <ShieldCheck size={20} weight="duotone" />
              </span>
              <h3>Encrypted at rest</h3>
              <p>
                Objects live private in S3 with server-side AES-256 encryption and stream to your
                browser over TLS. Downloads are forced to attachment.
              </p>
              <div className="term-card">
                <div>
                  <span className="dim">$ </span>vault share launch-assets.zip
                </div>
                <div>storage&nbsp;&nbsp;&nbsp;-&gt; s3://vault/private&nbsp;&nbsp;<span className="ok">[ok]</span></div>
                <div>encryption -&gt; SSE-AES256&nbsp;&nbsp;<span className="ok">[ok]</span></div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}