'use client';

import Reveal from './Reveal';

function Terminal() {
  return (
    <div className="term-card">
      <div>
        <span className="dim">$ </span>vault inspect contract.pdf
      </div>
      <div>mime_type&nbsp;&nbsp;&nbsp;-&gt; application/pdf&nbsp;&nbsp;<span className="ok">[ok]</span></div>
      <div>magic_bytes -&gt; %PDF-1.7&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="ok">[ok]</span></div>
      <div>size&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-&gt; 2.4 MB&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="ok">[ok]</span></div>
      <div>extension&nbsp;&nbsp;-&gt; matches magic&nbsp;&nbsp;<span className="ok">[ok]</span></div>
      <div>
        verdict&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-&gt; <span className="ok">accepted → s3://vault/private</span>
      </div>
    </div>
  );
}

function ShareCard() {
  return (
    <div className="link-card">
      <div className="dim">vault share launch-assets.zip</div>
      <div className="link-url">https://…/shared/9f2c1e8d…a41e</div>
      <div className="row" style={{ gap: '0.35rem', marginTop: '0.5rem' }}>
        <span className="pulse-dot" style={{ width: 7, height: 7 }} />
        <span>expires_in_secs = 604800</span>
      </div>
      <div>status = public · streamed = attachment</div>
    </div>
  );
}

function Controls() {
  return (
    <div className="term-card">
      <div>
        <span className="dim">$ </span>vault files list
      </div>
      <div>contract-signed.pdf&nbsp;&nbsp;&nbsp;<span className="ok">[public]</span></div>
      <div>q3-revenue.csv&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="ok">[private]</span></div>
      <div>
        <span className="dim">$ </span>vault revoke launch-assets.zip
      </div>
      <div>
        revoked&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="ok">[ok]</span>
      </div>
    </div>
  );
}

const CARDS = [
  {
    num: '01',
    title: 'Upload. We check the bytes, not the extension.',
    body: 'Files are written to a temp file and inspected against their magic numbers before anything reaches S3. Extension and MIME mismatches are rejected on the spot.',
    visual: <Terminal />,
  },
  {
    num: '02',
    title: 'Share on a timer, not forever.',
    body: 'Flip a file public and a share link is minted with an expiry. When it lapses, the link is dead before anyone can ask how to revoke it.',
    visual: <ShareCard />,
  },
  {
    num: '03',
    title: 'Control everything from one place.',
    body: 'Toggle files private, revoke public links, or delete the object from S3 entirely. Star what matters, trash what does not, and restore it later if you change your mind.',
    visual: <Controls />,
  },
];

export default function StickyStack() {
  return (
    <div className="section-pad" style={{ paddingTop: '4rem' }}>
      <div className="container">
        <div className="sticky-stack">
          {CARDS.map((card) => (
            <Reveal key={card.num}>
              <div className="sticky-card">
                <div className="sticky-card-head">
                  <div className="sticky-copy">
                    <div className="sticky-num">{card.num}</div>
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </div>
                  <div>{card.visual}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}