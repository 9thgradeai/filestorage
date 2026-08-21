'use client';

import { useState, useEffect } from 'react';
import { Sparkle, X } from '@phosphor-icons/react';

export default function ChatButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener('ai:toggle', toggle);
    return () => window.removeEventListener('ai:toggle', toggle);
  }, []);

  return (
    <button
      className="ai-fab"
      aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
      onClick={() => window.dispatchEvent(new Event('ai:toggle'))}
    >
      {open ? <X size={20} weight="bold" /> : <Sparkle size={20} weight="fill" />}
    </button>
  );
}
