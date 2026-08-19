'use client';

import { CloudArrowUp, LinkSimple, SlidersHorizontal } from '@phosphor-icons/react';
import Reveal from './Reveal';

const STEPS = [
  {
    icon: CloudArrowUp,
    num: '01',
    title: 'Upload',
    body: 'Drop a file. Magic-byte validation runs before it is stored, so bad files never make it.',
  },
  {
    icon: LinkSimple,
    num: '02',
    title: 'Share',
    body: 'Toggle a file public and mint a share link with an expiry. Share it anywhere.',
  },
  {
    icon: SlidersHorizontal,
    num: '03',
    title: 'Control',
    body: 'Revoke access, flip files private, or delete them from S3 at any time.',
  },
];

export default function HowItWorks() {
  return (
    <div className="section-pad" style={{ paddingTop: 0 }}>
      <div className="container">
        <Reveal>
          <div className="steps" style={{ marginTop: '1rem' }}>
            {STEPS.map((s) => (
              <div key={s.num} className="step">
                <span className="step-num">
                  <s.icon size={15} weight="bold" /> {s.num}
                </span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  );
}